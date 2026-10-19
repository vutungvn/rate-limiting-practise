import { EndpointQuota, Plan } from '../src/quota/plans';
import { QuotaDecision, QuotaService } from '../src/quota/quota.service';

/** 01:00 sang 18/10/2026 gio Viet Nam - du xa moc 00:00 de cac kich ban trong ngay khong vat sang ngay moi. */
export const T0 = Date.UTC(2026, 9, 17, 18, 0, 0);

export interface RunResult {
  allowed: number;
  blocked: number;
  last: QuotaDecision;
}

/** Goi `n` request; `at(i)` tra ve thoi diem (ms) cua request thu i. */
export function run(
  quota: QuotaService,
  subject: string,
  plan: Plan,
  n: number,
  at: (i: number) => number,
  endpoint?: EndpointQuota,
): RunResult {
  let allowed = 0;
  let last!: QuotaDecision;
  for (let i = 0; i < n; i++) {
    last = quota.consume(subject, plan, endpoint, at(i));
    if (last.allowed) allowed++;
  }
  return { allowed, blocked: n - allowed, last };
}

export const blockedTiers = (d: QuotaDecision) => d.tiers.filter((t) => t.blocked).map((t) => t.name);
export const tier = (d: QuotaDecision, name: string) => d.tiers.find((t) => t.name === name);
