import { RateLimiter } from './rate-limiter';

/**
 * Bo dem cua so truot (sliding window counter).
 *
 * So request trong 60 giay vua qua duoc UOC LUONG bang:
 *   curr + prev * (phan thoi gian cua cua so truoc con nam trong 60 giay vua qua)
 * voi gia dinh cac request cua cua so truoc rai deu theo thoi gian.
 */
export class SlidingWindowLimiter implements RateLimiter {
  // Bo sung `windowStart` so voi khung de bai: phai biet `curr` dang dem cho cua so nao
  // thi moi phat hien duoc luc sang cua so moi (1) va khoa da bo trong bao lau (bay du lieu).
  private counters = new Map<string, { windowStart: number; prev: number; curr: number }>();

  private readonly windowMs = 60_000;

  private readonly limit = 100;

  isAllowed(key: string, now: number): boolean {
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs;
    // Khoa chua tung xuat hien: khoi tao bo dem rong, khong nem loi.
    const c = this.counters.get(key) ?? { windowStart, prev: 0, curr: 0 };

    // (1) Xoay vong khi da sang cua so moi.
    //     - Sang dung cua so KE TIEP: so dem hien tai tro thanh so dem cua so truoc.
    //     - Bo trong tu 2 cua so tro len (vd. 10 phut khong dung): cua so ngay truoc khong co
    //       request nao, nen prev = 0 - so dem cu coi nhu het han, khong cong don.
    if (windowStart > c.windowStart) {
      const windowsPassed = (windowStart - c.windowStart) / this.windowMs;
      c.prev = windowsPassed === 1 ? c.curr : 0;
      c.curr = 0;
      c.windowStart = windowStart;
    }
    this.counters.set(key, c);

    // (2) Ti le phan con lai cua cua so truoc nam trong 60 giay vua qua.
    //     Vd. dang o giay thu 15 cua cua so moi -> 45/60 = 0.75 cua so truoc con duoc tinh.
    const elapsedInCurrent = now - c.windowStart;
    const prevWeight = (this.windowMs - elapsedInCurrent) / this.windowMs;

    // (3) Uoc luong tong so request trong 60 giay vua qua.
    const estimated = c.curr + c.prev * prevWeight;

    // (4) Neu da cham han muc thi chan. Dung `>=` vi request nay se la request thu (estimated + 1).
    if (estimated >= this.limit) return false;

    // (5) Chi tang bo dem khi request duoc cho qua: request bi chan khong tieu ton han muc.
    c.curr += 1;
    return true;
  }
}
