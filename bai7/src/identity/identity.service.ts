import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { LOWEST_PLAN, PLAN_LIMITS, Plan, isPlan } from '../quota/plans';
import { SellerStore } from './seller.store';

export type ApiKeyStatus = 'active' | 'missing' | 'invalid' | 'revoked';

export interface Identity {
  /** Dinh danh bo dem: seller:<id> neu khoa hop le, nguoc lai ip:<ip>. */
  subject: string;
  plan: Plan;
  apiKeyStatus: ApiKeyStatus;
  sellerId?: string;
  /** Thong bao cho nha ban hang khi bi ha xuong han muc thap nhat. */
  notice?: string;
}

const LOWEST = PLAN_LIMITS[LOWEST_PLAN].displayName;
const FALLBACK = `Hệ thống áp dụng hạn mức thấp nhất (gói ${LOWEST}), tính theo địa chỉ IP.`;

@Injectable()
export class IdentityService {
  constructor(private readonly store: SellerStore) {}

  resolve(req: Request): Identity {
    const key = req.header('x-api-key')?.trim();

    // BAY 2a: khong mang khoa -> han muc thap nhat.
    if (!key) {
      return this.lowest(req, 'missing', `Request không có header x-api-key. ${FALLBACK}`);
    }

    const apiKey = this.store.findKey(key);
    const seller = apiKey && this.store.findSeller(apiKey.sellerId);
    if (!apiKey || !seller) {
      return this.lowest(req, 'invalid', `API key không tồn tại. ${FALLBACK} Hãy kiểm tra lại khoá trong trang quản trị nhà bán hàng.`);
    }

    // BAY 2b: khoa da thu hoi -> han muc thap nhat, KHONG duoc huong goi cua chu khoa,
    // va cung khong dem vao bo dem cua chu khoa (ke cam khoa lo khong lam can han muc cua ho).
    if (apiKey.revokedAt) {
      return this.lowest(
        req,
        'revoked',
        `API key đã bị thu hồi lúc ${apiKey.revokedAt}. ${FALLBACK} Hãy tạo khoá mới để dùng lại hạn mức của gói.`,
      );
    }

    // BAY 1: goi doc moi request tu kho (khong cache) -> nang cap giua chung co hieu luc ngay.
    // Du lieu goi hong / goi la -> ve goi thap nhat thay vi nem loi hay vo tinh cho goi cao.
    const plan = isPlan(seller.plan) ? seller.plan : LOWEST_PLAN;
    return { subject: `seller:${seller.id}`, plan, apiKeyStatus: 'active', sellerId: seller.id };
  }

  private lowest(req: Request, apiKeyStatus: ApiKeyStatus, notice: string): Identity {
    return { subject: `ip:${req.ip}`, plan: LOWEST_PLAN, apiKeyStatus, notice };
  }
}
