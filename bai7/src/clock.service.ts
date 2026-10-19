import { BadRequestException, Injectable } from '@nestjs/common';
import { Request } from 'express';

/**
 * Nguon thoi gian. Mac dinh la dong ho that. Khi ALLOW_FAKE_CLOCK=true, header `x-fake-now: <so giay>`
 * cho phep gia lap thoi diem request de demo han muc phut / gio / ngay bang Postman ma khong phai cho.
 * TUYET DOI KHONG bat tren production: client se tu chon thoi gian de lach han muc.
 */
@Injectable()
export class ClockService {
  readonly fakeClockEnabled = process.env.ALLOW_FAKE_CLOCK === 'true';

  now(req: Request): number {
    const fake = req.header('x-fake-now');
    if (!this.fakeClockEnabled || !fake?.trim()) return Date.now();

    const seconds = Number(fake);
    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new BadRequestException('x-fake-now phai la so giay >= 0');
    }
    return Math.round(seconds * 1000);
  }
}
