/**
 * Chay THAT script Lua cua Redis (may ao Lua fengari) va doi chieu tung buoc voi gcraReserve()
 * - dam bao ban Redis va ban TypeScript la mot logic.
 *
 * Redis gia lap (TIME / GET / SET ... PX) viet bang chinh Lua; JS <-> Lua chi trao doi chuoi.
 * Luu y: so nguyen cua fengari chi 32 bit nen dong ho gia lap bat dau tu giay 10 (Redis that dung
 * Lua 5.1 so 64 bit, do chinh xac do duoc kiem trong redis.integration-spec.ts).
 */
import { lauxlib, lua, lualib, to_luastring } from 'fengari';
import { gcraReserve } from '../src/algorithms/gcra';
import { RAISE_FLOOR_LUA, RESERVE_LUA } from '../src/distributed/redis-slot-store';
import { rng } from '../src/simulation/traffic';

const FAKE_REDIS_LUA = `
__now = 0
__data = {}
__lastPx = 0
redis = {}
function redis.call(cmd, ...)
  local a = {...}
  if cmd == 'TIME' then
    return { tostring(__now // 1000000), tostring(__now % 1000000) }
  elseif cmd == 'GET' then
    local e = __data[a[1]]
    if e and e.exp > __now then return e.v end
    return false
  elseif cmd == 'SET' then
    assert(a[3] == 'PX', 'expected PX')
    __lastPx = tonumber(a[4])
    __data[a[1]] = { v = tostring(a[2]), exp = __now + tonumber(a[4]) * 1000 }
    return 'OK'
  end
  error('unsupported ' .. cmd)
end
function __tat(k)
  local e = __data[k]
  if e and e.exp > __now then return e.v end
  return ''
end
function __reserve(k, a1, a2)
  KEYS = {k}; ARGV = {a1, a2}
  local r = (function() ${RESERVE_LUA} end)()
  return r[1] .. ',' .. r[2] .. ',' .. r[3]
end
function __raise(k, a1)
  KEYS = {k}; ARGV = {a1}
  return tostring((function() ${RAISE_FLOOR_LUA} end)())
end
`;

const START_US = 10_000_000;

function createLua() {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const run = (code: string): string => {
    if (lauxlib.luaL_dostring(L, to_luastring(code)) !== lua.LUA_OK) throw new Error(lua.lua_tojsstring(L, -1));
    const out = lua.lua_gettop(L) > 0 ? lua.lua_tojsstring(L, -1) : '';
    lua.lua_settop(L, 0);
    return out;
  };
  run(FAKE_REDIS_LUA);

  let nowUs = START_US;
  run(`__now = ${nowUs}`);
  return {
    get nowUs() {
      return nowUs;
    },
    advance(us: number) {
      nowUs += us;
      run(`__now = ${nowUs}`);
    },
    reserve(intervalUs: number, maxWaitUs: number) {
      const [allowed, waitUs, tatUs] = run(`return __reserve("bank", "${intervalUs}", "${maxWaitUs}")`).split(',').map(Number);
      return { allowed: allowed === 1, waitUs, tatUs };
    },
    raiseFloor: (floorUs: number) => run(`return __raise("bank", "${floorUs}")`),
    tat() {
      const raw = run('return __tat("bank")');
      return raw === '' ? undefined : Number(raw);
    },
    lastPxMs: () => Number(run('return tostring(__lastPx)')),
  };
}

describe('Script Lua tren Redis (chay that bang may ao Lua)', () => {
  let r: ReturnType<typeof createLua>;
  beforeEach(() => {
    r = createLua();
  });

  it('khoa moi: gui ngay, TAT = now + interval', () => {
    expect(r.reserve(351, 25_000_000)).toEqual({ allowed: true, waitUs: 0, tatUs: START_US + 351 });
  });

  it('6.000 request cung micro giay: o gui cach deu 351 µs, khong trung o nao', () => {
    const waits = Array.from({ length: 6_000 }, () => r.reserve(351, 25_000_000).waitUs);

    expect(waits.findIndex((w, i) => w !== i * 351)).toBe(-1);
  });

  it('hang doi day -> tu choi, KHONG ghi lai TAT (request bi chan khong chiem o)', () => {
    for (let i = 0; i < 3; i++) r.reserve(1_000_000, 1_500_000);
    const before = r.tat();

    expect(r.reserve(1_000_000, 1_500_000).allowed).toBe(false);
    expect(r.tat()).toBe(before);
  });

  it('TTL cua khoa luon >= thoi gian TAT con hieu luc (khong het han khi con request xep hang)', () => {
    for (let i = 0; i < 1_000; i++) {
      const res = r.reserve(25_000, 25_000_000);
      expect(r.lastPxMs() * 1_000).toBeGreaterThanOrEqual(res.tatUs - r.nowUs);
    }
  });

  it('khoa het TTL (lau khong dung) -> coi nhu khoa moi, gui ngay', () => {
    r.reserve(351, 25_000_000);
    r.advance(5_000_000);

    expect(r.tat()).toBeUndefined();
    expect(r.reserve(351, 25_000_000).waitUs).toBe(0);
  });

  it('raiseFloor: TAT = max(TAT, floor); floor trong qua khu khong doi gi', () => {
    r.reserve(351, 25_000_000);
    const before = r.tat();

    r.raiseFloor(r.nowUs - 5_000_000);
    expect(r.tat()).toBe(before);

    r.raiseFloor(r.nowUs + 10_000_000);
    expect(r.tat()).toBe(r.nowUs + 10_000_000);
    expect(r.reserve(351, 25_000_000).waitUs).toBe(10_000_000);
  });

  it('doi chieu ngau nhien 3.000 buoc voi gcraReserve() (ke ca nhay thoi gian 30s, khoa het han)', () => {
    const random = rng(42);
    const mismatches: unknown[] = [];
    for (let step = 0; step < 3_000; step++) {
      r.advance(random() < 0.01 ? 30_000_000 : Math.floor(random() * 700));
      const intervalUs = [351, 1_000, 2_000][Math.floor(random() * 3)];
      const maxWaitUs = [0, 5_000, 25_000_000][Math.floor(random() * 3)];

      const expected = gcraReserve(r.tat(), r.nowUs, intervalUs, maxWaitUs);
      const got = r.reserve(intervalUs, maxWaitUs);
      if (JSON.stringify(got) !== JSON.stringify(expected)) mismatches.push({ step, expected, got });
    }

    expect(mismatches).toEqual([]);
  });
});
