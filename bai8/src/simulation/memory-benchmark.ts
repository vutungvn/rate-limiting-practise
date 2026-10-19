/**
 * npm run bench:memory - do bo nho THAT (heap + ArrayBuffer) cua tung thuat toan, quy ra 100.000 khoa.
 * Moi khoa duoc dat o trang thai xau nhat (nhat ky truot day 2.850 moc).
 * Moi thuat toan do trong MOT TIEN TRINH RIENG de bo nho cua lan do truoc khong lam nhieu ket qua.
 */
import { execFileSync } from 'child_process';
import { FixedWindow } from '../algorithms/fixed-window';
import { LeakyBucketQueue } from '../algorithms/leaky-bucket-queue';
import { SlidingLog } from '../algorithms/sliding-log';
import { SlidingWindowCounter } from '../algorithms/sliding-window-counter';
import { TokenBucket } from '../algorithms/token-bucket';
import { Limiter } from '../algorithms/types';

const TARGET_KEYS = 100_000;
const BUDGET_MB = 256;
const LIMIT = 2_850;

const gc = (globalThis as { gc?: () => void }).gc;
if (!gc) throw new Error('Chay bang: npm run bench:memory (can co --expose-gc)');

const usedBytes = () => {
  gc!();
  const m = process.memoryUsage();
  return m.heapUsed + m.arrayBuffers;
};

function measure(make: () => Limiter, keys: number, hitsPerKey: number) {
  const before = usedBytes();
  const limiter = make();
  for (let k = 0; k < keys; k++) {
    const key = `merchant:${k}`;
    for (let h = 0; h < hitsPerKey; h++) limiter.tryAcquire(key, h * 0.1);
  }
  const after = usedBytes();
  if (!limiter.name) throw new Error('unreachable'); // giu limiter song toi sau lan do
  return (after - before) / keys;
}

const cases: Array<[string, () => Limiter, number, number]> = [
  ['(a) Cửa sổ cố định', () => new FixedWindow(LIMIT), TARGET_KEYS, 1],
  ['(b) Nhật ký cửa sổ trượt (đầy 2.850 mốc)', () => new SlidingLog(LIMIT), 2_000, LIMIT],
  ['(c) Bộ đếm cửa sổ trượt', () => new SlidingWindowCounter(LIMIT), TARGET_KEYS, 1],
  ['(d) Gáo token', () => new TokenBucket(LIMIT, 100), TARGET_KEYS, 1],
  ['(e) Gáo rò / GCRA', () => new LeakyBucketQueue(LIMIT, 25_000), TARGET_KEYS, 1],
];

const caseIndex = process.argv[2];
if (caseIndex !== undefined) {
  // Tien trinh con: do 1 thuat toan, tra ket qua qua stdout.
  const [, make, keys, hits] = cases[Number(caseIndex)];
  process.stdout.write(String(measure(make, keys, hits)));
  process.exit(0);
}

console.log(`| Thuật toán | Đo được / khoá | × ${TARGET_KEYS.toLocaleString('vi-VN')} khoá | So với ${BUDGET_MB}MB |`);
console.log('|---|---:|---:|---|');
for (const [i, [name]] of cases.entries()) {
  const out = execFileSync(process.execPath, ['--expose-gc', '-r', 'ts-node/register', __filename, String(i)], { encoding: 'utf8' });
  const perKey = Number(out);
  const totalMb = (perKey * TARGET_KEYS) / 1024 / 1024;
  const verdict = totalMb <= BUDGET_MB ? `✓ ${((totalMb / BUDGET_MB) * 100).toFixed(1)}%` : `✗ gấp ${(totalMb / BUDGET_MB).toFixed(1)} lần`;
  console.log(`| ${name} | ${Math.round(perKey).toLocaleString('vi-VN')} B | ${totalMb.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} MB | ${verdict} |`);
}
