/**
 * Qua HTTP, voi dong ho gia (khong phai cho that).
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ClockService } from '../src/http/clock.service';
import { COUNTER_STORE } from '../src/storage/counter-store';
import { InMemoryCounterStore } from '../src/storage/in-memory-counter-store';

const P = 'iphone-17-flash';
const ADMIN = { 'x-admin-token': 'admin-secret' };
let testIndex = 0;

describe('La chan qua HTTP', () => {
  let app: INestApplication;
  let now: number;
  let store: InMemoryCounterStore;
  let LOG_FILE: string;

  beforeEach(async () => {
    // Moi test 1 file log rieng: lan ghi bat dong bo cua test truoc khong lan sang test sau.
    LOG_FILE = join(tmpdir(), `bai9-blocks-${process.pid}-${++testIndex}.jsonl`);
    process.env.SHIELD_LOG_FILE = LOG_FILE;
    now = Date.UTC(2026, 10, 11, 0, 0, 0);
    store = new InMemoryCounterStore();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ClockService)
      .useValue({ now: () => now })
      .overrideProvider(COUNTER_STORE)
      .useValue(store)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });
  afterEach(async () => {
    await app.close();
    await new Promise((r) => setTimeout(r, 20));
    rmSync(LOG_FILE, { force: true });
  });

  const user = (account: string, device = `dev-${account}`) => ({ 'x-account-id': account, 'x-device-id': device });
  const view = (account: string, device?: string) => request(app.getHttpServer()).get(`/api/flash-sales/${P}`).set(user(account, device));
  const order = (account: string, body: Record<string, unknown>, device?: string) =>
    request(app.getHttpServer()).post(`/api/flash-sales/${P}/orders`).set(user(account, device)).send({ quantity: 1, shippingPhone: '0912345678', ...body });
  const humanOrder = async (account: string, body: Record<string, unknown> = {}, device?: string) => {
    const token = (await view(account, device)).body.saleToken;
    now += 2_000;
    return order(account, { saleToken: token, ...body }, device);
  };

  describe('Khach that', () => {
    it('xem -> can nhac 2s -> dat 2 cai: thanh cong, khong log chan nao', async () => {
      const res = await humanOrder('cus-1', { quantity: 2 });

      expect(res.status).toBe(201);
      expect(res.body.order).toMatchObject({ accountId: 'cus-1', quantity: 2 });
      expect(res.headers['x-shield-policy-version']).toBe('1');
      expect((await request(app.getHttpServer()).get('/admin/blocks').set(ADMIN)).body).toEqual([]);
    });

    it('bam "Dat hang" 2 lan GAN NHU DONG THOI voi 2 cai: lan 2 nhan lai don cu (200), khong bi han muc chan', async () => {
      const token = (await view('cus-dbl')).body.saleToken;
      now += 2_000;
      // Kho dem cham 50ms (nhu Redis duoi tai) -> lan bam 2 toi khi lan 1 CON DANG xu ly.
      const original = store.addIfWithin.bind(store);
      jest.spyOn(store, 'addIfWithin').mockImplementation(async (...args) => {
        await new Promise((r) => setTimeout(r, 50));
        return original(...args);
      });
      const first = order('cus-dbl', { saleToken: token, quantity: 2 });
      await new Promise((r) => setTimeout(r, 10));
      const [a, b] = await Promise.all([first, order('cus-dbl', { saleToken: token, quantity: 2 })]);

      expect([a.status, b.status].sort()).toEqual([200, 201]);
      expect(a.body.order.orderId).toBe(b.body.order.orderId);
    });

    it('het hang -> 409 SOLD_OUT (khong phai "chan"), han muc da giu duoc hoan lai', async () => {
      // Mua het kho bang nhieu khach.
      for (let i = 0; i < 250; i++) await humanOrder(`buyer-${i}`, { quantity: 2, shippingPhone: `09${String(i).padStart(8, '0')}` });
      const res = await humanOrder('late', { quantity: 2, shippingPhone: '0999999999' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('SOLD_OUT');
      expect((await request(app.getHttpServer()).get('/admin/blocks').set(ADMIN).query({ accountId: 'late' })).body).toEqual([]);
      // han muc cua "late" khong bi tru oan
      expect(await store.addIfWithin(`quota:acct:late:${P}`, 2, 2, 1, now)).toEqual({ ok: true, total: 2 });
    });
  });

  describe('Bon loai lam dung', () => {
    it('L1: F5 lan thu 31 trong 10s -> 429, Retry-After, blockId, huong dan khieu nai', async () => {
      for (let i = 0; i < 30; i++) await view('bot');
      const res = await view('bot');

      expect(res.status).toBe(429);
      expect(res.headers['retry-after']).toBe('10');
      expect(res.body).toMatchObject({ code: 'VELOCITY_LIMIT', blockId: expect.stringMatching(/^blk_/), appeal: { path: '/api/appeals' } });
    });

    it('L2: tai khoan thu 4 tren cung thiet bi -> 403 ACCOUNT_FARM_SUSPECTED', async () => {
      for (let i = 1; i <= 3; i++) expect((await humanOrder(`farm-${i}`, { shippingPhone: `096000000${i}` }, 'dev-farm')).status).toBe(201);

      const res = await humanOrder('farm-4', { shippingPhone: '0960000004' }, 'dev-farm');
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ACCOUNT_FARM_SUSPECTED');
    });

    it('L3: goi thang API khong ve / dat 50ms sau khi mo trang -> 403', async () => {
      expect((await order('api-1', {})).body.code).toBe('JOURNEY_TOKEN_MISSING');

      const token = (await view('api-2')).body.saleToken;
      now += 50;
      expect((await order('api-2', { saleToken: token })).body.code).toBe('JOURNEY_TOO_FAST');
    });

    it('L4: 3 tai khoan, 3 thiet bi, cung so nhan hang -> tu tai khoan thu 2 bi 409', async () => {
      expect((await humanOrder('sc-1', { quantity: 2, shippingPhone: '0988888888' })).status).toBe(201);
      const res = await humanOrder('sc-2', { quantity: 1, shippingPhone: '+84 988 888 888' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PURCHASE_LIMIT_EXCEEDED');
    });
  });

  describe('Doi nguong luc dang chay', () => {
    it('PATCH /admin/policy co hieu luc ngay o request ke tiep, cung tien trinh', async () => {
      const before = (await request(app.getHttpServer()).get('/admin/policy').set(ADMIN)).body;
      for (let i = 1; i <= 2; i++) await humanOrder(`f-${i}`, { shippingPhone: `097000000${i}` }, 'dev-f');

      const patched = await request(app.getHttpServer())
        .patch('/admin/policy?by=ops')
        .set(ADMIN)
        .send({ patch: { accountFarm: { maxAccountsPerDevice: 2 } }, reason: 'siet' });
      expect(patched.status).toBe(200);
      expect(patched.body).toMatchObject({ version: 2, updatedBy: 'ops', pid: before.pid, serverStartedAt: before.serverStartedAt });

      const res = await humanOrder('f-3', { shippingPhone: '0970000003' }, 'dev-f');
      expect(res.status).toBe(403);
      const log = (await request(app.getHttpServer()).get(`/admin/blocks/${res.body.blockId}`).set(ADMIN)).body;
      expect(log).toMatchObject({ policyVersion: 2, threshold: { maxAccountsPerDevice: 2 }, policyAtBlock: { maxAccountsPerDevice: 2 } });
    });

    it('ban va sai -> 400 kem danh sach loi, chinh sach giu nguyen', async () => {
      const res = await request(app.getHttpServer()).patch('/admin/policy').set(ADMIN).send({ patch: { journey: { minDwellMs: 'nhanh' } } });

      expect(res.status).toBe(400);
      expect(res.body.errors[0]).toContain('journey.minDwellMs');
      expect((await request(app.getHttpServer()).get('/admin/policy').set(ADMIN)).body.version).toBe(1);
    });

    it('shadow mode qua API: lop chi ghi "would-block", khong chan', async () => {
      await request(app.getHttpServer()).patch('/admin/policy').set(ADMIN).send({ patch: { journey: { mode: 'shadow' } } });

      const res = await order('api-x', {});
      expect(res.status).toBe(201);
      expect((await request(app.getHttpServer()).get('/admin/blocks').set(ADMIN)).body[0]).toMatchObject({ action: 'would-block', code: 'JOURNEY_TOKEN_MISSING' });
    });
  });

  describe('Log, khieu nai, ti le chan nham', () => {
    it('moi lan chan duoc ghi 1 dong JSON vao file log', async () => {
      const res = await order('api-1', {});
      await new Promise((r) => setTimeout(r, 50)); // ghi file bat dong bo

      const lines = readFileSync(LOG_FILE, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({ blockId: res.body.blockId, layer: 'journey', subject: { accountId: 'api-1' } });
    });

    it('khach khieu nai -> doi van hanh ket luan chan nham -> bao cao ti le chan nham 50%', async () => {
      const fp = (await order('cus-oan', {})).body.blockId;
      const tp = (await order('bot-x', {})).body.blockId;

      const appeal = await request(app.getHttpServer()).post('/api/appeals').set(user('cus-oan')).send({ blockId: fp, message: 'Toi la khach that' });
      expect(appeal.status).toBe(201);
      expect((await request(app.getHttpServer()).get('/admin/report').set(ADMIN)).body.falsePositive.appealsPending).toBe(1);

      await request(app.getHttpServer()).post(`/admin/blocks/${fp}/verdict`).set(ADMIN).send({ verdict: 'false-positive' }).expect(200);
      await request(app.getHttpServer()).post(`/admin/blocks/${tp}/verdict`).set(ADMIN).send({ verdict: 'confirmed-abuse' }).expect(200);

      const report = (await request(app.getHttpServer()).get('/admin/report').set(ADMIN)).body;
      expect(report.falsePositive).toMatchObject({ reviewedBlocks: 2, falsePositive: 1, falsePositiveRatePct: 50, appealsPending: 0 });
      expect(report.layers.find((l: { layer: string }) => l.layer === 'journey').falsePositiveRatePct).toBe(50);
    });

    it('khong khieu nai duoc lan chan cua nguoi khac', async () => {
      const blockId = (await order('victim', {})).body.blockId;
      const res = await request(app.getHttpServer()).post('/api/appeals').set(user('attacker')).send({ blockId });
      expect(res.status).toBe(403);
    });
  });

  describe('Ngoai le - khong bao gio sap', () => {
    it.each([
      ['thieu x-account-id', () => request(app.getHttpServer()).get(`/api/flash-sales/${P}`), 401],
      ['thieu x-device-id', () => request(app.getHttpServer()).get(`/api/flash-sales/${P}`).set('x-account-id', 'a'), 400],
      ['quantity sai', () => order('a', { quantity: 99 }), 400],
      ['so dien thoai sai', () => order('a', { shippingPhone: 'abc' }), 400],
      ['JSON hong', () => request(app.getHttpServer()).post(`/api/flash-sales/${P}/orders`).set(user('a')).set('content-type', 'application/json').send('{"q":'), 400],
      ['san pham khong ton tai', () => request(app.getHttpServer()).get('/api/flash-sales/khong-co').set(user('a')), 404],
      ['sai admin token', () => request(app.getHttpServer()).get('/admin/report').set('x-admin-token', 'x'), 401],
    ])('%s -> %s, co requestId', async (_name, call, status) => {
      const res = await (call as () => request.Test)();
      expect(res.status).toBe(status);
      expect(res.body.requestId).toEqual(expect.any(String));
    });

    it('kho dem loi -> cac lop dung kho bo qua (fail-open), khach that van dat duoc, loi duoc dem', async () => {
      const token = (await view('cus-r')).body.saleToken;
      now += 2_000;
      jest.spyOn(store, 'hit').mockRejectedValue(new Error('redis down'));
      jest.spyOn(store, 'addIfWithin').mockRejectedValue(new Error('redis down'));

      const res = await order('cus-r', { saleToken: token });
      expect(res.status).toBe(201);
      expect((await request(app.getHttpServer()).get('/admin/report').set(ADMIN)).body.totals.layerErrors).toBe(2);
    });

    it('loi khong luong truoc trong nghiep vu -> 500 JSON co requestId, server van phuc vu request sau', async () => {
      const shop = app.get(require('../src/shop/flash-sale.service').FlashSaleService);
      jest.spyOn(shop, 'placeOrder').mockImplementationOnce(() => {
        throw new Error('db exploded');
      });

      const res = await humanOrder('cus-500');
      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ code: 'INTERNAL_ERROR', requestId: expect.any(String) });
      expect(res.body.message).not.toContain('db exploded');
      expect((await humanOrder('cus-after-500', { shippingPhone: '0933333333' })).status).toBe(201);
    });
  });
});
