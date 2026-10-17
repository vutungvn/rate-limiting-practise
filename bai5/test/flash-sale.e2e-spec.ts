/**
 * NHOM FS - POST /orders/flash-sale tren ban da sua: 3 don / 60 giay / tai khoan.
 * Dac ta chi tiet: TESTCASES.md, muc "Nhom FS".
 */
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import {
  SECOND,
  concurrentStatuses,
  count,
  createApp,
  fakeIp,
  placeFlashSaleOrder,
  sendOtp,
  statuses,
  trustProxy,
  useFakeClock,
} from './helpers';

describe('Nhom FS - POST /orders/flash-sale (3 don / 60s / tai khoan)', () => {
  let app: INestApplication;
  let clock: ReturnType<typeof useFakeClock>;

  beforeEach(async () => {
    clock = useFakeClock();
    app = await createApp({ imports: [AppModule] });
  });
  afterEach(async () => {
    await app.close();
    clock.restore();
  });

  describe('Nguong co ban', () => {
    it('TC-FS-01: 3 lan dat don dau tien trong 60s deu 201', async () => {
      const responses = [];
      for (let i = 0; i < 3; i++) responses.push(await placeFlashSaleOrder(app, 'user-1'));

      expect(responses.map((r) => r.status)).toEqual([201, 201, 201]);
      expect(responses[0].body).toMatchObject({ status: 'created', userId: 'user-1', productId: 'iphone-17' });
    });

    it('TC-FS-02: lan dat don thu 4 trong 60s bi tra ve 429', async () => {
      await statuses(3, () => placeFlashSaleOrder(app));

      const res = await placeFlashSaleOrder(app);

      expect(res.status).toBe(429);
      expect(res.body).toEqual({ statusCode: 429, message: 'ThrottlerException: Too Many Requests' });
    });

    it('TC-FS-03: bot spam 180 lan trong 1 phut -> chi 3 don thanh cong, 177 lan 429', async () => {
      const result = await statuses(180, () => placeFlashSaleOrder(app, 'bot'));

      expect(count(result, 201)).toBe(3);
      expect(count(result, 429)).toBe(177);
      expect(result.slice(0, 3)).toEqual([201, 201, 201]);
    });
  });

  describe('Header phan hoi', () => {
    it('TC-FS-04: X-RateLimit-Limit = 3, X-RateLimit-Remaining giam dan 2 -> 1 -> 0', async () => {
      const remaining: string[] = [];
      for (let i = 0; i < 3; i++) {
        const res = await placeFlashSaleOrder(app);
        expect(res.headers['x-ratelimit-limit']).toBe('3');
        remaining.push(res.headers['x-ratelimit-remaining']);
      }

      expect(remaining).toEqual(['2', '1', '0']);
    });

    it('TC-FS-05: phan hoi 429 co header Retry-After trong khoang (0, 60] giay', async () => {
      await statuses(3, () => placeFlashSaleOrder(app));

      const res = await placeFlashSaleOrder(app);

      expect(res.status).toBe(429);
      const retryAfter = Number(res.headers['retry-after']);
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(60);
    });
  });

  describe('Cua so thoi gian', () => {
    it('TC-FS-06: bien duoi - o giay thu 59 van bi 429', async () => {
      await statuses(3, () => placeFlashSaleOrder(app));
      clock.advance(59 * SECOND);

      expect((await placeFlashSaleOrder(app)).status).toBe(429);
    });

    it('TC-FS-07: bien tren - qua 60s ke tu lan bi chan thi dat lai duoc', async () => {
      await statuses(4, () => placeFlashSaleOrder(app));
      clock.advance(60 * SECOND + 1);

      expect((await placeFlashSaleOrder(app)).status).toBe(201);
    });

    it('TC-FS-08: cua so truot - don o giay 0 het han thi giay 61 dat them duoc dung 1 don', async () => {
      expect((await placeFlashSaleOrder(app)).status).toBe(201); // t = 0s
      clock.advance(30 * SECOND);
      expect(await statuses(2, () => placeFlashSaleOrder(app))).toEqual([201, 201]); // t = 30s
      clock.advance(31 * SECOND); // t = 61s: don luc 0s da het han, 2 don luc 30s van con

      expect(await statuses(2, () => placeFlashSaleOrder(app))).toEqual([201, 429]);
    });
  });

  describe('Doi tuong bi dem (tracker)', () => {
    it('TC-FS-09: tai khoan A bi chan khong anh huong tai khoan B (cung IP)', async () => {
      await statuses(4, () => placeFlashSaleOrder(app, 'user-A'));

      expect(await statuses(3, () => placeFlashSaleOrder(app, 'user-B'))).toEqual([201, 201, 201]);
      expect((await placeFlashSaleOrder(app, 'user-A')).status).toBe(429);
    });

    it('TC-FS-10: mot tai khoan xoay vong 10 IP khac nhau van chi dat duoc 3 don', async () => {
      await app.close();
      app = await createApp({ imports: [AppModule] }, trustProxy);

      const result = await statuses(10, (i) => placeFlashSaleOrder(app, 'bot', fakeIp(i)));

      expect(result).toEqual([201, 201, 201, ...Array(7).fill(429)]);
    });
  });

  describe('Xac thuc', () => {
    it('TC-FS-11: khong co x-user-id -> 401 Unauthorized', async () => {
      const res = await placeFlashSaleOrder(app, null);

      expect(res.status).toBe(401);
    });

    it('TC-FS-12: spam an danh (khong dang nhap) van bi chan theo IP sau 3 lan', async () => {
      expect(await statuses(5, () => placeFlashSaleOrder(app, null))).toEqual([401, 401, 401, 429, 429]);
    });
  });

  describe('Dong thoi va doc lap', () => {
    it('TC-FS-13: 20 request ban cung luc -> dung 3 lan 201, 17 lan 429 (khong co race condition)', async () => {
      const result = await concurrentStatuses(20, () => placeFlashSaleOrder(app, 'bot'));

      expect(count(result, 201)).toBe(3);
      expect(count(result, 429)).toBe(17);
    });

    it('TC-FS-14: bi chan flash sale khong anh huong gui OTP', async () => {
      await statuses(4, () => placeFlashSaleOrder(app));

      expect((await sendOtp(app)).status).toBe(201);
    });
  });
});
