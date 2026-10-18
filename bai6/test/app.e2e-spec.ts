import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

async function createApp(env: Record<string, string>) {
  Object.assign(process.env, env);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await app.init();
  return app;
}

function getProducts(app: INestApplication, userId: string | null, fakeNowSec?: number) {
  const req = request(app.getHttpServer()).get('/api/products');
  if (userId) req.set('x-user-id', userId);
  if (fakeNowSec !== undefined) req.set('x-fake-now', String(fakeNowSec));
  return req;
}

async function burstStatuses(app: INestApplication, userId: string, n: number, fakeNowSec?: number) {
  const statuses: number[] = [];
  for (let i = 0; i < n; i++) statuses.push((await getProducts(app, userId, fakeNowSec)).status);
  return { ok: statuses.filter((s) => s === 200).length, blocked: statuses.filter((s) => s === 429).length };
}

describe('GET /api/products qua HTTP', () => {
  let app: INestApplication;
  afterEach(async () => {
    await app.close();
    delete process.env.ALLOW_FAKE_CLOCK;
    delete process.env.LIMITER;
  });

  it('Cua so truot: 100 request o giay 59 qua het, 100 request o giay 61 bi chan 98', async () => {
    app = await createApp({ ALLOW_FAKE_CLOCK: 'true' });

    expect(await burstStatuses(app, 'attacker', 100, 59)).toEqual({ ok: 100, blocked: 0 });
    expect(await burstStatuses(app, 'attacker', 100, 61)).toEqual({ ok: 2, blocked: 98 });
  });

  it('Doi chung LIMITER=fixed: ca 200 request deu 200', async () => {
    app = await createApp({ ALLOW_FAKE_CLOCK: 'true', LIMITER: 'fixed' });

    expect(await burstStatuses(app, 'attacker', 100, 59)).toEqual({ ok: 100, blocked: 0 });
    expect(await burstStatuses(app, 'attacker', 100, 61)).toEqual({ ok: 100, blocked: 0 });
  });

  it('Dong ho that: request thu 101 lien tiep bi 429, body va header dung', async () => {
    app = await createApp({});

    await burstStatuses(app, 'user-1', 100);
    const res = await getProducts(app, 'user-1');

    expect(res.status).toBe(429);
    expect(res.body).toEqual({ statusCode: 429, message: 'Too Many Requests' });
    expect(res.headers['x-ratelimit-algorithm']).toBe('SlidingWindowLimiter');
  });

  it('Khong bat ALLOW_FAKE_CLOCK thi header x-fake-now bi bo qua (khong lach duoc bang cach doi gio)', async () => {
    app = await createApp({});

    await burstStatuses(app, 'cheater', 100, 59);

    expect((await getProducts(app, 'cheater', 99_999)).status).toBe(429);
  });

  it('Thieu x-user-id -> 401; x-fake-now khong hop le -> 400', async () => {
    app = await createApp({ ALLOW_FAKE_CLOCK: 'true' });

    expect((await getProducts(app, null)).status).toBe(401);
    expect((await request(app.getHttpServer()).get('/api/products').set('x-user-id', 'u').set('x-fake-now', 'abc')).status).toBe(400);
  });
});
