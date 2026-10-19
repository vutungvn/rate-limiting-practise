import { QuotaWindow } from './quota-window';

/**
 * Nhat ky truot (luu moc thoi gian tung request) - dung cho endpoint xuat bao cao.
 * Chinh xac tuyet doi: khong bao gio co qua 10 lan trong BAT KY 60 phut nao. Han muc nho
 * (10/gio) nen moi khoa chi luu toi da 10 moc - re, va tai nguyen dat tien xung dang duoc chan chinh xac.
 */
export class SlidingLog implements QuotaWindow {
  private logs = new Map<string, number[]>();

  constructor(private readonly windowMs: number) {}

  used(key: string, now: number): number {
    return this.live(key, now).length;
  }

  record(key: string, now: number): void {
    this.logs.set(key, [...this.live(key, now), now]);
  }

  msUntilAllowed(key: string, now: number, limit: number): number {
    const hits = this.live(key, now);
    if (hits.length < limit) return 0;
    // Phai cho du so moc het han de con lai (limit - 1) moc.
    return hits[hits.length - limit] + this.windowMs - now;
  }

  msUntilReset(key: string, now: number): number {
    const hits = this.live(key, now);
    return hits.length ? hits[0] + this.windowMs - now : this.windowMs;
  }

  clear(): void {
    this.logs.clear();
  }

  private live(key: string, now: number): number[] {
    const hits = (this.logs.get(key) ?? []).filter((t) => t > now - this.windowMs);
    if (hits.length) this.logs.set(key, hits);
    else this.logs.delete(key);
    return hits;
  }
}
