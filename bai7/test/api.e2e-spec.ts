/**
 * Kiem qua HTTP: header phan hoi, cac bay du lieu, API quan tri doi goi / thu hoi khoa.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SellerStore } from '../src/identity/seller.store';

const T0_SEC = Date.UTC(2026, 9, 17, 18, 0, 0) / 1000; // 01:00 gio VN

describe('Seller API qua HTTP', () => {
  let app: INestApplication;

  beforeEach(async () => {
    process.env.ALLOW_FAKE_CLOCK = 'true';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });
  afterEach(async () => {
    await app.close();
    delete process.env.ALLOW_FAKE_CLOCK;
  });

  const products = (apiKey: string | null, at = T0_SEC) => {
    const req = request(app.getHttpServer()).get('/api/v1/products').set('x-fake-now', String(at));
    return apiKey ? req.set('x-api-key', apiKey) : req;
  };
  const exportReport = (apiKey: string, at = T0_SEC) =>
    request(app.getHttpServer()).post('/api/v1/reports/export').set('x-api-key', apiKey).set('x-fake-now', String(at));
  const admin = () => ({
    patch: (url: string) => request(app.getHttpServer()).patch(url).set('x-admin-token', 'admin-secret'),
    post: (url: string) => request(app.getHttpServer()).post(url).set('x-admin-token', 'admin-secret'),
  });
  const callN = async (n: number, call: () => request.Test) => {
    let last!: request.Response;
    for (let i = 0; i < n; i++) last = await call();
    return last;
  };

  describe('Header han muc', () => {
    it('Free: day du header tang phut + tang ngay + tom tat', async () => {
      const res = await products('sk_free_demo');

      expect(res.status).toBe(200);
      expect(res.headers).toMatchObject({
        'x-ratelimit-plan': 'free',
        'x-apikey-status': 'active',
        'x-ratelimit-limit-minute': '60',
        'x-ratelimit-remaining-minute': '59',
        'x-ratelimit-limit-day': '5000',
        'x-ratelimit-remaining-day': '4999',
        'x-ratelimit-limit': '60',
        'x-ratelimit-remaining': '59',
      });
    });

    it('Enterprise: khong co header tang ngay', async () => {
      const res = await products('sk_ent_demo');

      expect(res.headers['x-ratelimit-limit-minute']).toBe('6000');
      expect(res.headers['x-ratelimit-limit-day']).toBeUndefined();
    });

    it('Xuat bao cao: co them header Export-Hour, tom tat chi ra tang chat nhat', async () => {
      const res = await exportReport('sk_ent_demo');

      expect(res.status).toBe(201);
      expect(res.headers['x-ratelimit-limit-export-hour']).toBe('10');
      expect(res.headers['x-ratelimit-remaining-export-hour']).toBe('9');
      expect(res.headers['x-ratelimit-remaining']).toBe('9');
    });
  });

  describe('Phan hoi khi bi chan', () => {
    it('Free lan 61: 429, Retry-After, thong bao ro tang nao bi vuot', async () => {
      const res = await callN(61, () => products('sk_free_demo'));

      expect(res.status).toBe(429);
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
      expect(res.body).toMatchObject({
        statusCode: 429,
        plan: 'free',
        apiKeyStatus: 'active',
        blockedBy: [{ tier: 'Minute', limit: 60 }],
      });
      expect(res.body.message).toContain('60 request/phút của gói Free');
    });

    it('Enterprise xuat bao cao lan 11 trong 1 gio: 429 boi Export-Hour', async () => {
      const res = await callN(11, () => exportReport('sk_ent_demo'));

      expect(res.status).toBe(429);
      expect(res.body.blockedBy).toEqual([expect.objectContaining({ tier: 'Export-Hour', limit: 10 })]);
      expect(res.body.message).toContain('xuất báo cáo');
    });
  });

  describe('Bay 2 - khong co khoa / khoa sai / khoa bi thu hoi -> han muc thap nhat', () => {
    it('khong co x-api-key: goi Free theo IP, kem thong bao; lan 61 bi chan', async () => {
      const first = await products(null);
      expect(first.headers['x-ratelimit-plan']).toBe('free');
      expect(first.headers['x-apikey-status']).toBe('missing');
      expect(first.body.notice).toContain('không có header x-api-key');

      const res = await callN(60, () => products(null));
      expect(res.status).toBe(429);
      expect(res.body.notice).toContain('hạn mức thấp nhất');
    });

    it('khoa khong ton tai: trang thai invalid, goi Free', async () => {
      const res = await products('sk_khong_ton_tai');

      expect(res.headers['x-apikey-status']).toBe('invalid');
      expect(res.headers['x-ratelimit-limit-minute']).toBe('60');
    });

    it('khoa da thu hoi cua nha ban hang ENTERPRISE: chi duoc goi Free (60/phut), lan 61 bi chan', async () => {
      const first = await products('sk_ent_revoked');
      expect(first.headers['x-ratelimit-plan']).toBe('free');
      expect(first.headers['x-apikey-status']).toBe('revoked');
      expect(first.body.notice).toContain('đã bị thu hồi');

      expect((await callN(60, () => products('sk_ent_revoked'))).status).toBe(429);
    });

    it('luu luong tu khoa da thu hoi KHONG an vao han muc cua chu khoa', async () => {
      await callN(61, () => products('sk_ent_revoked'));

      const owner = await products('sk_ent_demo');
      expect(owner.headers['x-ratelimit-remaining-minute']).toBe('5999');
    });

    it('thu hoi khoa giua chung: request ke tiep bi ha xuong goi Free ngay', async () => {
      expect((await products('sk_pro_demo')).headers['x-ratelimit-plan']).toBe('pro');

      await admin().post('/admin/api-keys/sk_pro_demo/revoke').expect(200);
      const res = await products('sk_pro_demo');

      expect(res.headers['x-apikey-status']).toBe('revoked');
      expect(res.headers['x-ratelimit-plan']).toBe('free');
    });

    it('du lieu goi bi hong (plan = "gold") -> ve goi thap nhat, khong nem loi', async () => {
      app.get(SellerStore).changePlan('seller-pro', 'gold');
      const res = await products('sk_pro_demo');

      expect(res.status).toBe(200);
      expect(res.headers['x-ratelimit-plan']).toBe('free');
    });
  });

  describe('Bay 1 - nang cap goi giua chung', () => {
    it('Free het 60/phut -> PATCH len Pro -> request ke tiep trong CUNG phut duoc qua, Limit 600', async () => {
      expect((await callN(61, () => products('sk_upgrade_demo'))).status).toBe(429);

      const upgrade = await admin().patch('/admin/sellers/seller-upgrade/plan').send({ plan: 'pro' });
      expect(upgrade.status).toBe(200);

      const res = await products('sk_upgrade_demo', T0_SEC + 1);
      expect(res.status).toBe(200);
      expect(res.headers).toMatchObject({
        'x-ratelimit-plan': 'pro',
        'x-ratelimit-limit-minute': '600',
        'x-ratelimit-remaining-minute': '539',
        'x-ratelimit-limit-day': '200000',
      });
    });
  });

  describe('API quan tri', () => {
    it('sai x-admin-token -> 401', async () => {
      await request(app.getHttpServer()).post('/admin/reset').set('x-admin-token', 'sai').expect(401);
    });

    it('goi khong hop le -> 400; nha ban hang khong ton tai -> 404', async () => {
      await admin().patch('/admin/sellers/seller-free/plan').send({ plan: 'gold' }).expect(400);
      await admin().patch('/admin/sellers/khong-co/plan').send({ plan: 'pro' }).expect(404);
    });

    it('reset: xoa bo dem va khoi phuc du lieu mau', async () => {
      await callN(61, () => products('sk_free_demo'));
      await admin().post('/admin/api-keys/sk_free_demo/revoke');

      await admin().post('/admin/reset').expect(200);
      const res = await products('sk_free_demo');

      expect(res.status).toBe(200);
      expect(res.headers['x-apikey-status']).toBe('active');
      expect(res.headers['x-ratelimit-remaining-minute']).toBe('59');
    });
  });
});
