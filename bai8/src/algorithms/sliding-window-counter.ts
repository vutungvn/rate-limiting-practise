import { ALLOW, Decision, Limiter, REJECT } from './types';

/** (c) Bo dem cua so truot (nhu Bai 6): uoc luong = curr + prev * phan con lai cua cua so truoc. */
export class SlidingWindowCounter implements Limiter {
  readonly name: string;
  private counters = new Map<string, { windowStart: number; prev: number; curr: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs = 1_000,
  ) {
    this.name = `Bộ đếm cửa sổ trượt (${limit}/s)`;
  }

  tryAcquire(key: string, now: number): Decision {
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs;
    const c = this.counters.get(key) ?? { windowStart, prev: 0, curr: 0 };
    if (windowStart > c.windowStart) {
      c.prev = windowStart - c.windowStart === this.windowMs ? c.curr : 0;
      c.curr = 0;
      c.windowStart = windowStart;
    }
    this.counters.set(key, c);

    const estimated = c.curr + c.prev * ((this.windowMs - (now - windowStart)) / this.windowMs);
    if (estimated >= this.limit) return REJECT;
    c.curr += 1;
    return ALLOW;
  }
}
