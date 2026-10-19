import Redis from 'ioredis';
import { Reservation, SlotStore } from './slot-store';

/**
 * GCRA tren Redis - ban dich 1-1 cua gcraReserve() trong src/algorithms/gcra.ts.
 * - Lua chay NGUYEN TU tren Redis -> 6 tien trinh khong bao gio dat trung o gui.
 * - Dung `redis.call('TIME')` -> mot dong ho duy nhat cho ca he thong.
 * - Moi khoa chi 1 so nguyen (TAT, micro giay). TTL = luc TAT het tac dung + 1s, khong bao gio
 *   het han khi con request dang xep hang (het han som = mat TAT = dat trung o gui).
 *
 * KEYS[1] = khoa TAT   ARGV[1] = intervalUs   ARGV[2] = maxWaitUs
 * Tra ve {allowed (0|1), waitUs, tatUs}
 */
export const RESERVE_LUA = `
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000000 + tonumber(t[2])
local interval = tonumber(ARGV[1])
local maxWait = tonumber(ARGV[2])
local tat = now
local raw = redis.call('GET', KEYS[1])
if raw then
  local stored = tonumber(raw)
  if stored > now then tat = stored end
end
local wait = tat - now
if wait > maxWait then
  return {0, wait, tat}
end
local newTat = tat + interval
redis.call('SET', KEYS[1], string.format('%d', newTat), 'PX', math.ceil((newTat - now) / 1000) + 1000)
return {1, wait, newTat}
`;

/** KEYS[1] = khoa TAT   ARGV[1] = floorUs.  TAT = max(TAT, floor). Tra ve TAT moi. */
export const RAISE_FLOOR_LUA = `
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000000 + tonumber(t[2])
local floor = tonumber(ARGV[1])
local raw = redis.call('GET', KEYS[1])
local tat = raw and tonumber(raw) or 0
if floor > tat then tat = floor end
if tat > now then
  redis.call('SET', KEYS[1], string.format('%d', tat), 'PX', math.ceil((tat - now) / 1000) + 1000)
end
return tat
`;

type GcraRedis = Redis & {
  gcraReserve(key: string, intervalUs: number, maxWaitUs: number): Promise<[number, number, number]>;
  gcraRaiseFloor(key: string, floorUs: number): Promise<number>;
};

/**
 * Khuyen nghi cau hinh client: `enableOfflineQueue: false`, `maxRetriesPerRequest: 0`
 * de lenh loi NGAY khi mat ket noi (fail-closed nhanh) thay vi xep hang cho Redis quay lai.
 */
export class RedisSlotStore implements SlotStore {
  private readonly redis: GcraRedis;

  constructor(redis: Redis) {
    redis.defineCommand('gcraReserve', { numberOfKeys: 1, lua: RESERVE_LUA });
    redis.defineCommand('gcraRaiseFloor', { numberOfKeys: 1, lua: RAISE_FLOOR_LUA });
    this.redis = redis as GcraRedis;
  }

  async reserve(key: string, intervalUs: number, maxWaitUs: number): Promise<Reservation> {
    const [allowed, waitUs, tatUs] = await this.redis.gcraReserve(key, intervalUs, maxWaitUs);
    return { allowed: allowed === 1, waitUs, tatUs };
  }

  async raiseFloor(key: string, floorUs: number): Promise<void> {
    await this.redis.gcraRaiseFloor(key, Math.ceil(floorUs));
  }
}
