import { DEFAULT_POLICY } from '../src/policy/default-policy';
import { PolicyStore, PolicyValidationError } from '../src/policy/policy.store';
import { validatePolicy } from '../src/policy/policy.validator';

describe('Tang chinh sach', () => {
  it('chinh sach mac dinh hop le', () => {
    expect(validatePolicy(DEFAULT_POLICY)).toEqual([]);
  });

  it('doi mot nguong -> tao phien ban moi, cac nguong khac giu nguyen', () => {
    const store = new PolicyStore();
    const v2 = store.update({ accountFarm: { maxAccountsPerDevice: 2 } }, 'ops', 'thu nghiem');

    expect(v2.version).toBe(2);
    expect(v2.policy.accountFarm.maxAccountsPerDevice).toBe(2);
    expect(v2.policy.accountFarm.windowMs).toBe(DEFAULT_POLICY.accountFarm.windowMs);
    expect(v2.policy.velocity).toEqual(DEFAULT_POLICY.velocity);
    expect(store.history().map((v) => v.version)).toEqual([1, 2]);
  });

  it('go nham ten khoa -> tu choi (khong "tuong da doi nguong ma thuc ra khong")', () => {
    const store = new PolicyStore();

    expect(() => store.update({ accountFarm: { maxAcountsPerDevice: 2 } }, 'ops')).toThrow(PolicyValidationError);
    expect(store.current().version).toBe(1);
  });

  it.each<[unknown, string]>([
    [{ velocity: { perAccount: { browse: { limit: 0 } } } }, 'limit = 0'],
    [{ journey: { minDwellMs: -1 } }, 'so am'],
    [{ purchaseQuota: { mode: 'tat' } }, 'mode la'],
    [{ accountFarm: { maxAccountsPerDevice: 2.5 } }, 'so thuc'],
    [{ velocity: 'nhanh' }, 'sai kieu'],
  ])('gia tri sai (%j - %s) -> tu choi ca ban va, chinh sach dang chay giu nguyen', (patch) => {
    const store = new PolicyStore();
    const before = store.current();

    expect(() => store.update(patch, 'ops')).toThrow(PolicyValidationError);
    expect(store.current()).toBe(before);
  });

  it('phien ban cu khong bi sua khi doi nguong (log cu van tra duoc nguong luc chan)', () => {
    const store = new PolicyStore();
    store.update({ journey: { minDwellMs: 1_500 } }, 'ops');

    expect(store.history()[0].policy.journey.minDwellMs).toBe(800);
  });
});
