import { Inject, Injectable } from '@nestjs/common';
import { ShieldPolicy } from '../../policy/policy.types';
import { COUNTER_STORE, CounterStore } from '../../storage/counter-store';
import { DefenseLayer, LayerVerdict, PASS, ShieldAction, ShieldContext } from '../defense-layer';

/**
 * LOP 2 - Trang trai tai khoan. Chan: mot may chay hang chuc tai khoan ao de vuot han muc "moi tai khoan".
 * Nhan dien: so tai khoan KHAC NHAU dat hang tu cung mot thiet bi trong cua so thoi gian.
 * Tai khoan da tung dat tu thiet bi nay luon duoc tiep tuc (khong "khoa lay" gia dinh dung chung may).
 */
@Injectable()
export class AccountFarmLayer implements DefenseLayer {
  readonly id = 'accountFarm' as const;
  readonly title = 'Lớp 2 – Trang trại tài khoản';

  constructor(@Inject(COUNTER_STORE) private readonly store: CounterStore) {}

  appliesTo(action: ShieldAction): boolean {
    return action === 'order';
  }

  async evaluate(ctx: ShieldContext, policy: ShieldPolicy): Promise<LayerVerdict> {
    const p = policy.accountFarm;
    const key = `farm:dev:${ctx.deviceId}`;
    const { size, has } = await this.store.distinct(key, ctx.accountId, ctx.now);

    if (!has && size >= p.maxAccountsPerDevice) {
      return {
        blocked: true,
        rule: 'maxAccountsPerDevice',
        code: 'ACCOUNT_FARM_SUSPECTED',
        status: 403,
        message: `Thiết bị này đã được dùng để đặt hàng bằng quá nhiều tài khoản khác nhau. Nếu bạn là khách hàng thật, vui lòng gửi khiếu nại kèm mã chặn.`,
        threshold: { maxAccountsPerDevice: p.maxAccountsPerDevice, windowMs: p.windowMs },
        observed: { accountsOnDevice: size + 1 },
      };
    }

    await this.store.addDistinct(key, ctx.accountId, p.windowMs, ctx.now);
    return PASS;
  }
}
