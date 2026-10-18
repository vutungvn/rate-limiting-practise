import { FixedWindowLimiter } from '../src/limiter/fixed-window.limiter';
import { RateLimiter } from '../src/limiter/rate-limiter';
import { SlidingWindowLimiter } from '../src/limiter/sliding-window.limiter';

const SECOND = 1_000;
const MINUTE = 60 * SECOND;

/** Gui `n` request cung luc tai thoi diem `at`, tra ve so request duoc cho qua. */
function burst(limiter: RateLimiter, key: string, n: number, at: number): number {
  let allowed = 0;
  for (let i = 0; i < n; i++) if (limiter.isAllowed(key, at)) allowed++;
  return allowed;
}

/** Gui deu `perMinute` request moi phut trong `minutes` phut, tra ve so request bi chan. */
function steady(limiter: RateLimiter, key: string, perMinute: number, minutes: number, startAt = 0): number {
  const gap = MINUTE / perMinute;
  let blocked = 0;
  for (let i = 0; i < perMinute * minutes; i++) {
    if (!limiter.isAllowed(key, startAt + i * gap)) blocked++;
  }
  return blocked;
}

describe('Kich ban tan cong bien: 100 request o giay 59 + 100 request o giay 61', () => {
  it('Doi chung - cua so co dinh (thuat toan cu): ca 200 request deu lot qua', () => {
    const limiter = new FixedWindowLimiter();

    const atSecond59 = burst(limiter, 'attacker', 100, 59 * SECOND);
    const atSecond61 = burst(limiter, 'attacker', 100, 61 * SECOND);

    expect(atSecond59 + atSecond61).toBe(200);
  });

  it('Cua so truot: 100 request o giay 59 qua het, dot thu hai o giay 61 bi chan 98/100', () => {
    const limiter = new SlidingWindowLimiter();

    const atSecond59 = burst(limiter, 'attacker', 100, 59 * SECOND);
    // Giay 61: prev = 100, ti le con lai = 59/60 -> uoc luong = curr + 98.33
    // -> chi con cho cho 2 request (98.33 -> 99.33 -> 100.33 >= 100 thi chan).
    const atSecond61 = burst(limiter, 'attacker', 100, 61 * SECOND);

    expect(atSecond59).toBe(100);
    expect(atSecond61).toBe(2);
    expect(atSecond59 + atSecond61).toBe(102); // thay vi 200
  });

  it('Cua so truot: tan cong dung tai mep cua so (giay 59.999 va giay 60.000) cung bi chan', () => {
    const limiter = new SlidingWindowLimiter();

    burst(limiter, 'attacker', 100, 59_999);

    expect(burst(limiter, 'attacker', 100, 60_000)).toBe(0);
  });
});

describe('Luu luong hop le khong bi chan oan', () => {
  it('Deu dan 90 request/phut lien tuc 10 phut -> khong request nao bi chan', () => {
    expect(steady(new SlidingWindowLimiter(), 'user', 90, 10)).toBe(0);
  });

  it('Deu dan 90 request/phut, bat dau lech giua cua so (giay 37.5) -> khong bi chan', () => {
    expect(steady(new SlidingWindowLimiter(), 'user', 90, 10, 37_500)).toBe(0);
  });

  it('Deu dan 99 request/phut (sat han muc) -> khong bi chan', () => {
    expect(steady(new SlidingWindowLimiter(), 'user', 99, 10)).toBe(0);
  });

  it('Doi chung: deu dan 150 request/phut -> moi phut chi khoang 100 request duoc qua', () => {
    const limiter = new SlidingWindowLimiter();
    const blocked = steady(limiter, 'heavy', 150, 10);
    const allowedPerMinute = (150 * 10 - blocked) / 10;

    expect(allowedPerMinute).toBeGreaterThanOrEqual(99);
    expect(allowedPerMinute).toBeLessThanOrEqual(101);
  });
});

describe('Han muc co ban', () => {
  it('100 request dau tien trong cung 1 giay duoc qua, request thu 101 bi chan', () => {
    const limiter = new SlidingWindowLimiter();

    expect(burst(limiter, 'user', 100, 5 * SECOND)).toBe(100);
    expect(limiter.isAllowed('user', 5 * SECOND)).toBe(false);
  });

  it('Cac khoa doc lap: user-A het han muc khong anh huong user-B', () => {
    const limiter = new SlidingWindowLimiter();
    burst(limiter, 'user-A', 101, 10 * SECOND);

    expect(burst(limiter, 'user-B', 100, 10 * SECOND)).toBe(100);
  });

  it('Cong thuc: 80 request o cua so truoc, giua cua so moi (ti le 0.5) -> chi them duoc 60', () => {
    const limiter = new SlidingWindowLimiter();
    burst(limiter, 'user', 80, 10 * SECOND);

    // Giay 90 = giay 30 cua cua so moi -> uoc luong = curr + 80 * 0.5 = curr + 40
    expect(burst(limiter, 'user', 100, 90 * SECOND)).toBe(60);
  });

  it('Request bi chan khong lam tang bo dem (buoc 5)', () => {
    const limiter = new SlidingWindowLimiter();
    burst(limiter, 'user', 100, 0);
    burst(limiter, 'user', 1_000, 1 * SECOND); // 1000 request bi chan

    // Neu request bi chan cung bi dem, prev se la 1100 va giay 61 khong qua duoc request nao.
    expect(burst(limiter, 'user', 100, 61 * SECOND)).toBe(2);
  });
});

describe('Bay du lieu', () => {
  it('Khoa chua tung xuat hien -> xu ly binh thuong, khong nem loi', () => {
    const limiter = new SlidingWindowLimiter();

    expect(() => limiter.isAllowed('never-seen-before', Date.now())).not.toThrow();
    expect(new SlidingWindowLimiter().isAllowed('never-seen-before', Date.now())).toBe(true);
  });

  it('Khoa xuat hien lan cuoi cach day 10 phut -> so dem cu het han, duoc goi lai du 100 lan', () => {
    const limiter = new SlidingWindowLimiter();
    const lastSeen = Date.UTC(2026, 9, 17, 8, 0, 59); // 08:00:59
    expect(burst(limiter, 'idle-user', 101, lastSeen)).toBe(100); // da dung het han muc

    const tenMinutesLater = lastSeen + 10 * MINUTE;
    let allowed = 0;

    expect(() => (allowed = burst(limiter, 'idle-user', 101, tenMinutesLater))).not.toThrow();
    expect(allowed).toBe(100);
  });

  it('Bo trong dung 1 cua so (sang cua so thu 2) -> prev = 0, khong mang so dem cu sang', () => {
    const limiter = new SlidingWindowLimiter();
    burst(limiter, 'user', 100, 59 * SECOND); // cua so 0: 100 request

    // Giay 121 thuoc cua so 2. Cua so 1 (60s-120s) khong co request nao, nen prev phai la 0
    // (neu xoay vong ngay tho prev = curr = 100 thi o day chi qua duoc 2 request).
    expect(burst(limiter, 'user', 100, 121 * SECOND)).toBe(100);
  });

  it('Sang dung cua so ke tiep -> so dem cua so truoc VAN duoc tinh theo ti le', () => {
    const limiter = new SlidingWindowLimiter();
    burst(limiter, 'user', 100, 30 * SECOND); // cua so 0

    // Giay 75 = giay 15 cua cua so 1 -> uoc luong = curr + 100 * 45/60 = curr + 75
    expect(burst(limiter, 'user', 100, 75 * SECOND)).toBe(25);
  });
});
