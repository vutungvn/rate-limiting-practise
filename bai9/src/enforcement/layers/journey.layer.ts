import { Injectable } from '@nestjs/common';
import { ShieldPolicy } from '../../policy/policy.types';
import { DefenseLayer, LayerVerdict, PASS, ShieldAction, ShieldContext } from '../defense-layer';
import { JourneyTokenService } from '../journey-token.service';

/**
 * LOP 3 - Hanh trinh nguoi dung. Chan: script goi thang API dat hang, bo qua trang san pham, hoac dat
 * nhanh hon kha nang thao tac cua nguoi (mo trang -> chon -> bam -> xac nhan).
 */
@Injectable()
export class JourneyLayer implements DefenseLayer {
  readonly id = 'journey' as const;
  readonly title = 'Lớp 3 – Hành trình người dùng';

  constructor(private readonly tokens: JourneyTokenService) {}

  appliesTo(action: ShieldAction): boolean {
    return action === 'order';
  }

  async evaluate(ctx: ShieldContext, policy: ShieldPolicy): Promise<LayerVerdict> {
    const p = policy.journey;
    const check = this.tokens.verify(ctx.saleToken, ctx.accountId, ctx.deviceId, ctx.productId);
    const block = (rule: string, code: string, message: string, threshold: unknown, observed: unknown): LayerVerdict => ({
      blocked: true,
      rule,
      code,
      status: 403,
      message,
      threshold,
      observed,
    });

    if (!check.ok) {
      const reasons = {
        missing: ['JOURNEY_TOKEN_MISSING', 'Vui lòng mở trang sản phẩm trước khi đặt hàng.'],
        invalid: ['JOURNEY_TOKEN_INVALID', 'Phiên đặt hàng không hợp lệ. Vui lòng tải lại trang sản phẩm.'],
        mismatch: ['JOURNEY_TOKEN_MISMATCH', 'Phiên đặt hàng không khớp tài khoản/thiết bị/sản phẩm. Vui lòng tải lại trang sản phẩm.'],
      } as const;
      const [code, message] = reasons[check.reason];
      return block('saleToken', code, message, 'vé hợp lệ từ trang sản phẩm', check.reason);
    }

    const ageMs = ctx.now - check.issuedAt;
    if (ageMs > p.tokenTtlMs) {
      return block('tokenTtlMs', 'JOURNEY_TOKEN_EXPIRED', 'Phiên đặt hàng đã hết hạn. Vui lòng tải lại trang sản phẩm.', p.tokenTtlMs, ageMs);
    }
    if (ageMs < p.minDwellMs) {
      return block(
        'minDwellMs',
        'JOURNEY_TOO_FAST',
        'Đơn hàng được gửi nhanh bất thường sau khi mở trang. Vui lòng kiểm tra lại đơn và bấm đặt hàng lần nữa.',
        p.minDwellMs,
        ageMs,
      );
    }
    return PASS;
  }
}
