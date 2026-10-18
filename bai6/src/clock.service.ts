import { BadRequestException, Injectable } from '@nestjs/common';
import { Request } from 'express';

/**
 * Nguon thoi gian cho bo gioi han.
 *
 * Mac dinh dung dong ho that (Date.now()). Khi chay voi ALLOW_FAKE_CLOCK=true, client co the
 * gui header `x-fake-now: <so giay>` (vd. 59, 61, 600) de gia lap thoi diem request - chi de
 * demo/kiem thu kich ban bien bang Postman. TUYET DOI KHONG bat tren production: client se tu
 * chon duoc thoi gian va lach han muc.
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
