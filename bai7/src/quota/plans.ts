// Chinh sach kinh doanh -> quy tac ky thuat. Moi con so cua phong kinh doanh nam o day.

export const SECOND = 1_000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
/** Han muc ngay reset luc 00:00 gio Viet Nam (UTC+7). */
export const VN_UTC_OFFSET = 7 * HOUR;

export const PLANS = ['free', 'pro', 'enterprise'] as const;
export type Plan = (typeof PLANS)[number];

export interface PlanLimits {
  displayName: string;
  perMinute: number;
  /** null = khong gioi han theo ngay. */
  perDay: number | null;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { displayName: 'Free', perMinute: 60, perDay: 5_000 },
  pro: { displayName: 'Pro', perMinute: 600, perDay: 200_000 },
  enterprise: { displayName: 'Enterprise', perMinute: 6_000, perDay: null },
};

/** Goi thap nhat: ap cho request khong co khoa / khoa sai / khoa bi thu hoi / du lieu goi bi hong. */
export const LOWEST_PLAN: Plan = 'free';

/** Han muc rieng cho endpoint ton tai nguyen - ap dung cho MOI goi, cong them vao han muc cua goi. */
export const ENDPOINT_LIMITS = {
  'report-export': { limit: 10, windowMs: HOUR, label: 'request/giờ cho endpoint xuất báo cáo (áp dụng cho mọi gói)' },
} as const;
export type EndpointQuota = keyof typeof ENDPOINT_LIMITS;

export const isPlan = (value: unknown): value is Plan => PLANS.includes(value as Plan);
