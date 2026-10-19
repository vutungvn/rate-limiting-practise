/**
 * Kich ban demo: 4 loai bot + nhieu kieu khach that cung "san" flash sale, roi doi nguong luc dang chay.
 * Dung chung cho `npm run demo` (in bao cao) va test/demo.e2e-spec.ts (kiem chung tu dong).
 */
const PRODUCT = 'iphone-17-flash';
export const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? 'admin-secret';

const CODE_TO_LAYER: Record<string, string> = {
  VELOCITY_LIMIT: 'velocity',
  ACCOUNT_FARM_SUSPECTED: 'accountFarm',
  JOURNEY_TOKEN_MISSING: 'journey',
  JOURNEY_TOKEN_INVALID: 'journey',
  JOURNEY_TOKEN_MISMATCH: 'journey',
  JOURNEY_TOKEN_EXPIRED: 'journey',
  JOURNEY_TOO_FAST: 'journey',
  PURCHASE_LIMIT_EXCEEDED: 'purchaseQuota',
};

export interface ActorResult {
  actor: string;
  kind: 'human' | 'bot';
  /** Lop du kien chan bot nay. */
  expectedLayer?: string;
  requests: number;
  succeeded: number;
  replayed: number;
  blockedBy: Record<string, number>;
  blockIds: string[];
  unitsBought: number;
  otherErrors: Record<string, number>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** So ngau nhien co hat giong - moi lan chay demo cung hanh vi. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Actor {
  readonly result: ActorResult;

  constructor(
    private readonly base: string,
    name: string,
    kind: 'human' | 'bot',
    expectedLayer?: string,
  ) {
    this.result = { actor: name, kind, expectedLayer, requests: 0, succeeded: 0, replayed: 0, blockedBy: {}, blockIds: [], unitsBought: 0, otherErrors: {} };
  }

  async view(account: string, device: string): Promise<string | undefined> {
    const body = await this.call('GET', `/api/flash-sales/${PRODUCT}`, account, device);
    return body?.saleToken;
  }

  async order(account: string, device: string, input: { saleToken?: string; quantity: number; phone: string }) {
    return this.call('POST', `/api/flash-sales/${PRODUCT}/orders`, account, device, {
      saleToken: input.saleToken,
      quantity: input.quantity,
      shippingPhone: input.phone,
    });
  }

  private async call(method: string, path: string, account: string, device: string, body?: unknown) {
    this.result.requests++;
    const res = await fetch(this.base + path, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-account-id': account,
        'x-device-id': device,
        'user-agent': this.result.kind === 'bot' ? 'python-requests/2.32' : 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      this.result.succeeded++;
      if (json.replayed) this.result.replayed++;
      else if (json.order) this.result.unitsBought += json.order.quantity;
      return json;
    }
    const layer = CODE_TO_LAYER[json.code];
    if (layer) {
      this.result.blockedBy[layer] = (this.result.blockedBy[layer] ?? 0) + 1;
      this.result.blockIds.push(json.blockId);
    } else {
      const key = `${res.status} ${json.code ?? ''}`.trim();
      this.result.otherErrors[key] = (this.result.otherErrors[key] ?? 0) + 1;
    }
    return undefined;
  }
}

// ---------------------------------------------------------------- khach that

async function humans(base: string): Promise<ActorResult[]> {
  const random = rng(1111);
  const between = (min: number, max: number) => min + Math.floor(random() * (max - min));
  const flows: Array<Promise<ActorResult>> = [];

  // 20 khach binh thuong: xem 1-3 lan, can nhac 1,5-3,5s, mua 1-2 cai. Tat ca chung 1 IP (nhu van phong / 4G).
  for (let i = 1; i <= 20; i++) {
    const a = new Actor(base, `khach-${String(i).padStart(2, '0')}`, 'human');
    const views = between(1, 4);
    const think = between(1_500, 3_500);
    const qty = random() < 0.5 ? 1 : 2;
    flows.push(
      (async () => {
        await sleep(between(0, 1_500));
        let token: string | undefined;
        for (let v = 0; v < views; v++) {
          token = await a.view(`cus-${i}`, `dev-cus-${i}`);
          await sleep(between(300, 900));
        }
        await sleep(think);
        await a.order(`cus-${i}`, `dev-cus-${i}`, { saleToken: token, quantity: qty, phone: `09100000${String(i).padStart(2, '0')}` });
        return a.result;
      })(),
    );
  }

  // Gia dinh: 2 nguoi dung chung 1 may, chung so dien thoai nha, moi nguoi 1 cai.
  const family = new Actor(base, 'gia-dinh (2 tk / 1 may)', 'human');
  flows.push(
    (async () => {
      for (const member of ['fam-bo', 'fam-me']) {
        const token = await family.view(member, 'dev-family-ipad');
        await sleep(2_000);
        await family.order(member, 'dev-family-ipad', { saleToken: token, quantity: 1, phone: '0977000111' });
      }
      return family.result;
    })(),
  );

  // 3 khach bam "Dat hang" 2 lan GAN NHU DONG THOI (mang cham) - lan 2 phai nhan lai don cu, khong bi chan.
  for (let i = 1; i <= 3; i++) {
    const a = new Actor(base, `bam-2-lan-${i}`, 'human');
    flows.push(
      (async () => {
        const token = await a.view(`dbl-${i}`, `dev-dbl-${i}`);
        await sleep(2_000);
        const input = { saleToken: token, quantity: 2, phone: `09200000${i}0` };
        await Promise.all([a.order(`dbl-${i}`, `dev-dbl-${i}`, input), sleep(30).then(() => a.order(`dbl-${i}`, `dev-dbl-${i}`, input))]);
        return a.result;
      })(),
    );
  }

  // Khach "nong ruot" luc 0h: F5 15 lan moi 0,6s roi moi mua.
  const eager = new Actor(base, 'khach-F5-lien-tuc', 'human');
  flows.push(
    (async () => {
      let token: string | undefined;
      for (let v = 0; v < 15; v++) {
        token = await eager.view('cus-eager', 'dev-cus-eager');
        await sleep(600);
      }
      await sleep(1_200);
      await eager.order('cus-eager', 'dev-cus-eager', { saleToken: token, quantity: 1, phone: '0930000001' });
      return eager.result;
    })(),
  );

  // Khach thao tac nhanh nhat ma van la nguoi: 1,2s tu luc mo trang den luc bam dat.
  const quick = new Actor(base, 'khach-nhanh-tay', 'human');
  flows.push(
    (async () => {
      const token = await quick.view('cus-quick', 'dev-cus-quick');
      await sleep(1_200);
      await quick.order('cus-quick', 'dev-cus-quick', { saleToken: token, quantity: 1, phone: '0930000002' });
      return quick.result;
    })(),
  );

  return Promise.all(flows);
}

// ---------------------------------------------------------------- bot

/** Bot 1: F5 lien tuc 300 lan de "canh" mo ban -> lop Toc do. */
async function refreshHammer(base: string) {
  const a = new Actor(base, 'bot-1 dap F5 (300 req)', 'bot', 'velocity');
  for (let i = 0; i < 300; i++) await a.view('bot-hammer', 'dev-bot-hammer');
  return a.result;
}

/**
 * Bot 2: 1 may chay nhieu tai khoan, moi tai khoan lam dung quy trinh va dung so dien thoai rieng
 * (de chi lop Trang trai tai khoan nhan ra) -> lop Trang trai tai khoan.
 */
async function accountFarm(
  base: string,
  opts: { device: string; accounts: number; prefix: string; phoneBase: string; name: string; expectBlocked: boolean },
) {
  const a = new Actor(base, opts.name, 'bot', opts.expectBlocked ? 'accountFarm' : undefined);
  for (let i = 1; i <= opts.accounts; i++) {
    const token = await a.view(`${opts.prefix}-${i}`, opts.device);
    await sleep(1_000);
    await a.order(`${opts.prefix}-${i}`, opts.device, { saleToken: token, quantity: 2, phone: `${opts.phoneBase}${i}` });
  }
  return a.result;
}

/** Bot 3: goi thang API dat hang - khong co ve, ve gia, hoac dat ngay 30ms sau khi mo trang -> lop Hanh trinh. */
async function directApi(base: string) {
  const a = new Actor(base, 'bot-3 goi thang API', 'bot', 'journey');
  for (let i = 1; i <= 2; i++) await a.order(`api-${i}`, `dev-api-${i}`, { quantity: 1, phone: `094000000${i}` });
  for (let i = 3; i <= 4; i++) await a.order(`api-${i}`, `dev-api-${i}`, { saleToken: 'eyJhIjoiYXBpIn0.chu-ky-gia', quantity: 1, phone: `094000000${i}` });
  for (let i = 5; i <= 6; i++) {
    const token = await a.view(`api-${i}`, `dev-api-${i}`);
    await sleep(30);
    await a.order(`api-${i}`, `dev-api-${i}`, { saleToken: token, quantity: 1, phone: `094000000${i}` });
  }
  return a.result;
}

/** Bot 4: gom hang - 5 tai khoan, 5 may khac nhau, nhung cung so nhan hang -> lop Han muc mua. */
async function scalper(base: string) {
  const a = new Actor(base, 'bot-4 gom hang (5 tk, 5 may, 1 sdt)', 'bot', 'purchaseQuota');
  for (let i = 1; i <= 5; i++) {
    const token = await a.view(`scalper-${i}`, `dev-scalper-${i}`);
    await sleep(1_000);
    await a.order(`scalper-${i}`, `dev-scalper-${i}`, { saleToken: token, quantity: 2, phone: '0988888888' });
  }
  return a.result;
}

// ---------------------------------------------------------------- admin

async function admin(base: string, method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-admin-token': ADMIN_TOKEN },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

export interface DemoResult {
  phase1: ActorResult[];
  tuning: {
    before: { version: number; maxAccountsPerDevice: number; pid: number; serverStartedAt: string };
    waveBefore: ActorResult;
    after: { version: number; maxAccountsPerDevice: number; pid: number; serverStartedAt: string };
    waveAfter: ActorResult;
    rejectedPatch: { status: number; body: unknown };
  };
  trace: { blockId: string; record: unknown };
  report: Record<string, unknown>;
  robustness: Array<{ case: string; status: number; code?: string }>;
}

export async function runDemo(base: string): Promise<DemoResult> {
  await admin(base, 'POST', '/admin/reset');

  // PHA 1 - mo ban: khach that va 4 loai bot cung luc.
  const farm = accountFarm(base, { device: 'dev-bot-farm', accounts: 8, prefix: 'farm', phoneBase: '096100000', name: 'bot-2 trang trai (8 tk / 1 may)', expectBlocked: true });
  const phase1 = (await Promise.all([humans(base), Promise.all([refreshHammer(base), farm, directApi(base), scalper(base)])])).flat();

  // PHA 2 - doi nguong luc dang chay: doi van hanh thay trang trai van lot 3 tai khoan/may -> ha xuong 2.
  const p1 = (await admin(base, 'GET', '/admin/policy')).body;
  const waveBefore = await accountFarm(base, {
    device: 'dev-bot-farm-B',
    accounts: 3,
    prefix: 'farmB',
    phoneBase: '096200000',
    name: 'bot-2b trang trai dot B (3 tk) - TRUOC khi doi nguong',
    expectBlocked: false,
  });
  const rejectedPatch = await admin(base, 'PATCH', '/admin/policy?by=ops-demo', { patch: { accountFarm: { maxAcountsPerDevice: 2 } }, reason: 'go nham ten' });
  const p2 = (await admin(base, 'PATCH', '/admin/policy?by=ops-demo', { patch: { accountFarm: { maxAccountsPerDevice: 2 } }, reason: 'trang trai dang lot 3 tk/may' })).body;
  const waveAfter = await accountFarm(base, {
    device: 'dev-bot-farm-C',
    accounts: 3,
    prefix: 'farmC',
    phoneBase: '096300000',
    name: 'bot-2c trang trai dot C (3 tk) - SAU khi doi nguong',
    expectBlocked: true,
  });

  // Truy vet mot lan chan cu the (lan chan dau tien sau khi doi nguong).
  const blockId = waveAfter.blockIds[0];
  const record = (await admin(base, 'GET', `/admin/blocks/${blockId}`)).body;

  // Doi van hanh xem xet tung lan chan (o day dung "su that" cua kich ban de gan nhan).
  for (const actor of [...phase1, waveBefore, waveAfter]) {
    for (const id of actor.blockIds) {
      await admin(base, 'POST', `/admin/blocks/${id}/verdict?by=ops-demo`, {
        verdict: actor.kind === 'human' ? 'false-positive' : 'confirmed-abuse',
        note: actor.actor,
      });
    }
  }
  const report = (await admin(base, 'GET', '/admin/report')).body;

  // Ngoai le: du lieu rac / sai dinh dang -> phan hoi 4xx co cau truc, server khong sap.
  const robustness: DemoResult['robustness'] = [];
  const probe = async (name: string, init: RequestInit & { path: string }) => {
    const res = await fetch(base + init.path, init);
    const body = await res.json().catch(() => ({}));
    robustness.push({ case: name, status: res.status, code: body.code });
  };
  const h = { 'content-type': 'application/json', 'x-account-id': 'probe', 'x-device-id': 'dev-probe' };
  await probe('JSON hỏng', { path: `/api/flash-sales/${PRODUCT}/orders`, method: 'POST', headers: h, body: '{"quantity": 1,,' });
  await probe('quantity = "nhiều"', { path: `/api/flash-sales/${PRODUCT}/orders`, method: 'POST', headers: h, body: JSON.stringify({ quantity: 'nhiều', shippingPhone: '0912345678' }) });
  await probe('Thiếu đăng nhập', { path: `/api/flash-sales/${PRODUCT}`, method: 'GET' });
  await probe('Sản phẩm không tồn tại', { path: '/api/flash-sales/khong-co', method: 'GET', headers: h });
  await probe('Route không tồn tại', { path: '/api/khong-co', method: 'GET', headers: h });
  await probe('Server vẫn sống sau các lỗi trên', { path: `/api/flash-sales/${PRODUCT}`, method: 'GET', headers: h });

  const pick = (p: { version: number; policy: { accountFarm: { maxAccountsPerDevice: number } }; pid: number; serverStartedAt: string }) => ({
    version: p.version,
    maxAccountsPerDevice: p.policy.accountFarm.maxAccountsPerDevice,
    pid: p.pid,
    serverStartedAt: p.serverStartedAt,
  });
  return {
    phase1,
    tuning: { before: pick(p1), waveBefore, after: pick(p2), waveAfter, rejectedPatch },
    trace: { blockId, record },
    report,
    robustness,
  };
}
