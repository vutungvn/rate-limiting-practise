/**
 * NHOM OTP - POST /auth/send-otp tren ban da sua: 3 lan / 5 phut / so dien thoai.
 * Dac ta chi tiet: TESTCASES.md, muc "Nhom OTP".
 */
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import {
  MINUTE,
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

describe('Nhom OTP - POST /auth/send-otp (3 lan / 5 phut / so dien thoai)', () => {
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
    it('TC-OTP-01: 3 lan gui OTP dau tien deu 201', async () => {
      const responses = [];
      for (let i = 0; i < 3; i++) responses.push(await sendOtp(app));

      expect(responses.map((r) => r.status)).toEqual([201, 201, 201]);
      expect(responses[0].body).toEqual({ status: 'sent', phone: '0912345678' });
    });

    it('TC-OTP-02: lan gui OTP thu 4 trong 5 phut bi tra ve 429', async () => {
      await statuses(3, () => sendOtp(app));

      const res = await sendOtp(app);

      expect(res.status).toBe(429);
      expect(res.body).toEqual({ statusCode: 429, message: 'ThrottlerException: Too Many Requests' });
    });

    it('TC-OTP-03: header X-RateLimit-Limit = 3, phan hoi 429 co Retry-After = 300 giay', async () => {
      const first = await sendOtp(app);
      await statuses(2, () => sendOtp(app));
      const blocked = await sendOtp(app);

      expect(first.headers['x-ratelimit-limit']).toBe('3');
      expect(first.headers['x-ratelimit-remaining']).toBe('2');
      expect(blocked.headers['retry-after']).toBe('300');
    });
  });

  describe('Cua so thoi gian 5 phut', () => {
    it('TC-OTP-04: qua 61 giay van bi 429 (khong con dung ttl 60s nhu ban goc)', async () => {
      await statuses(3, () => sendOtp(app));
      clock.advance(61 * SECOND);

      expect((await sendOtp(app)).status).toBe(429);
    });

    it('TC-OTP-05: bien duoi - o giay thu 299 van bi 429', async () => {
      await statuses(3, () => sendOtp(app));
      clock.advance(299 * SECOND);

      expect((await sendOtp(app)).status).toBe(429);
    });

    it('TC-OTP-06: bien tren - 3 lan luc 0s, khong gui them, qua 300s thi gui lai duoc', async () => {
      await statuses(3, () => sendOtp(app));
      clock.advance(5 * MINUTE + 1);

      expect((await sendOtp(app)).status).toBe(201);
    });

    it('TC-OTP-07: bi chan o giay 61 -> khoa tron 5 phut tinh tu luc bi chan (den giay 361)', async () => {
      await statuses(3, () => sendOtp(app));
      clock.advance(61 * SECOND);
      expect((await sendOtp(app)).status).toBe(429); // t = 61s, bat dau khoa

      clock.advance(240 * SECOND); // t = 301s: da qua 5 phut tu lan dau nhung chua het khoa
      expect((await sendOtp(app)).status).toBe(429);

      clock.advance(60 * SECOND + 1); // t = 361s
      expect((await sendOtp(app)).status).toBe(201);
    });

    it('TC-OTP-08: thu gui moi 30 giay trong 5 phut (10 lan) -> chi 3 SMS duoc gui', async () => {
      const result: number[] = [];
      for (let i = 0; i < 10; i++) {
        result.push((await sendOtp(app)).status);
        clock.advance(30 * SECOND);
      }

      expect(count(result, 201)).toBe(3);
      expect(result.slice(0, 3)).toEqual([201, 201, 201]);
    });
  });

  describe('Doi tuong bi dem (tracker)', () => {
    it('TC-OTP-09: cung so nhung doi dinh dang (0912..., +84..., 84..., co dau cach/gach) van dung chung bo dem', async () => {
      const result = await statuses(5, (i) =>
        sendOtp(app, ['0912345678', '+84 912 345 678', '84912345678', '0912-345-678', '(091) 234.5678'][i]),
      );

      expect(result).toEqual([201, 201, 201, 429, 429]);
    });

    it('TC-OTP-10: so dien thoai khac co bo dem rieng', async () => {
      await statuses(4, () => sendOtp(app, '0912345678'));

      expect(await statuses(3, () => sendOtp(app, '0987654321'))).toEqual([201, 201, 201]);
    });

    it('TC-OTP-11: cung so, xoay vong 10 IP khac nhau van chi gui duoc 3 lan', async () => {
      await app.close();
      app = await createApp({ imports: [AppModule] }, trustProxy);

      const result = await statuses(10, (i) => sendOtp(app, '0912345678', fakeIp(i)));

      expect(result).toEqual([201, 201, 201, ...Array(7).fill(429)]);
    });
  });

  describe('Du lieu khong hop le', () => {
    it('TC-OTP-12: thieu truong phone -> 400 Bad Request', async () => {
      const res = await sendOtp(app, null);

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('phone is required');
    });

    it('TC-OTP-13: phone khong co chu so ("abc") -> 400, spam request loi van bi chan theo IP sau 3 lan', async () => {
      expect(await statuses(5, () => sendOtp(app, 'abc'))).toEqual([400, 400, 400, 429, 429]);
    });
  });

  describe('Dong thoi va doc lap', () => {
    it('TC-OTP-14: 20 request gui OTP cung luc -> dung 3 lan 201, 17 lan 429', async () => {
      const result = await concurrentStatuses(20, () => sendOtp(app));

      expect(count(result, 201)).toBe(3);
      expect(count(result, 429)).toBe(17);
    });

    it('TC-OTP-15: bi chan OTP khong anh huong dat don flash sale', async () => {
      await statuses(4, () => sendOtp(app));

      expect((await placeFlashSaleOrder(app)).status).toBe(201);
    });
  });
});
