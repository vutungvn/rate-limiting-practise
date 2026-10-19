import { Injectable } from '@nestjs/common';
import { CounterStore } from './counter-store';

interface Window {
  windowStart: number;
  prev: number;
  curr: number;
  windowMs: number;
}

/**
 * CounterStore trong bo nho. Moi ham khong co `await` ben trong -> trong Node chay tron mot luot,
 * tuong duong nguyen tu (giong 1 Lua script tren Redis).
 */
@Injectable()
export class InMemoryCounterStore implements CounterStore {
  private windows = new Map<string, Window>();
  private sets = new Map<string, Map<string, number>>();
  private totals = new Map<string, { total: number; expiresAt: number }>();

  async hit(key: string, windowMs: number, now: number): Promise<number> {
    // Cua so truot uoc luong (Bai 6): O(1) bo nho / khoa du bot ban hang nghin request.
    const windowStart = Math.floor(now / windowMs) * windowMs;
    let w = this.windows.get(key);
    if (!w || w.windowMs !== windowMs) {
      w = { windowStart, prev: 0, curr: 0, windowMs };
      this.windows.set(key, w);
    }
    if (windowStart > w.windowStart) {
      w.prev = windowStart - w.windowStart === windowMs ? w.curr : 0;
      w.curr = 0;
      w.windowStart = windowStart;
    }
    w.curr += 1;
    return w.curr + w.prev * ((windowMs - (now - windowStart)) / windowMs);
  }

  async distinct(key: string, member: string, now: number): Promise<{ size: number; has: boolean }> {
    const set = this.liveSet(key, now);
    return { size: set?.size ?? 0, has: set?.has(member) ?? false };
  }

  async addDistinct(key: string, member: string, ttlMs: number, now: number): Promise<void> {
    const set = this.liveSet(key, now) ?? new Map<string, number>();
    set.set(member, now + ttlMs);
    this.sets.set(key, set);
  }

  async addIfWithin(key: string, amount: number, max: number, ttlMs: number, now: number): Promise<{ ok: boolean; total: number }> {
    let t = this.totals.get(key);
    if (!t || t.expiresAt <= now) t = { total: 0, expiresAt: now + ttlMs };
    if (t.total + amount > max) {
      this.totals.set(key, t);
      return { ok: false, total: t.total };
    }
    t.total += amount;
    this.totals.set(key, t);
    return { ok: true, total: t.total };
  }

  async subtract(key: string, amount: number): Promise<void> {
    const t = this.totals.get(key);
    if (t) t.total = Math.max(0, t.total - amount);
  }

  async clear(): Promise<void> {
    this.windows.clear();
    this.sets.clear();
    this.totals.clear();
  }

  private liveSet(key: string, now: number): Map<string, number> | undefined {
    const set = this.sets.get(key);
    if (!set) return undefined;
    for (const [member, expiresAt] of set) if (expiresAt <= now) set.delete(member);
    if (!set.size) {
      this.sets.delete(key);
      return undefined;
    }
    return set;
  }
}
