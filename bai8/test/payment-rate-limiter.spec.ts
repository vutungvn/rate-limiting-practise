/**
 * PaymentRateLimiter - 6 tien trinh dung chung 1 kho; xu ly su co kho theo kieu fail-closed.
 */
import { PaymentRateLimiter, RateLimitRejectedError } from '../src/distributed/payment-rate-limiter';
import { MemorySlotStore, Reservation, SlotStore } from '../src/distributed/slot-store';
import { maxInAnyWindow } from '../src/simulation/metrics';

const OPTIONS = { key: 'bank', ratePerSec: 2_850, maxWaitMs: 25_000, breakerOpenMs: 500 };

function setup(overrides: Partial<typeof OPTIONS & { restoreFloorOnRecovery: boolean }> = {}) {
  let nowMs = 1_000_000;
  const store = new MemorySlotStore(() => nowMs * 1_000);
  const processes = Array.from({ length: 6 }, () => new PaymentRateLimiter(store, { ...OPTIONS, ...overrides, now: () => nowMs }));
  return {
    store,
    processes,
    advance: (ms: number) => (nowMs += ms),
    now: () => nowMs,
  };
}

const rejection = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof RateLimitRejectedError) return e;
    throw e;
  }
  throw new Error('expected RateLimitRejectedError');
};

describe('Dong bo giua 6 tien trinh qua kho chung', () => {
  it('6 tien trinh cung xin 12.000 o trong 1 khoanh khac: khong trung o, moi giay toi da 2.850', async () => {
    const { processes, now } = setup();
    const sendTimes: number[] = [];
    for (let i = 0; i < 12_000; i++) {
      const { waitMs } = await processes[i % 6].acquire();
      sendTimes.push(now() + waitMs);
    }
    sendTimes.sort((a, b) => a - b);

    expect(new Set(sendTimes).size).toBe(12_000);
    expect(maxInAnyWindow(sendTimes)).toBeLessThanOrEqual(2_850);
  });

  it('can bang tai lech (mot tien trinh nhan 100% luu luong) van dung toan bo 2.850/s - khong chan oan', async () => {
    const { processes } = setup();
    let ok = 0;
    for (let i = 0; i < 2_850; i++) if ((await processes[0].acquire()).waitMs < 1_000) ok++;

    expect(ok).toBe(2_850);
  });

  it('vuot thoi gian cho toi da -> tu choi "queue-full" kem thoi gian nen thu lai', async () => {
    const { processes } = setup({ maxWaitMs: 1_000 });
    for (let i = 0; i < 2_850; i++) await processes[i % 6].acquire();

    const e = await rejection(processes[0].acquire());
    expect(e.reason).toBe('queue-full');
    expect(e.retryAfterMs).toBeGreaterThan(0);
    expect(e.message).toContain('hàng đợi gửi ngân hàng đã đầy');
  });
});

describe('Su co kho (Redis) - fail-closed', () => {
  it('kho loi -> tu choi "limiter-unavailable", khong gui mu sang ngan hang', async () => {
    const { store, processes } = setup();
    store.failing = true;

    const e = await rejection(processes[0].acquire());
    expect(e.reason).toBe('limiter-unavailable');
  });

  it('circuit breaker: trong 500 ms sau su co khong goi kho nua; het 500 ms thu lai va hoi phuc', async () => {
    const { store, processes, advance } = setup();
    store.failing = true;
    await rejection(processes[0].acquire());
    store.failing = false;
    const spy = jest.spyOn(store, 'reserve');

    await rejection(processes[0].acquire());
    expect(spy).not.toHaveBeenCalled();

    advance(500);
    await expect(processes[0].acquire()).resolves.toEqual({ waitMs: 0 });
  });

  it('kho treo (khong tra loi) -> tu choi sau storeTimeoutMs, khong treo giao dich', async () => {
    const hanging: SlotStore = {
      reserve: () => new Promise<Reservation>(() => undefined),
      raiseFloor: () => new Promise<void>(() => undefined),
    };
    const limiter = new PaymentRateLimiter(hanging, { ...OPTIONS, storeTimeoutMs: 20 });
    const started = Date.now();

    const e = await rejection(limiter.acquire());
    expect(e.reason).toBe('limiter-unavailable');
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('failover mat TAT: khi ket noi lai, TAT duoc nang len -> lich moi KHONG chong len request cu dang xep hang', async () => {
    const { store, processes, advance, now } = setup();
    // Dot bien: xep hang 10 giay o gui.
    let lastOldSend = 0;
    for (let i = 0; i < 28_500; i++) lastOldSend = now() + (await processes[i % 6].acquire()).waitMs;

    store.failing = true;
    await rejection(processes[0].acquire());
    advance(600);
    store.failing = false;
    store.wipe(); // replica moi khong co TAT

    const firstNewSend = now() + (await processes[0].acquire()).waitMs;
    expect(firstNewSend).toBeGreaterThan(lastOldSend);
  });

  it('doi chung: KHONG nang TAT thi request moi duoc gui ngay, chong len hang doi cu (se vuot 3.000/s)', async () => {
    const { store, processes, advance, now } = setup({ restoreFloorOnRecovery: false });
    let lastOldSend = 0;
    for (let i = 0; i < 28_500; i++) lastOldSend = now() + (await processes[i % 6].acquire()).waitMs;

    store.failing = true;
    await rejection(processes[0].acquire());
    advance(600);
    store.failing = false;
    store.wipe();

    const firstNewSend = now() + (await processes[0].acquire()).waitMs;
    expect(firstNewSend).toBeLessThan(lastOldSend);
  });
});

describe('run(): cho dung luot roi moi goi ngan hang', () => {
  it('goi callBank sau dung waitMs', async () => {
    jest.useFakeTimers();
    try {
      const store = new MemorySlotStore(() => 0);
      const limiter = new PaymentRateLimiter(store, { ...OPTIONS, now: () => 0 });
      await limiter.acquire(); // chiem o dau -> request sau phai cho 351 µs
      for (let i = 0; i < 2_849; i++) await limiter.acquire(); // TAT = 2.850 * 351 µs ~ 1.000 ms

      const callBank = jest.fn().mockResolvedValue('OK');
      const result = limiter.run(callBank);
      await jest.advanceTimersByTimeAsync(999);
      expect(callBank).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(2);
      await expect(result).resolves.toBe('OK');
    } finally {
      jest.useRealTimers();
    }
  });
});
