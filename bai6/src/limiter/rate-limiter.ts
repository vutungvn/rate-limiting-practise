export interface RateLimiter {
  /** Tra ve true neu request cua `key` tai thoi diem `now` (ms) duoc cho qua. */
  isAllowed(key: string, now: number): boolean;
}

export const RATE_LIMITER = Symbol('RATE_LIMITER');
