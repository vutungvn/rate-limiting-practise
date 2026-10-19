/**
 * npm run simulate - in bang ket qua (markdown) dung trong README muc B.
 */
import { FixedWindow } from '../algorithms/fixed-window';
import { LeakyBucketQueue } from '../algorithms/leaky-bucket-queue';
import { SlidingLog } from '../algorithms/sliding-log';
import { SlidingWindowCounter } from '../algorithms/sliding-window-counter';
import { TokenBucket } from '../algorithms/token-bucket';
import { SimResult, simulateDistributed, simulatePartitioned, simulateShared } from './simulate';
import { EXAM_PROFILE, generateTraffic } from './traffic';

export const CHOSEN = { ratePerSec: 2_850, maxWaitMs: 25_000 };

async function main() {
  const p = EXAM_PROFILE;
  const arrivals = generateTraffic(p);
  console.log(
    `Luu luong: ${arrivals.length.toLocaleString('vi-VN')} request trong ${p.durationS}s; ` +
      `${p.baseRps} rps, dot x${p.spike.multiplier} tu giay ${p.spike.startS} trong ${p.spike.durationS}s; ` +
      `LB chia ${p.lbWeights.join('/')}; jitter mang 0-20ms\n`,
  );

  const results: SimResult[] = [
    simulateShared('(a) Cửa sổ cố định 3.000/s', new FixedWindow(3_000), arrivals, p),
    simulateShared('(a) Cửa sổ cố định 2.850/s', new FixedWindow(2_850), arrivals, p),
    simulateShared('(b) Nhật ký cửa sổ trượt 2.850/s', new SlidingLog(2_850), arrivals, p),
    simulateShared('(c) Bộ đếm cửa sổ trượt 2.850/s', new SlidingWindowCounter(2_850), arrivals, p),
    simulateShared('(d) Gáo token r=2.850, B=2.850 (chiều đột biến)', new TokenBucket(2_850, 2_850), arrivals, p),
    simulateShared('(d) Gáo token r=2.750, B=100', new TokenBucket(2_750, 100), arrivals, p),
    simulateShared('(e) Gáo rò hàng đợi 2.850/s, chờ ≤ 5s', new LeakyBucketQueue(2_850, 5_000), arrivals, p),
    simulateShared('(e) Gáo rò hàng đợi 2.850/s, chờ ≤ 25s', new LeakyBucketQueue(CHOSEN.ratePerSec, CHOSEN.maxWaitMs), arrivals, p),
    simulatePartitioned('(e) chia tĩnh 6 × 475/s, chờ ≤ 25s (không đồng bộ)', () => new LeakyBucketQueue(475, 25_000), arrivals, p),
    await simulateDistributed('★ Triển khai: 6 tiến trình + kho chung (GCRA)', CHOSEN, arrivals, p),
    await simulateDistributed('★ + Redis sập giây 50-53, failover mất TAT', CHOSEN, arrivals, p, {
      downFromS: 50,
      upAtS: 53,
      wipeOnRecovery: true,
    }),
    await simulateDistributed(
      '✗ như trên nhưng KHÔNG khôi phục TAT',
      { ...CHOSEN, restoreFloorOnRecovery: false },
      arrivals,
      p,
      { downFromS: 50, upAtS: 53, wipeOnRecovery: true },
    ),
  ];

  printTable(results);

  console.log('\nĐánh đổi thời gian chờ tối đa (gáo rò 2.850/s, cùng lưu lượng):\n');
  printTable(
    [0, 5_000, 10_000, 15_000, 20_000, 25_000].map((maxWaitMs) =>
      simulateShared(`chờ ≤ ${maxWaitMs / 1000}s`, new LeakyBucketQueue(CHOSEN.ratePerSec, maxWaitMs), arrivals, p),
    ),
  );

  const normal = { ...p, durationS: 900, spike: { ...p.spike, multiplier: 1 } };
  const normalArrivals = generateTraffic(normal);
  console.log('\nChỉ giờ thường 2.000 rps trong 15 phút (không có đột biến):\n');
  printTable(
    [
      simulatePartitioned('chia tĩnh 6 × 475/s, chờ ≤ 25s', () => new LeakyBucketQueue(475, 25_000), normalArrivals, normal),
      await simulateDistributed('★ 6 tiến trình + kho chung', CHOSEN, normalArrivals, normal),
    ],
    false,
  );
}

function printTable(results: SimResult[], splitBySpike = true) {
  const n = (x: number) => x.toLocaleString('vi-VN');
  const rejectedHead = splitBySpike ? 'Bị chặn trước đợt đột biến | Bị chặn từ đợt đột biến' : 'Bị chặn';
  console.log(`| Phương án | Max req/1s tới NH | Số lần vượt 3.000 | ${rejectedHead} | Trễ p99 | Trễ max |`);
  console.log(`|---|---:|---:|---:|${splitBySpike ? '---:|' : ''}---:|---:|`);
  for (const r of results) {
    const rejected = splitBySpike ? `${n(r.rejectedNormal)} | ${n(r.rejectedPeak)}` : n(r.rejectedTotal);
    console.log(
      `| ${r.name} | ${n(r.maxPerSecond)} | ${r.violations ? `**${n(r.violations)}** ✗` : '0 ✓'} | ${rejected} | ${n(r.delayP99Ms)} ms | ${n(r.delayMaxMs)} ms |`,
    );
  }
}

if (require.main === module) main();
