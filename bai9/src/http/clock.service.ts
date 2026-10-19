import { Injectable } from '@nestjs/common';

/** Nguon thoi gian duy nhat cua la chan - test thay bang dong ho gia. */
@Injectable()
export class ClockService {
  now(): number {
    return Date.now();
  }
}
