/**
 * Nam thuat toan - chung minh tinh chat "do chinh xac tai bien" va "chiu dot bien" bang du lieu.
 */
import { FixedWindow } from '../src/algorithms/fixed-window';
import { gcraReserve, intervalUsFor } from '../src/algorithms/gcra';
import { LeakyBucketQueue } from '../src/algorithms/leaky-bucket-queue';
import { SlidingLog } from '../src/algorithms/sliding-log';
import { SlidingWindowCounter } from '../src/algorithms/sliding-window-counter';
import { TokenBucket } from '../src/algorithms/token-bucket';
import { Limiter } from '../src/algorithms/types';
import { maxInAnyWindow } from '../src/simulation/metrics';

const burst = (l: Limiter, n: number, at: number) => {
  let ok = 0;
  for (let i = 0; i < n; i++) if (l.tryAcquire('bank', at).allowed) ok++;
  return ok;
};

/** Ban request deu moi `stepMs` trong `durationMs`, tra ve moc thoi gian (gui) cua cac request duoc qua. */
const saturate = (l: Limiter, durationMs: number, stepMs = 0.1) => {
  const sent: number[] = [];
  for (let t = 0; t < durationMs; t += stepMs) {
    const d = l.tryAcquire('bank', t);
    if (d.allowed) sent.push(t + d.delayMs);
  }
  return sent.sort((a, b) => a - b);
};

describe('Do chinh xac tai bien (tan cong 2 dot sat mep cua so)', () => {
  it('(a) Cua so co dinh: 3.000 o ms 999 + 3.000 o ms 1.000 -> 6.000 request trong 1 ms', () => {
    const l = new FixedWindow(3_000);
    expect(burst(l, 3_000, 999) + burst(l, 3_000, 1_000)).toBe(6_000);
  });

  it('(b) Nhat ky cua so truot: chinh xac tuyet doi - chi 3.000, toi ms 1.999 moi mo lai', () => {
    const l = new SlidingLog(3_000);
    expect(burst(l, 3_000, 999) + burst(l, 3_000, 1_000)).toBe(3_000);
    expect(l.tryAcquire('bank', 1_998).allowed).toBe(false);
    expect(l.tryAcquire('bank', 1_999).allowed).toBe(true);
  });

  it('(c) Bo dem cua so truot: uoc luong cho lot 3 request -> 3.003 trong 2 ms (vi pham "tuyet doi")', () => {
    const l = new SlidingWindowCounter(3_000);
    expect(burst(l, 3_000, 999) + burst(l, 3_000, 1_001)).toBe(3_003);
  });

  it('(d) Gao token: tran trong 1 giay bat ky = B + r', () => {
    expect(maxInAnyWindow(saturate(new TokenBucket(2_750, 100), 5_000))).toBeLessThanOrEqual(2_850);
    // Cau hinh "chieu dot bien" B = r: gao day + nap them trong 1 giay -> gap doi.
    expect(maxInAnyWindow(saturate(new TokenBucket(2_850, 2_850), 5_000))).toBeGreaterThanOrEqual(5_690);
  });

  it('(e) Gao ro hang doi: cac o gui cach deu 351 µs -> khong bao gio qua 2.850 trong 1 giay', () => {
    expect(maxInAnyWindow(saturate(new LeakyBucketQueue(2_850, 25_000), 5_000))).toBeLessThanOrEqual(2_850);
  });
});

describe('Chiu dot bien: 6.000 request den cung luc', () => {
  it('cac thuat toan chi do (a-d) tu choi phan vuot; gao ro xep hang tat ca, khong tu choi', () => {
    expect(burst(new SlidingLog(2_850), 6_000, 0)).toBe(2_850);
    expect(burst(new TokenBucket(2_750, 100), 6_000, 0)).toBe(100);
    expect(burst(new LeakyBucketQueue(2_850, 25_000), 6_000, 0)).toBe(6_000);
  });

  it('gao ro: request thu k phai cho k * 351 µs', () => {
    const l = new LeakyBucketQueue(2_850, 25_000);
    const delays = Array.from({ length: 6_000 }, () => l.tryAcquire('bank', 0).delayMs);

    expect(delays[0]).toBe(0);
    expect(delays[1]).toBeCloseTo(0.351, 6);
    expect(delays[5_999]).toBeCloseTo(5_999 * 0.351, 3);
  });

  it('gao ro: hang doi day (cho > maxWait) thi moi tu choi - maxWait 1s nhan dung 2.850 request', () => {
    expect(burst(new LeakyBucketQueue(2_850, 1_000), 6_000, 0)).toBe(2_850);
  });
});

describe('GCRA - ham loi', () => {
  it('toc do lam tron xuong an toan: 2.850/s -> o cach 351 µs (~2.849 req/s)', () => {
    expect(intervalUsFor(2_850)).toBe(351);
  });

  it('khoa moi (khong co TAT) -> gui ngay', () => {
    expect(gcraReserve(undefined, 1_000, 351, 0)).toEqual({ allowed: true, waitUs: 0, tatUs: 1_351 });
  });

  it('khoa lau khong dung (TAT trong qua khu) -> khong "no" bu, gui ngay', () => {
    expect(gcraReserve(5, 10_000_000, 351, 0)).toEqual({ allowed: true, waitUs: 0, tatUs: 10_000_351 });
  });

  it('bi tu choi thi TAT khong doi (request bi chan khong chiem o)', () => {
    expect(gcraReserve(30_000_000, 0, 351, 25_000_000)).toEqual({ allowed: false, waitUs: 30_000_000, tatUs: 30_000_000 });
  });
});
