/**
 * NHOM BUG - Chung minh loi bang du lieu tren cau hinh goc cua ShopFast.
 * Cac test nay PASS nghia la LOI DUOC TAI HIEN (assert theo hanh vi SAI dang xay ra).
 * Dac ta chi tiet: TESTCASES.md, muc "Nhom BUG".
 */
import { Body, Controller, INestApplication, Module, Post } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { BuggyAppModule } from '../src/buggy/buggy-app.module';
import { SendOtpDto } from '../src/auth/send-otp.dto';
import {
  MINUTE,
  count,
  createApp,
  fakeIp,
  placeFlashSaleOrder,
  sendOtp,
  statuses,
  trustProxy,
  useFakeClock,
} from './helpers';

const GLOBAL_GUARD = { provide: APP_GUARD, useClass: ThrottlerGuard };

// Bien the "va mot nua": da them guard + bo @SkipThrottle(), nhung OTP van dung ttl 60s cua forRoot.
@Controller('auth')
class AuthControllerWithoutSkip {
  @Post('send-otp')
  sendOtp(@Body() dto: SendOtpDto) {
    return { status: 'sent', phone: dto.phone };
  }
}
@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 3 }])],
  controllers: [AuthControllerWithoutSkip],
  providers: [GLOBAL_GUARD],
})
class PartiallyFixedModule {}

describe('Nhom BUG - tai hien loi tren ban goc', () => {
  let app: INestApplication;
  let clock: ReturnType<typeof useFakeClock>;

  beforeEach(() => {
    clock = useFakeClock();
  });
  afterEach(async () => {
    await app?.close();
    clock.restore();
  });

  describe('Loi 1 - ThrottlerGuard chua duoc kich hoat', () => {
    it('TC-BUG-01: dat don flash sale 10 lan trong 60s -> ca 10 lan deu 201', async () => {
      app = await createApp({ imports: [BuggyAppModule] });

      expect(await statuses(10, () => placeFlashSaleOrder(app))).toEqual(Array(10).fill(201));
    });

    it('TC-BUG-02: tai hien su co - 180 don trong 1 phut deu thanh cong', async () => {
      app = await createApp({ imports: [BuggyAppModule] });

      const result = await statuses(180, () => placeFlashSaleOrder(app, 'bot'));

      expect(count(result, 201)).toBe(180);
      expect(count(result, 429)).toBe(0);
    });

    it('TC-BUG-03: phan hoi khong co header X-RateLimit-* -> guard khong he chay', async () => {
      app = await createApp({ imports: [BuggyAppModule] });

      const res = await placeFlashSaleOrder(app);

      expect(res.status).toBe(201);
      expect(res.headers['x-ratelimit-limit']).toBeUndefined();
      expect(res.headers['x-ratelimit-remaining']).toBeUndefined();
    });
  });

  describe('Loi 2 - @SkipThrottle() tren send-otp', () => {
    it('TC-BUG-04: ban goc - gui OTP 10 lan cung mot so -> ca 10 lan deu 201', async () => {
      app = await createApp({ imports: [BuggyAppModule] });

      expect(await statuses(10, () => sendOtp(app))).toEqual(Array(10).fill(201));
    });

    it('TC-BUG-05: da bat guard toan cuc nhung con @SkipThrottle -> flash sale bi chan, OTP van 201 x10', async () => {
      app = await createApp({ imports: [BuggyAppModule], providers: [GLOBAL_GUARD] });

      const flashSale = await statuses(4, () => placeFlashSaleOrder(app));
      const otp = await statuses(10, () => sendOtp(app));

      expect(flashSale).toEqual([201, 201, 201, 429]); // doi chung: guard da hoat dong...
      expect(otp).toEqual(Array(10).fill(201)); // ...nhung bi tat rieng o send-otp
    });
  });

  describe('Loi 3 - OTP dung chung ttl 60s cua forRoot', () => {
    it('TC-BUG-06: gui 3 lan, doi 61s, lan 4 -> 201 (dung ra phai 429)', async () => {
      app = await createApp({ imports: [PartiallyFixedModule] });

      expect(await statuses(4, () => sendOtp(app))).toEqual([201, 201, 201, 429]);
      clock.advance(60_001);

      expect((await sendOtp(app)).status).toBe(201);
    });

    it('TC-BUG-07: trong 5 phut gui duoc 15 SMS cho cung mot so (dung ra toi da 3)', async () => {
      app = await createApp({ imports: [PartiallyFixedModule] });

      let smsSent = 0;
      for (let window = 1; window <= 5; window++) {
        smsSent += count(await statuses(3, () => sendOtp(app)), 201);
        clock.advance(MINUTE + 1);
      }

      expect(smsSent).toBe(15);
    });
  });

  describe('Loi 4 - dem theo IP thay vi tai khoan', () => {
    it('TC-BUG-08: tai khoan A dat 3 don, tai khoan B (cung IP) dat don dau tien -> B bi 429 oan', async () => {
      app = await createApp({ imports: [BuggyAppModule], providers: [GLOBAL_GUARD] });

      await statuses(3, () => placeFlashSaleOrder(app, 'user-A'));

      expect((await placeFlashSaleOrder(app, 'user-B')).status).toBe(429);
    });

    it('TC-BUG-09: mot tai khoan xoay vong 10 IP -> dat duoc 10 don trong 60s', async () => {
      app = await createApp({ imports: [BuggyAppModule], providers: [GLOBAL_GUARD] }, trustProxy);

      const result = await statuses(10, (i) => placeFlashSaleOrder(app, 'bot', fakeIp(i)));

      expect(result).toEqual(Array(10).fill(201));
    });
  });
});
