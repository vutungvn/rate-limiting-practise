/**
 * Khoa lai cac ket luan dinh luong trong README bang mo phong tai de bai (390.000 request, co dinh hat giong).
 */
import { FixedWindow } from '../src/algorithms/fixed-window';
import { LeakyBucketQueue } from '../src/algorithms/leaky-bucket-queue';
import { SlidingLog } from '../src/algorithms/sliding-log';
import { TokenBucket } from '../src/algorithms/token-bucket';
import { CHOSEN } from '../src/simulation/run-simulation';
import { simulateDistributed, simulatePartitioned, simulateShared } from '../src/simulation/simulate';
import { EXAM_PROFILE, generateTraffic } from '../src/simulation/traffic';

const p = EXAM_PROFILE;
const arrivals = generateTraffic(p);

describe('Mo phong tai de bai: 2.000 rps, dot x2,5 trong 30s, 6 tien trinh, jitter mang 0-20 ms', () => {
  it('cua so co dinh vi pham 3.000/s ngay ca khi dat bien an toan 2.850', () => {
    expect(simulateShared('fw', new FixedWindow(2_850), arrivals, p).violations).toBeGreaterThan(0);
  });

  it('gao token cau hinh "chieu dot bien" (B = r) vi pham', () => {
    expect(simulateShared('tb', new TokenBucket(2_850, 2_850), arrivals, p).violations).toBeGreaterThan(0);
  });

  it('nhat ky truot an toan nhung chan > 60.000 giao dich trong dot dot bien', () => {
    const r = simulateShared('sl', new SlidingLog(2_850), arrivals, p);
    expect(r.violations).toBe(0);
    expect(r.rejectedPeak).toBeGreaterThan(60_000);
  });

  it('GCRA khong co hang doi (cho 0s) chan oan ca trong gio thuong vi luong Poisson co luc den sat nhau', () => {
    expect(simulateShared('g0', new LeakyBucketQueue(2_850, 0), arrivals, p).rejectedNormal).toBeGreaterThan(0);
  });

  it('★ phuong an chon (6 tien trinh + kho chung, 2.850/s, cho <= 25s): 0 vi pham, 0 giao dich bi chan', async () => {
    const r = await simulateDistributed('chosen', CHOSEN, arrivals, p);
    expect(r.violations).toBe(0);
    expect(r.maxPerSecond).toBeLessThanOrEqual(3_000);
    expect(r.rejectedTotal).toBe(0);
    expect(r.delayMaxMs).toBeLessThanOrEqual(25_000);
  });

  it('★ Redis sap 3s + failover mat TAT: van 0 vi pham; chi tu choi trong luc sap', async () => {
    const r = await simulateDistributed('incident', CHOSEN, arrivals, p, { downFromS: 50, upAtS: 53, wipeOnRecovery: true });
    expect(r.violations).toBe(0);
    expect(r.rejectedPeak).toBeLessThan(5_000 * 3 * 1.1);
  });

  it('doi chung: khong nang TAT sau failover -> vuot 3.000/s', async () => {
    const r = await simulateDistributed('no-restore', { ...CHOSEN, restoreFloorOnRecovery: false }, arrivals, p, {
      downFromS: 50,
      upAtS: 53,
      wipeOnRecovery: true,
    });
    expect(r.violations).toBeGreaterThan(0);
  });

  it('chia tinh 6 x 475/s chan oan ngay trong gio thuong khi bo can bang tai lech; kho chung thi khong', async () => {
    const normal = { ...p, durationS: 900, spike: { ...p.spike, multiplier: 1 } };
    const normalArrivals = generateTraffic(normal);

    const partitioned = simulatePartitioned('split', () => new LeakyBucketQueue(475, 25_000), normalArrivals, normal);
    const shared = await simulateDistributed('shared', CHOSEN, normalArrivals, normal);

    expect(partitioned.rejectedTotal).toBeGreaterThan(5_000);
    expect(shared.rejectedTotal).toBe(0);
  });
});
