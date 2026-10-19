/**
 * Chay TRON kich ban demo (dong ho that, ~20 giay) va kiem chung 4 tieu chi cham diem.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { DemoResult, runDemo } from '../src/demo/scenario';

jest.setTimeout(90_000);

describe('Kich ban demo', () => {
  let app: INestApplication;
  let demo: DemoResult;

  beforeAll(async () => {
    process.env.SHIELD_LOG_FILE = 'off';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0);
    demo = await runDemo(`http://localhost:${app.getHttpServer().address().port}`);
  });
  afterAll(() => app.close());

  it('Tieu chi 1: ca 4 loai bot deu bi chan boi DUNG lop thiet ke cho no', () => {
    const bots = demo.phase1.filter((r) => r.kind === 'bot');
    expect(bots).toHaveLength(4);
    for (const bot of bots) expect(bot.blockedBy[bot.expectedLayer!]).toBeGreaterThan(0);
  });

  it('Tieu chi 2: moi luong khach that di tron ven, khong bi chan lan nao', () => {
    const humans = demo.phase1.filter((r) => r.kind === 'human');
    expect(humans.length).toBeGreaterThanOrEqual(20);
    for (const h of humans) {
      expect(h.blockIds).toEqual([]);
      expect(h.otherErrors).toEqual({});
      expect(h.unitsBought).toBeGreaterThan(0);
    }
    expect(demo.phase1.filter((r) => r.actor.startsWith('bam-2-lan')).every((r) => r.replayed === 1)).toBe(true);
    expect((demo.report as { falsePositive: { falsePositive: number } }).falsePositive.falsePositive).toBe(0);
  });

  it('Tieu chi 3: doi nguong luc dang chay - dot B lot (v1), dot C bi chan (v2), cung tien trinh', () => {
    const { before, after, waveBefore, waveAfter, rejectedPatch } = demo.tuning;
    expect(waveBefore.blockIds).toEqual([]);
    expect(waveAfter.blockedBy.accountFarm).toBe(1);
    expect(after.version).toBe(before.version + 1);
    expect([after.pid, after.serverStartedAt]).toEqual([before.pid, before.serverStartedAt]);
    expect(rejectedPatch.status).toBe(400);
  });

  it('Tieu chi 4: log du thong tin truy vet mot lan chan cu the', () => {
    expect(demo.trace.record).toMatchObject({
      blockId: demo.trace.blockId,
      requestId: expect.any(String),
      layer: 'accountFarm',
      rule: 'maxAccountsPerDevice',
      threshold: { maxAccountsPerDevice: 2 },
      observed: { accountsOnDevice: 3 },
      policyVersion: 2,
      subject: { accountId: 'farmC-3', deviceId: 'dev-bot-farm-C' },
      request: { method: 'POST', path: '/api/flash-sales/iphone-17-flash/orders' },
      policyAtBlock: { maxAccountsPerDevice: 2 },
    });
  });

  it('Ngoai le: du lieu rac nhan 4xx, server van phuc vu', () => {
    expect(demo.robustness.map((c) => c.status)).toEqual([400, 400, 401, 404, 404, 200]);
  });
});
