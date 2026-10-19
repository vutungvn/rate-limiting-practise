import { Injectable } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

interface TokenPayload {
  a: string; // accountId
  d: string; // deviceId
  p: string; // productId
  iat: number; // thoi diem phat ve (ms)
  n: string; // nonce
}

export type TokenCheck =
  | { ok: true; issuedAt: number }
  | { ok: false; reason: 'missing' | 'invalid' | 'mismatch' };

const b64 = (buf: Buffer | string) => Buffer.from(buf).toString('base64url');

/**
 * "Ve hanh trinh": trang san pham phat mot ve ky HMAC, gan voi (tai khoan, thiet bi, san pham, thoi diem).
 * Dat hang phai mang ve nay -> script goi thang API (bo qua giao dien) khong co ve, khong gia duoc ve,
 * va khong the dat ngay lap tuc sau khi mo trang.
 */
@Injectable()
export class JourneyTokenService {
  private readonly secret = process.env.SHIELD_TOKEN_SECRET ?? randomBytes(32).toString('hex');

  issue(accountId: string, deviceId: string, productId: string, now: number): string {
    const payload: TokenPayload = { a: accountId, d: deviceId, p: productId, iat: now, n: randomBytes(8).toString('hex') };
    const body = b64(JSON.stringify(payload));
    return `${body}.${this.sign(body)}`;
  }

  verify(token: string | undefined, accountId: string, deviceId: string, productId: string): TokenCheck {
    if (!token) return { ok: false, reason: 'missing' };
    const [body, sig] = token.split('.');
    if (!body || !sig) return { ok: false, reason: 'invalid' };

    const expected = Buffer.from(this.sign(body));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: 'invalid' };

    let payload: TokenPayload;
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
      return { ok: false, reason: 'invalid' };
    }
    if (payload.a !== accountId || payload.d !== deviceId || payload.p !== productId) return { ok: false, reason: 'mismatch' };
    return { ok: true, issuedAt: payload.iat };
  }

  private sign(body: string): string {
    return createHmac('sha256', this.secret).update(body).digest('base64url');
  }
}
