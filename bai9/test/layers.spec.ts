/**
 * Tung lop phong thu, doc lap voi HTTP: moi lop chan dung MOT loai hanh vi.
 */
import { ShieldContext } from '../src/enforcement/defense-layer';
import { JourneyTokenService } from '../src/enforcement/journey-token.service';
import { AccountFarmLayer } from '../src/enforcement/layers/account-farm.layer';
import { JourneyLayer } from '../src/enforcement/layers/journey.layer';
import { PurchaseQuotaLayer } from '../src/enforcement/layers/purchase-quota.layer';
import { VelocityLayer } from '../src/enforcement/layers/velocity.layer';
import { DEFAULT_POLICY } from '../src/policy/default-policy';
import { InMemoryCounterStore } from '../src/storage/in-memory-counter-store';

const T0 = 1_000_000;
const ctx = (over: Partial<ShieldContext> = {}): ShieldContext => ({
  requestId: 'req',
  action: 'order',
  method: 'POST',
  path: '/x',
  productId: 'p1',
  accountId: 'acc',
  deviceId: 'dev',
  ip: '1.1.1.1',
  userAgent: 'ua',
  quantity: 1,
  phone: '0912345678',
  now: T0,
  ...over,
});
const policy = DEFAULT_POLICY;

describe('L1 Toc do', () => {
  it('xem san pham lan 31 trong 10s bi chan 429 kem Retry-After; khong lo nguong ra thong bao', async () => {
    const layer = new VelocityLayer(new InMemoryCounterStore());
    for (let i = 0; i < 30; i++) expect((await layer.evaluate(ctx({ action: 'browse', now: T0 + i }), policy)).blocked).toBe(false);

    const v = await layer.evaluate(ctx({ action: 'browse', now: T0 + 30 }), policy);
    expect(v).toMatchObject({ blocked: true, code: 'VELOCITY_LIMIT', status: 429, rule: 'perAccount.browse', retryAfterSec: 10 });
    expect((v as { message: string }).message).not.toMatch(/30/);
  });

  it('nhieu tai khoan tren 1 thiet bi: nguong thiet bi (60) chan khi tung tai khoan chua vuot', async () => {
    const layer = new VelocityLayer(new InMemoryCounterStore());
    for (let i = 0; i < 60; i++) await layer.evaluate(ctx({ action: 'browse', accountId: `a${i % 3}` }), policy);

    expect(await layer.evaluate(ctx({ action: 'browse', accountId: 'a9' }), policy)).toMatchObject({ blocked: true, rule: 'perDevice.browse' });
  });

  it('nhieu nguoi chung 1 IP (van phong / 4G) khong anh huong nhau - lop nay khong dem theo IP', async () => {
    const layer = new VelocityLayer(new InMemoryCounterStore());
    for (let u = 0; u < 200; u++) {
      for (let i = 0; i < 5; i++) {
        const v = await layer.evaluate(ctx({ action: 'browse', accountId: `u${u}`, deviceId: `d${u}`, ip: '10.0.0.1' }), policy);
        expect(v.blocked).toBe(false);
      }
    }
  });
});

describe('L2 Trang trai tai khoan', () => {
  it('tai khoan thu 4 tren cung thiet bi bi chan 403; 3 tai khoan dau van dat tiep duoc', async () => {
    const layer = new AccountFarmLayer(new InMemoryCounterStore());
    for (const a of ['a1', 'a2', 'a3']) expect((await layer.evaluate(ctx({ accountId: a }), policy)).blocked).toBe(false);

    expect(await layer.evaluate(ctx({ accountId: 'a4' }), policy)).toMatchObject({
      blocked: true,
      code: 'ACCOUNT_FARM_SUSPECTED',
      status: 403,
      observed: { accountsOnDevice: 4 },
    });
    expect((await layer.evaluate(ctx({ accountId: 'a1' }), policy)).blocked).toBe(false);
  });

  it('het cua so 1 gio -> thiet bi duoc "lam sach"', async () => {
    const layer = new AccountFarmLayer(new InMemoryCounterStore());
    for (const a of ['a1', 'a2', 'a3']) await layer.evaluate(ctx({ accountId: a }), policy);

    expect((await layer.evaluate(ctx({ accountId: 'a4', now: T0 + 3_600_001 }), policy)).blocked).toBe(false);
  });
});

describe('L3 Hanh trinh nguoi dung', () => {
  const tokens = new JourneyTokenService();
  const layer = new JourneyLayer(tokens);
  const issued = tokens.issue('acc', 'dev', 'p1', T0);

  it.each([
    ['khong co ve', undefined, T0 + 2_000, 'JOURNEY_TOKEN_MISSING'],
    ['ve gia', 'eyJhIjoiYWNjIn0.gia', T0 + 2_000, 'JOURNEY_TOKEN_INVALID'],
    ['dat ngay 50ms sau khi mo trang', issued, T0 + 50, 'JOURNEY_TOO_FAST'],
    ['ve het han', issued, T0 + 10 * 60_000 + 1, 'JOURNEY_TOKEN_EXPIRED'],
  ])('%s -> chan', async (_name, saleToken, now, code) => {
    expect(await layer.evaluate(ctx({ saleToken, now }), policy)).toMatchObject({ blocked: true, code, status: 403 });
  });

  it('ve cua tai khoan / thiet bi / san pham khac -> chan (khong muon ve duoc)', async () => {
    for (const over of [{ accountId: 'other' }, { deviceId: 'other' }, { productId: 'other' }]) {
      expect(await layer.evaluate(ctx({ saleToken: issued, now: T0 + 2_000, ...over }), policy)).toMatchObject({ code: 'JOURNEY_TOKEN_MISMATCH' });
    }
  });

  it('nguoi that: mo trang, 1,2s sau dat -> qua', async () => {
    expect((await layer.evaluate(ctx({ saleToken: issued, now: T0 + 1_200 }), policy)).blocked).toBe(false);
  });
});

describe('L4 Han muc mua', () => {
  it('moi tai khoan toi da 2 san pham', async () => {
    const layer = new PurchaseQuotaLayer(new InMemoryCounterStore());
    expect((await layer.evaluate(ctx({ quantity: 2 }), policy)).blocked).toBe(false);

    expect(await layer.evaluate(ctx({ quantity: 1 }), policy)).toMatchObject({ blocked: true, rule: 'maxUnitsPerAccount', status: 409 });
  });

  it('nhieu tai khoan, cung so dien thoai nhan hang -> chan theo so dien thoai', async () => {
    const layer = new PurchaseQuotaLayer(new InMemoryCounterStore());
    await layer.evaluate(ctx({ accountId: 's1', quantity: 2, phone: '0988888888' }), policy);

    expect(await layer.evaluate(ctx({ accountId: 's2', quantity: 1, phone: '0988888888' }), policy)).toMatchObject({ rule: 'maxUnitsPerPhone' });
  });

  it('bi chan theo so dien thoai -> hoan lai phan da giu cua tai khoan; release() hoan ca hai', async () => {
    const store = new InMemoryCounterStore();
    const layer = new PurchaseQuotaLayer(store);
    await layer.evaluate(ctx({ accountId: 'x', quantity: 2, phone: '0911111111' }), policy);
    await layer.evaluate(ctx({ accountId: 'y', quantity: 2, phone: '0911111111' }), policy); // bi chan

    // tai khoan y khong bi tru han muc -> van mua duoc 2 voi so khac
    expect((await layer.evaluate(ctx({ accountId: 'y', quantity: 2, phone: '0922222222' }), policy)).blocked).toBe(false);

    const v = await layer.evaluate(ctx({ accountId: 'z', quantity: 1, phone: '0933333333' }), policy);
    if (v.blocked || !v.release) throw new Error('expected pass with release');
    await v.release();
    expect((await layer.evaluate(ctx({ accountId: 'z', quantity: 2, phone: '0933333333' }), policy)).blocked).toBe(false);
  });
});
