/**
 * npm run demo                      -> tu khoi dong server trong tien trinh nay roi chay kich ban
 * BASE_URL=http://localhost:3000 npm run demo  -> chay kich ban vao server dang chay san
 */
import { INestApplication } from '@nestjs/common';
import { bootstrap } from '../main';
import { ActorResult, runDemo } from './scenario';

const LAYER_NAMES: Record<string, string> = {
  velocity: 'L1 Tốc độ',
  accountFarm: 'L2 Trang trại',
  journey: 'L3 Hành trình',
  purchaseQuota: 'L4 Hạn mức',
};

function table(rows: ActorResult[]) {
  const head = ['Tác nhân', 'Loại', 'Request', 'Thành công', 'Đặt lại (2 lần bấm)', 'Bị chặn bởi', 'SP mua được', 'Đúng lớp dự kiến?'];
  const lines = rows.map((r) => {
    const blocked = Object.entries(r.blockedBy)
      .map(([l, n]) => `${LAYER_NAMES[l] ?? l}: ${n}`)
      .join(', ');
    const verdict =
      r.kind === 'human'
        ? Object.keys(r.blockedBy).length === 0 && Object.keys(r.otherErrors).length === 0
          ? '✓ không bị chặn'
          : '✗ BỊ CHẶN OAN'
        : !r.expectedLayer
          ? '– lọt (đúng với ngưỡng đang áp dụng)'
          : r.blockedBy[r.expectedLayer]
            ? `✓ ${LAYER_NAMES[r.expectedLayer]}`
            : `✗ không bị ${LAYER_NAMES[r.expectedLayer]} chặn`;
    return [r.actor, r.kind === 'human' ? 'Khách' : 'Bot', r.requests, r.succeeded, r.replayed || '', blocked || '–', r.unitsBought, verdict];
  });
  console.log(`| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|`);
  for (const l of lines) console.log(`| ${l.join(' | ')} |`);
}

async function main() {
  let app: INestApplication | undefined;
  let base = process.env.BASE_URL;
  if (!base) {
    app = await bootstrap(0);
    base = `http://localhost:${app.getHttpServer().address().port}`;
  }
  console.log(`\n=== DEMO LÁ CHẮN FLASH SALE 11/11 – ${base} ===\n`);

  const d = await runDemo(base);

  console.log('\n## Pha 1 – Mở bán: khách thật và 4 loại bot cùng lúc\n');
  table(d.phase1);
  const humans = d.phase1.filter((r) => r.kind === 'human');
  const humanUnits = humans.reduce((s, r) => s + r.unitsBought, 0);
  const botUnits = d.phase1.filter((r) => r.kind === 'bot').reduce((s, r) => s + r.unitsBought, 0);
  const humanBlocks = humans.reduce((s, r) => s + r.blockIds.length, 0);
  console.log(
    `\nKhách thật: ${humans.length} luồng, ${humans.reduce((s, r) => s + r.requests, 0)} request, bị chặn ${humanBlocks} lần.` +
      ` Sản phẩm: khách ${humanUnits}, bot ${botUnits} → bot chiếm ${((botUnits / (humanUnits + botUnits)) * 100).toFixed(1)}% (năm ngoái 40%).`,
  );

  console.log('\n## Pha 2 – Đổi ngưỡng lúc đang chạy (không khởi động lại)\n');
  const t = d.tuning;
  console.log(`Trước: policy v${t.before.version}, maxAccountsPerDevice=${t.before.maxAccountsPerDevice}, pid=${t.before.pid}, khởi động lúc ${t.before.serverStartedAt}`);
  table([t.waveBefore]);
  console.log(`\nPATCH sai tên khoá "maxAcountsPerDevice" → HTTP ${t.rejectedPatch.status}: ${JSON.stringify((t.rejectedPatch.body as { errors?: unknown }).errors)} (chính sách giữ nguyên)`);
  console.log(`PATCH maxAccountsPerDevice=2 → policy v${t.after.version}, pid=${t.after.pid}, khởi động lúc ${t.after.serverStartedAt} (cùng tiến trình)\n`);
  table([t.waveAfter]);

  console.log(`\n## Truy vết lần chặn ${d.trace.blockId}\n`);
  console.log(JSON.stringify(d.trace.record, null, 2));

  console.log('\n## Báo cáo tỉ lệ chặn nhầm (GET /admin/report)\n');
  const r = d.report as { falsePositive: Record<string, unknown>; layers: Array<Record<string, unknown>>; totals: Record<string, unknown> };
  console.log('Tổng:', JSON.stringify(r.totals));
  console.log('Chặn nhầm:', JSON.stringify(r.falsePositive));
  for (const l of r.layers) {
    console.log(`  ${LAYER_NAMES[l.layer as string]}: chặn ${l.blocked}, đã xem xét ${JSON.stringify(l.reviewed)}, tỉ lệ chặn nhầm ${l.falsePositiveRatePct ?? '–'}%`);
  }

  console.log('\n## Ngoại lệ – server không sập\n');
  for (const c of d.robustness) console.log(`  ${c.case}: HTTP ${c.status} ${c.code ?? ''}`);
  console.log('\nLog chặn đầy đủ (JSON Lines): logs/blocks.jsonl\n');

  await app?.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
