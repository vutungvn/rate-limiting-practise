import { gcraReserve } from '../algorithms/gcra';

export interface Reservation {
  allowed: boolean;
  waitUs: number;
  /** TAT toan cuc ngay sau quyet dinh, theo dong ho cua kho. */
  tatUs: number;
}

/**
 * Kho "o gui" dung chung cho 6 tien trinh. Moi thao tac phai NGUYEN TU tren kho va dung
 * DONG HO CUA KHO (khong dung dong ho tung tien trinh -> khong lo lech gio giua cac may).
 */
export interface SlotStore {
  reserve(key: string, intervalUs: number, maxWaitUs: number): Promise<Reservation>;
  /** TAT = max(TAT, floorUs). Dung khi ket noi lai sau su co (xem PaymentRateLimiter). */
  raiseFloor(key: string, floorUs: number): Promise<void>;
}

/**
 * Ban trong bo nho cua SlotStore - cung ngu nghia voi script Lua tren Redis.
 * Dung cho test / mo phong: nhieu PaymentRateLimiter dung chung 1 instance = 6 tien trinh dung chung 1 Redis.
 * Co san cong tac gia lap su co: `failing` (Redis khong tra loi) va `wipe()` (failover mat du lieu).
 */
export class MemorySlotStore implements SlotStore {
  failing = false;
  private tats = new Map<string, number>();

  constructor(private readonly clockUs: () => number) {}

  async reserve(key: string, intervalUs: number, maxWaitUs: number): Promise<Reservation> {
    this.assertUp();
    const r = gcraReserve(this.tats.get(key), this.clockUs(), intervalUs, maxWaitUs);
    if (r.allowed) this.tats.set(key, r.tatUs);
    return r;
  }

  async raiseFloor(key: string, floorUs: number): Promise<void> {
    this.assertUp();
    this.tats.set(key, Math.max(this.tats.get(key) ?? 0, floorUs));
  }

  /** Gia lap failover sang replica chua kip nhan ban ghi moi nhat. */
  wipe(): void {
    this.tats.clear();
  }

  private assertUp() {
    if (this.failing) throw new Error('slot store unavailable');
  }
}
