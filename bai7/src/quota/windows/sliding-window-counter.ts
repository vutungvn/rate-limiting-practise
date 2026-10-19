import { QuotaWindow } from './quota-window';

interface Counter {
  windowStart: number;
  prev: number;
  curr: number;
}

/**
 * Cua so truot uoc luong (nhu Bai 6) - dung cho tang "moi phut".
 * Bo nho O(1) moi khoa du han muc lon (6.000/phut), khong bi lach o bien cua so.
 */
export class SlidingWindowCounter implements QuotaWindow {
  private counters = new Map<string, Counter>();

  constructor(private readonly windowMs: number) {}

  used(key: string, now: number): number {
    const c = this.current(key, now);
    const prevWeight = (this.windowMs - (now - c.windowStart)) / this.windowMs;
    return c.curr + c.prev * prevWeight;
  }

  record(key: string, now: number): void {
    const c = this.current(key, now);
    c.curr += 1;
    this.counters.set(key, c);
  }

  msUntilAllowed(key: string, now: number, limit: number): number {
    if (this.used(key, now) < limit) return 0;
    const c = this.current(key, now);
    const elapsed = now - c.windowStart;
    if (c.curr < limit) {
      // Doi phan cua so truoc "troi" ra khoi 60s gan nhat: curr + prev * (W - e) / W < limit
      const e = this.windowMs * (1 - (limit - c.curr) / c.prev);
      return Math.max(1, Math.ceil(e - elapsed) + 1);
    }
    // Cua so hien tai da tu no han muc: doi sang cua so sau, khi do prev = curr.
    const e = this.windowMs * (1 - limit / c.curr);
    return Math.ceil(this.windowMs - elapsed + e) + 1;
  }

  msUntilReset(key: string, now: number): number {
    return this.current(key, now).windowStart + this.windowMs - now;
  }

  clear(): void {
    this.counters.clear();
  }

  /** Lay bo dem da xoay vong toi cua so chua `now`; khoa moi / khoa lau khong dung -> so dem 0. */
  private current(key: string, now: number): Counter {
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs;
    const c = this.counters.get(key);
    if (!c) return { windowStart, prev: 0, curr: 0 };
    if (windowStart > c.windowStart) {
      c.prev = windowStart - c.windowStart === this.windowMs ? c.curr : 0;
      c.curr = 0;
      c.windowStart = windowStart;
    }
    return c;
  }
}
