/**
 * NHOM CFG - Kiem tra tinh cau hinh (metadata), chan hoi quy khi ai do vo tinh xoa guard / them lai @SkipThrottle.
 * Dac ta chi tiet: TESTCASES.md, muc "Nhom CFG".
 */
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AppModule } from '../src/app.module';
import { AuthController } from '../src/auth/auth.controller';
import { OrderController } from '../src/order/order.controller';
import { BuggyAppModule, BuggyAuthController } from '../src/buggy/buggy-app.module';
import { trackByAccount, trackByPhone } from '../src/common/trackers';

// Ten metadata ma @Throttle / @SkipThrottle ghi len handler (throttler named "default").
const LIMIT = 'THROTTLER:LIMITdefault';
const TTL = 'THROTTLER:TTLdefault';
const TRACKER = 'THROTTLER:TRACKERdefault';
const SKIP = 'THROTTLER:SKIPdefault';

const providersOf = (module: object): any[] => Reflect.getMetadata('providers', module) ?? [];
const hasGlobalThrottlerGuard = (module: object) =>
  providersOf(module).some((p) => p?.provide === APP_GUARD && p?.useClass === ThrottlerGuard);

describe('Nhom CFG - cau hinh', () => {
  it('TC-CFG-01: AppModule dang ky ThrottlerGuard qua APP_GUARD', () => {
    expect(hasGlobalThrottlerGuard(AppModule)).toBe(true);
  });

  it('TC-CFG-02: POST /orders/flash-sale khai bao limit = 3, ttl = 60 000 ms, dem theo tai khoan', () => {
    const handler = OrderController.prototype.createFlashSaleOrder;

    expect(Reflect.getMetadata(LIMIT, handler)).toBe(3);
    expect(Reflect.getMetadata(TTL, handler)).toBe(60_000);
    expect(Reflect.getMetadata(TRACKER, handler)).toBe(trackByAccount);
    expect(Reflect.getMetadata(SKIP, handler)).toBeUndefined();
  });

  it('TC-CFG-03: POST /auth/send-otp khai bao limit = 3, ttl = 300 000 ms, dem theo so dien thoai, KHONG co @SkipThrottle', () => {
    const handler = AuthController.prototype.sendOtp;

    expect(Reflect.getMetadata(LIMIT, handler)).toBe(3);
    expect(Reflect.getMetadata(TTL, handler)).toBe(300_000);
    expect(Reflect.getMetadata(TRACKER, handler)).toBe(trackByPhone);
    expect(Reflect.getMetadata(SKIP, handler)).toBeUndefined();
    expect(Reflect.getMetadata(SKIP, AuthController)).toBeUndefined();
  });

  it('TC-CFG-04: doi chung ban goc - khong co APP_GUARD va send-otp bi @SkipThrottle', () => {
    expect(hasGlobalThrottlerGuard(BuggyAppModule)).toBe(false);
    expect(Reflect.getMetadata(SKIP, BuggyAuthController.prototype.sendOtp)).toBe(true);
  });
});
