import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { ShieldPolicy } from '../../policy/policy.types';
import { COUNTER_STORE, CounterStore } from '../../storage/counter-store';
import { DefenseLayer, LayerVerdict, ShieldAction, ShieldContext } from '../defense-layer';

export const phoneHash = (phone: string) => createHash('sha256').update(phone).digest('hex').slice(0, 16);

/**
 * LOP 4 - Han muc mua. Chan: gom hang de ban lai. Ngoai han muc moi TAI KHOAN, con han muc moi
 * SO DIEN THOAI NHAN HANG - ke gom hang dung nhieu tai khoan / nhieu thiet bi van phai nhan hang ve
 * mot so dien thoai. Giu cho (kiem tra + cong nguyen tu) roi hoan lai neu don that bai.
 */
@Injectable()
export class PurchaseQuotaLayer implements DefenseLayer {
  readonly id = 'purchaseQuota' as const;
  readonly title = 'Lớp 4 – Hạn mức mua';

  constructor(@Inject(COUNTER_STORE) private readonly store: CounterStore) {}

  appliesTo(action: ShieldAction): boolean {
    return action === 'order';
  }

  async evaluate(ctx: ShieldContext, policy: ShieldPolicy): Promise<LayerVerdict> {
    const p = policy.purchaseQuota;
    const qty = ctx.quantity ?? 1;
    const accountKey = `quota:acct:${ctx.accountId}:${ctx.productId}`;
    const phoneKey = `quota:phone:${phoneHash(ctx.phone ?? '')}:${ctx.productId}`;

    const byAccount = await this.store.addIfWithin(accountKey, qty, p.maxUnitsPerAccount, p.windowMs, ctx.now);
    if (!byAccount.ok) {
      return this.block('maxUnitsPerAccount', p.maxUnitsPerAccount, byAccount.total, qty, 'tài khoản');
    }

    const byPhone = await this.store.addIfWithin(phoneKey, qty, p.maxUnitsPerPhone, p.windowMs, ctx.now);
    if (!byPhone.ok) {
      await this.store.subtract(accountKey, qty);
      return this.block('maxUnitsPerPhone', p.maxUnitsPerPhone, byPhone.total, qty, 'số điện thoại nhận hàng');
    }

    return {
      blocked: false,
      release: async () => {
        await this.store.subtract(accountKey, qty);
        await this.store.subtract(phoneKey, qty);
      },
    };
  }

  private block(rule: string, max: number, used: number, requested: number, scope: string): LayerVerdict {
    const left = Math.max(0, max - used);
    return {
      blocked: true,
      rule,
      code: 'PURCHASE_LIMIT_EXCEEDED',
      status: 409,
      message: `Mỗi ${scope} chỉ được mua tối đa ${max} sản phẩm này trong đợt sale. Bạn còn được mua ${left}.`,
      threshold: max,
      observed: { alreadyBought: used, requested },
    };
  }
}
