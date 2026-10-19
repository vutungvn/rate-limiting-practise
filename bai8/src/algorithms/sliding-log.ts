import { ALLOW, Decision, Limiter, REJECT } from './types';

/** Vong dem co dinh `limit` phan tu: dung chinh xac 8 byte / moc thoi gian, khong cap phat them. */
interface Ring {
  buf: Float64Array;
  head: number;
  size: number;
}

/** (b) Nhat ky cua so truot: luu moc thoi gian tung request; chinh xac tuyet doi, ton bo nho O(limit). */
export class SlidingLog implements Limiter {
  readonly name: string;
  private logs = new Map<string, Ring>();

  constructor(
    private readonly limit: number,
    private readonly windowMs = 1_000,
  ) {
    this.name = `Nhật ký cửa sổ trượt (${limit}/s)`;
  }

  tryAcquire(key: string, now: number): Decision {
    let r = this.logs.get(key);
    if (!r) {
      r = { buf: new Float64Array(this.limit), head: 0, size: 0 };
      this.logs.set(key, r);
    }
    // Bo cac moc da ra khoi cua so (now - W, now].
    while (r.size > 0 && r.buf[r.head] <= now - this.windowMs) {
      r.head = (r.head + 1) % this.limit;
      r.size -= 1;
    }
    if (r.size >= this.limit) return REJECT;
    r.buf[(r.head + r.size) % this.limit] = now;
    r.size += 1;
    return ALLOW;
  }
}
