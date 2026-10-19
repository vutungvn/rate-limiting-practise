/**
 * Bo may thuc thi: thu tu lop, che do shadow, fail-open khi lop loi, hoan han muc khi bi chan.
 */
import { DefenseLayer, ShieldContext } from '../src/enforcement/defense-layer';
import { Shield } from '../src/enforcement/shield';
import { BlockLog } from '../src/observability/block-log';
import { ShieldMetrics } from '../src/observability/shield-metrics';
import { PolicyStore } from '../src/policy/policy.store';

process.env.SHIELD_LOG_FILE = 'off';

const ctx: ShieldContext = {
  requestId: 'req-1',
  action: 'order',
  method: 'POST',
  path: '/api/x',
  productId: 'p1',
  accountId: 'acc',
  deviceId: 'dev',
  ip: '1.1.1.1',
  userAgent: 'ua',
  quantity: 1,
  phone: '0912345678',
  now: 0,
};

const passing = (id: DefenseLayer['id'], release?: () => Promise<void>): DefenseLayer => ({
  id,
  title: id,
  appliesTo: () => true,
  evaluate: jest.fn().mockResolvedValue({ blocked: false, release }),
});
const blocking = (id: DefenseLayer['id']): DefenseLayer => ({
  id,
  title: id,
  appliesTo: () => true,
  evaluate: jest.fn().mockResolvedValue({ blocked: true, rule: 'r', code: 'C', status: 403, message: 'm', threshold: 1, observed: 2 }),
});
const throwing = (id: DefenseLayer['id']): DefenseLayer => ({
  id,
  title: id,
  appliesTo: () => true,
  evaluate: jest.fn().mockRejectedValue(new Error('redis down')),
});

function setup(layers: DefenseLayer[]) {
  const policies = new PolicyStore();
  const blockLog = new BlockLog();
  const metrics = new ShieldMetrics(blockLog, policies);
  return { shield: new Shield(layers, policies, blockLog, metrics), policies, blockLog, metrics };
}

describe('Shield', () => {
  it('dung o lop dau tien chan; lop sau khong duoc goi', async () => {
    const later = passing('purchaseQuota');
    const { shield } = setup([passing('velocity'), blocking('journey'), later]);

    const d = await shield.inspect(ctx);
    expect(d.allowed).toBe(false);
    expect(later.evaluate).not.toHaveBeenCalled();
  });

  it('lan chan ghi log du thong tin truy vet: lop, quy tac, nguong, gia tri do, phien ban chinh sach, chu the', async () => {
    const { shield, blockLog } = setup([blocking('accountFarm')]);
    const d = await shield.inspect(ctx);
    if (d.allowed) throw new Error('expected block');

    expect(blockLog.get(d.block.blockId)).toMatchObject({
      requestId: 'req-1',
      layer: 'accountFarm',
      rule: 'r',
      code: 'C',
      threshold: 1,
      observed: 2,
      policyVersion: 1,
      action: 'blocked',
      subject: { accountId: 'acc', deviceId: 'dev', ip: '1.1.1.1', productId: 'p1' },
      request: { method: 'POST', path: '/api/x' },
    });
    expect(JSON.stringify(blockLog.get(d.block.blockId))).not.toContain('0912345678');
  });

  it('che do shadow: ghi "would-block" nhung van cho qua - do chan nham truoc khi bat that', async () => {
    const { shield, policies, blockLog, metrics } = setup([blocking('journey')]);
    policies.update({ journey: { mode: 'shadow' } }, 'ops');

    expect((await shield.inspect(ctx)).allowed).toBe(true);
    expect(blockLog.query()[0]).toMatchObject({ action: 'would-block', mode: 'shadow', policyVersion: 2 });
    expect(metrics.report().totals.wouldBlockInShadow).toBe(1);
  });

  it('mode off: bo qua lop', async () => {
    const layer = blocking('velocity');
    const { shield, policies } = setup([layer]);
    policies.update({ velocity: { mode: 'off' } }, 'ops');

    expect((await shield.inspect(ctx)).allowed).toBe(true);
    expect(layer.evaluate).not.toHaveBeenCalled();
  });

  it('lop gap loi (kho dem sap) -> fail-open: bo qua lop do, cac lop khac van chay, khong nem loi', async () => {
    const after = blocking('purchaseQuota');
    const { shield, metrics } = setup([throwing('velocity'), after]);

    const d = await shield.inspect(ctx);
    expect(d.allowed).toBe(false);
    expect(after.evaluate).toHaveBeenCalled();
    expect(metrics.report().totals.layerErrors).toBe(1);
  });

  it('bi chan o lop sau -> hoan lai phan da giu o lop truoc', async () => {
    const release = jest.fn().mockResolvedValue(undefined);
    const { shield } = setup([passing('purchaseQuota', release), blocking('journey')]);

    await shield.inspect(ctx);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('doi nguong giua chung: request ke tiep dung chinh sach moi', async () => {
    const layer = passing('velocity');
    const { shield, policies } = setup([layer]);
    await shield.inspect(ctx);
    policies.update({ velocity: { perAccount: { order: { limit: 1 } } } }, 'ops');
    await shield.inspect(ctx);

    const calls = (layer.evaluate as jest.Mock).mock.calls;
    expect(calls[0][1].velocity.perAccount.order.limit).toBe(5);
    expect(calls[1][1].velocity.perAccount.order.limit).toBe(1);
  });
});
