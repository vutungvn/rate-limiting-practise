import { ALLOW, Decision, Limiter, REJECT } from './types';

/** (a) Cua so co dinh: dem trong o [k*W, (k+1)*W), sang o moi thi ve 0. */
export class FixedWindow implements Limiter {
  readonly name: string;
  private counters = new Map<string, { windowStart: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs = 1_000,
  ) {
    this.name = `Cửa sổ cố định (${limit}/s)`;
  }

  tryAcquire(key: string, now: number): Decision {
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs;
    let c = this.counters.get(key);
    if (!c || c.windowStart !== windowStart) {
      c = { windowStart, count: 0 };
      this.counters.set(key, c);
    }
    if (c.count >= this.limit) return REJECT;
    c.count += 1;
    return ALLOW;
  }
}
