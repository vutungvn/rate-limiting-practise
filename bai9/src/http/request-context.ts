import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Request } from 'express';
import { ShieldAction, ShieldContext } from '../enforcement/defense-layer';

export type ShieldRequest = Request & { requestId?: string; shield?: ShieldContext };

export const MAX_QUANTITY_PER_ORDER = 5;

/** Chuan hoa so dien thoai Viet Nam: "+84 912-345-678" va "0912345678" la mot. */
export function normalizePhone(raw: unknown): string {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.startsWith('84')) digits = '0' + digits.slice(2);
  return digits;
}

export const requestIdOf = (req: ShieldRequest): string =>
  (req.requestId ??= (req.header('x-request-id') || `req_${randomBytes(6).toString('hex')}`).slice(0, 64));

/**
 * Chuyen request HTTP thanh ShieldContext. Loi dau vao (thieu dang nhap, du lieu sai) tra 400/401
 * TRUOC khi vao la chan - day khong phai "chan lam dung" nen khong tinh vao log chan.
 */
export function buildShieldContext(req: ShieldRequest, action: ShieldAction, now: number): ShieldContext {
  // Xac thuc gia lap: moi truong that lay tu JWT / session.
  const accountId = req.header('x-account-id')?.trim();
  if (!accountId) throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Vui lòng đăng nhập (thiếu x-account-id).' });

  // Dau van tay thiet bi do SDK phia client gui len.
  const deviceId = req.header('x-device-id')?.trim();
  if (!deviceId) throw new BadRequestException({ code: 'DEVICE_ID_REQUIRED', message: 'Thiếu x-device-id.' });

  const ctx: ShieldContext = {
    requestId: requestIdOf(req),
    action,
    method: req.method,
    path: req.originalUrl,
    productId: String(req.params.productId ?? ''),
    accountId: accountId.slice(0, 128),
    deviceId: deviceId.slice(0, 128),
    ip: req.ip ?? 'unknown',
    userAgent: (req.header('user-agent') ?? '').slice(0, 256),
    now,
  };

  if (action === 'order') {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const quantity = body.quantity ?? 1;
    if (!Number.isInteger(quantity) || (quantity as number) < 1 || (quantity as number) > MAX_QUANTITY_PER_ORDER) {
      throw new BadRequestException({ code: 'INVALID_QUANTITY', message: `quantity phải là số nguyên 1-${MAX_QUANTITY_PER_ORDER}.` });
    }
    const phone = normalizePhone(body.shippingPhone);
    if (phone.length < 9 || phone.length > 11) {
      throw new BadRequestException({ code: 'INVALID_PHONE', message: 'shippingPhone không hợp lệ.' });
    }
    ctx.quantity = quantity as number;
    ctx.phone = phone;
    ctx.saleToken = typeof body.saleToken === 'string' ? body.saleToken : undefined;
  }
  return ctx;
}
