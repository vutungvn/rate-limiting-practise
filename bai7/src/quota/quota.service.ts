import { Injectable } from '@nestjs/common';
import { DAY, ENDPOINT_LIMITS, EndpointQuota, MINUTE, PLAN_LIMITS, Plan, VN_UTC_OFFSET } from './plans';
import { FixedWindowCounter } from './windows/fixed-window-counter';
import { QuotaWindow } from './windows/quota-window';
import { SlidingLog } from './windows/sliding-log';
import { SlidingWindowCounter } from './windows/sliding-window-counter';

/** Ten tang, dung lam hau to header: X-RateLimit-Remaining-<Tier>. */
export type TierName = 'Minute' | 'Day' | 'Export-Hour';

interface TierRule {
  name: TierName;
  limit: number;
  label: string;
  window: QuotaWindow;
}

export interface TierResult {
  name: TierName;
  limit: number;
  label: string;
  remaining: number;
  resetSeconds: number;
  blocked: boolean;
  retryAfterSeconds: number;
}

export interface QuotaDecision {
  allowed: boolean;
  plan: Plan;
  tiers: TierResult[];
}

const fmt = (n: number) => n.toLocaleString('vi-VN');

@Injectable()
export class QuotaService {
  private readonly perMinute = new SlidingWindowCounter(MINUTE);
  private readonly perDay = new FixedWindowCounter(DAY, VN_UTC_OFFSET);
  private readonly perEndpoint = new SlidingLog(ENDPOINT_LIMITS['report-export'].windowMs);

  /**
   * Quyet dinh cho 1 request. `subject` la dinh danh bo dem (seller:<id> hoac ip:<ip>) - KHONG
   * chua ten goi, nen doi goi giua chung van dung tiep bo dem cu voi han muc moi.
   */
  consume(subject: string, plan: Plan, endpoint: EndpointQuota | undefined, now: number): QuotaDecision {
    const checks = this.rulesFor(plan, endpoint).map((rule) => {
      const key = `${subject}|${rule.name}`;
      return { rule, key, used: rule.window.used(key, now) };
    });

    // Tat ca hoac khong: chi ghi nhan khi MOI tang con cho. Request bi mot tang chan
    // khong duoc an vao han muc cua cac tang khac.
    const allowed = checks.every((c) => c.used < c.rule.limit);
    if (allowed) checks.forEach((c) => c.rule.window.record(c.key, now));

    const tiers = checks.map(({ rule, key, used }): TierResult => {
      const blocked = used >= rule.limit;
      const usedAfter = allowed ? used + 1 : used;
      return {
        name: rule.name,
        limit: rule.limit,
        label: rule.label,
        remaining: Math.max(0, Math.floor(rule.limit - usedAfter)),
        resetSeconds: Math.ceil(rule.window.msUntilReset(key, now) / 1000),
        blocked,
        retryAfterSeconds: blocked ? Math.ceil(rule.window.msUntilAllowed(key, now, rule.limit) / 1000) : 0,
      };
    });

    return { allowed, plan, tiers };
  }

  clear(): void {
    [this.perMinute, this.perDay, this.perEndpoint].forEach((w) => w.clear());
  }

  private rulesFor(plan: Plan, endpoint: EndpointQuota | undefined): TierRule[] {
    const limits = PLAN_LIMITS[plan];
    const rules: TierRule[] = [
      { name: 'Minute', limit: limits.perMinute, label: `${fmt(limits.perMinute)} request/phút của gói ${limits.displayName}`, window: this.perMinute },
    ];
    if (limits.perDay !== null) {
      rules.push({
        name: 'Day',
        limit: limits.perDay,
        label: `${fmt(limits.perDay)} request/ngày của gói ${limits.displayName} (reset lúc 00:00 giờ Việt Nam)`,
        window: this.perDay,
      });
    }
    if (endpoint) {
      const e = ENDPOINT_LIMITS[endpoint];
      rules.push({ name: 'Export-Hour', limit: e.limit, label: `${fmt(e.limit)} ${e.label}`, window: this.perEndpoint });
    }
    return rules;
  }
}
