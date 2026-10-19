export interface Decision {
  allowed: boolean;
  /** So ms phai cho truoc khi gui (chi gao ro dang hang doi moi > 0). */
  delayMs: number;
}

/** Bo gioi han chay trong 1 tien trinh (hoac tuong duong 1 kho tap trung). `now` tinh bang ms. */
export interface Limiter {
  readonly name: string;
  tryAcquire(key: string, now: number): Decision;
}

export const ALLOW: Decision = { allowed: true, delayMs: 0 };
export const REJECT: Decision = { allowed: false, delayMs: 0 };
