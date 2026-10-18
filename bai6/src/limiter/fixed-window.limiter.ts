import { RateLimiter } from './rate-limiter';

/**
 * Thuat toan CU (cua so co dinh) - chi giu lai de doi chung trong test.
 * Loi bien: 100 request o giay 59 + 100 request o giay 61 roi vao 2 cua so khac nhau,
 * nen ca 200 request deu duoc cho qua trong vong 2 giay.
 */
export class FixedWindowLimiter implements RateLimiter {
  private counters = new Map<string, { windowStart: number; count: number }>();
  private readonly windowMs = 60_000;
  private readonly limit = 100;

  isAllowed(key: string, now: number): boolean {
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs;
    let c = this.counters.get(key);
    if (!c || c.windowStart !== windowStart) {
      c = { windowStart, count: 0 };
      this.counters.set(key, c);
    }

    if (c.count >= this.limit) return false;
    c.count += 1;
    return true;
  }
}
