import { intervalUsFor } from '../algorithms/gcra';
import { SlotStore } from './slot-store';

export interface PaymentRateLimiterOptions {
  /** Khoa dung chung giua 6 tien trinh, vd. "bank:partner-a". */
  key: string;
  /** Toc do gui toi da sang ngan hang (da tru bien an toan), vd. 2850. */
  ratePerSec: number;
  /** Thoi gian xep hang toi da; qua muc nay moi tu choi. */
  maxWaitMs: number;
  /** Kho khong tra loi trong khoang nay -> coi nhu su co. */
  storeTimeoutMs?: number;
  /** Sau su co, tu choi ngay (khong goi kho) trong khoang nay roi moi thu lai. */
  breakerOpenMs?: number;
  /** Bien an toan khi dung lai TAT sau su co (bu lech gio giua Redis cu/moi + request chua kip thay). */
  resumeMarginMs?: number;
  /** Chi tat de minh hoa vi sao can buoc nay (test / mo phong). */
  restoreFloorOnRecovery?: boolean;
  /** Dong ho cuc bo (ms) - chi dung cho circuit breaker, khong dung de xep o gui. */
  now?: () => number;
}

export type RejectReason = 'queue-full' | 'limiter-unavailable';

export class RateLimitRejectedError extends Error {
  constructor(
    readonly reason: RejectReason,
    readonly retryAfterMs: number,
  ) {
    super(
      reason === 'queue-full'
        ? `Cổng thanh toán đang quá tải, hàng đợi gửi ngân hàng đã đầy. Thử lại sau ${Math.ceil(retryAfterMs / 1000)} giây.`
        : `Bộ điều phối hạn mức tạm thời không sẵn sàng; giao dịch bị từ chối để bảo vệ kết nối ngân hàng. Thử lại sau ${Math.ceil(retryAfterMs / 1000)} giây.`,
    );
    this.name = 'RateLimitRejectedError';
  }
}

export interface Permit {
  /** So ms phai cho truoc khi goi ngan hang. */
  waitMs: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`slot store timeout after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Bo gioi han chay trong MOI tien trinh cua cong thanh toan. Ca 6 tien trinh dung chung 1 SlotStore (Redis).
 *
 * Su co kho (Redis sap / time out): FAIL-CLOSED - tu choi giao dich thay vi gui "mu".
 * Ly do: vuot 3.000 req/s = bi ngan hang cat ket noi 15 phut, thiet hai lon hon nhieu lan so voi
 * tu choi trong vai giay Redis failover (xem README muc C3).
 *
 * Ket noi lai: truoc khi dat o gui moi, nang TAT len it nhat TAT lon nhat tung thay (+ bien an toan).
 * Neu Redis vua failover sang replica bi mat TAT, buoc nay ngan lich moi chong len cac request cu
 * con dang xep hang trong cac tien trinh.
 */
export class PaymentRateLimiter {
  private readonly intervalUs: number;
  private readonly maxWaitUs: number;
  private readonly storeTimeoutMs: number;
  private readonly breakerOpenMs: number;
  private readonly resumeMarginUs: number;
  private readonly restoreFloorOnRecovery: boolean;
  private readonly now: () => number;

  private breakerOpenUntil = 0;
  private needsFloorRestore = false;
  private maxSeenTatUs = 0;

  constructor(
    private readonly store: SlotStore,
    private readonly options: PaymentRateLimiterOptions,
  ) {
    this.intervalUs = intervalUsFor(options.ratePerSec);
    this.maxWaitUs = options.maxWaitMs * 1_000;
    this.storeTimeoutMs = options.storeTimeoutMs ?? 50;
    this.breakerOpenMs = options.breakerOpenMs ?? 500;
    this.resumeMarginUs = (options.resumeMarginMs ?? 200) * 1_000;
    this.restoreFloorOnRecovery = options.restoreFloorOnRecovery ?? true;
    this.now = options.now ?? Date.now;
  }

  /** Xin mot o gui. Tra ve thoi gian phai cho, hoac nem RateLimitRejectedError. */
  async acquire(): Promise<Permit> {
    const now = this.now();
    if (now < this.breakerOpenUntil) {
      throw new RateLimitRejectedError('limiter-unavailable', this.breakerOpenUntil - now);
    }

    let reservation;
    try {
      if (this.needsFloorRestore) {
        if (this.restoreFloorOnRecovery) {
          await withTimeout(this.store.raiseFloor(this.options.key, this.maxSeenTatUs + this.resumeMarginUs), this.storeTimeoutMs);
        }
        this.needsFloorRestore = false;
      }
      reservation = await withTimeout(this.store.reserve(this.options.key, this.intervalUs, this.maxWaitUs), this.storeTimeoutMs);
    } catch {
      this.breakerOpenUntil = now + this.breakerOpenMs;
      this.needsFloorRestore = true;
      throw new RateLimitRejectedError('limiter-unavailable', this.breakerOpenMs);
    }

    this.maxSeenTatUs = Math.max(this.maxSeenTatUs, reservation.tatUs);
    if (!reservation.allowed) {
      throw new RateLimitRejectedError('queue-full', (reservation.waitUs - this.maxWaitUs) / 1_000);
    }
    return { waitMs: reservation.waitUs / 1_000 };
  }

  /** Xin o gui, cho dung luot roi moi goi ngan hang. */
  async run<T>(callBank: () => Promise<T>): Promise<T> {
    const { waitMs } = await this.acquire();
    if (waitMs > 0) await sleep(waitMs);
    return callBank();
  }
}
