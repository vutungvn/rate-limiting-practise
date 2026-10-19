import { ALLOW, Decision, Limiter, REJECT } from './types';

/**
 * (d) Gao token: gao chua toi da `burst` token, nap them `ratePerSec` token/giay; moi request lay 1 token.
 * So request toi da trong BAT KY khoang T giay = burst + ratePerSec * T.
 * -> Muon "khong bao gio qua L/giay" thi phai chon burst + ratePerSec <= L.
 */
export class TokenBucket implements Limiter {
  readonly name: string;
  private buckets = new Map<string, { tokens: number; last: number }>();

  constructor(
    private readonly ratePerSec: number,
    private readonly burst: number,
  ) {
    this.name = `Gáo token (r=${ratePerSec}/s, B=${burst})`;
  }

  tryAcquire(key: string, now: number): Decision {
    const b = this.buckets.get(key) ?? { tokens: this.burst, last: now };
    b.tokens = Math.min(this.burst, b.tokens + ((now - b.last) * this.ratePerSec) / 1_000);
    b.last = now;
    this.buckets.set(key, b);

    if (b.tokens < 1) return REJECT;
    b.tokens -= 1;
    return ALLOW;
  }
}
