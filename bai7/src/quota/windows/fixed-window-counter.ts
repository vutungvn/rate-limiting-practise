import { QuotaWindow } from './quota-window';

/**
 * Cua so co dinh theo lich - dung cho tang "moi ngay".
 * Han muc ngay la han muc goi cuoc: nha ban hang can mot moc reset de hieu, de doi soat
 * (00:00 gio Viet Nam), khong can chong dot bien tung giay - viec do tang "moi phut" da lo.
 */
export class FixedWindowCounter implements QuotaWindow {
  private counters = new Map<string, { windowStart: number; count: number }>();

  constructor(
    private readonly windowMs: number,
    private readonly utcOffsetMs = 0,
  ) {}

  used(key: string, now: number): number {
    const c = this.counters.get(key);
    return c && c.windowStart === this.windowStart(now) ? c.count : 0;
  }

  record(key: string, now: number): void {
    const windowStart = this.windowStart(now);
    const c = this.counters.get(key);
    if (c && c.windowStart === windowStart) c.count += 1;
    else this.counters.set(key, { windowStart, count: 1 });
  }

  msUntilAllowed(key: string, now: number, limit: number): number {
    return this.used(key, now) < limit ? 0 : this.msUntilReset(key, now);
  }

  msUntilReset(_key: string, now: number): number {
    return this.windowStart(now) + this.windowMs - now;
  }

  clear(): void {
    this.counters.clear();
  }

  private windowStart(now: number): number {
    return Math.floor((now + this.utcOffsetMs) / this.windowMs) * this.windowMs - this.utcOffsetMs;
  }
}
