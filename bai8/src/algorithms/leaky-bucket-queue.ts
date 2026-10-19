import { gcraReserve, intervalUsFor } from './gcra';
import { Decision, Limiter } from './types';

/**
 * (e) Gao ro dang hang doi: request vao "gao", ri ra deu dan voi toc do `ratePerSec`.
 * Khong tu choi ngay khi vuot toc do ma xep hang cho toi da `maxWaitMs`; chi tu choi khi gao day.
 * Ban 1 tien trinh - ban phan tan dung chung logic qua SlotStore (src/distributed).
 */
export class LeakyBucketQueue implements Limiter {
  readonly name: string;
  private readonly intervalUs: number;
  private tats = new Map<string, number>();

  constructor(
    ratePerSec: number,
    private readonly maxWaitMs: number,
  ) {
    this.intervalUs = intervalUsFor(ratePerSec);
    this.name = `Gáo rò hàng đợi / GCRA (${ratePerSec}/s, chờ ≤ ${maxWaitMs / 1000}s)`;
  }

  tryAcquire(key: string, now: number): Decision {
    const nowUs = Math.round(now * 1_000);
    const r = gcraReserve(this.tats.get(key), nowUs, this.intervalUs, this.maxWaitMs * 1_000);
    if (r.allowed) this.tats.set(key, r.tatUs);
    return { allowed: r.allowed, delayMs: r.allowed ? r.waitUs / 1_000 : 0 };
  }
}
