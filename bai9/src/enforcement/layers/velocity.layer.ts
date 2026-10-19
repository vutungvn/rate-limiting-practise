import { Inject, Injectable } from '@nestjs/common';
import { RateRule, ShieldPolicy } from '../../policy/policy.types';
import { COUNTER_STORE, CounterStore } from '../../storage/counter-store';
import { DefenseLayer, LayerVerdict, PASS, ShieldAction, ShieldContext } from '../defense-layer';

/**
 * LOP 1 - Toc do. Chan: bot "dap" lien tuc vao trang san pham / nut dat hang (nguyen nhan sap he thong
 * 20 phut nam ngoai). Dem theo TAI KHOAN va THIET BI - khong theo IP de khong chan oan ca van phong / 4G dung chung IP.
 */
@Injectable()
export class VelocityLayer implements DefenseLayer {
  readonly id = 'velocity' as const;
  readonly title = 'Lớp 1 – Tốc độ request';

  constructor(@Inject(COUNTER_STORE) private readonly store: CounterStore) {}

  appliesTo(): boolean {
    return true;
  }

  async evaluate(ctx: ShieldContext, policy: ShieldPolicy): Promise<LayerVerdict> {
    const p = policy.velocity;
    const checks: Array<[string, string, RateRule]> = [
      [`perAccount.${ctx.action}`, `vel:acct:${ctx.accountId}:${ctx.action}`, p.perAccount[ctx.action]],
      [`perDevice.${ctx.action}`, `vel:dev:${ctx.deviceId}:${ctx.action}`, p.perDevice[ctx.action]],
    ];

    // Dem ca hai khoa truoc roi moi ket luan, de bo dem thiet bi khong bi bo sot khi khoa tai khoan da vuot.
    const counts = await Promise.all(checks.map(([, key, rule]) => this.store.hit(key, rule.windowMs, ctx.now)));
    const index = checks.findIndex(([, , rule], i) => counts[i] > rule.limit);
    if (index < 0) return PASS;

    const [rule, , limits] = checks[index];
    return {
      blocked: true,
      rule,
      code: 'VELOCITY_LIMIT',
      status: 429,
      message: `Bạn đang ${actionLabel(ctx.action)} quá nhanh. Vui lòng thử lại sau ít giây.`,
      threshold: limits,
      observed: Math.ceil(counts[index]),
      retryAfterSec: Math.ceil(limits.windowMs / 1000),
    };
  }
}

const actionLabel = (a: ShieldAction) => (a === 'browse' ? 'xem sản phẩm' : 'đặt hàng');
