import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ClockService } from './clock.service';
import { FixedWindowLimiter } from './limiter/fixed-window.limiter';
import { RATE_LIMITER } from './limiter/rate-limiter';
import { SlidingWindowLimiter } from './limiter/sliding-window.limiter';
import { RateLimitGuard } from './rate-limit.guard';

@Module({
  controllers: [AppController],
  providers: [
    ClockService,
    RateLimitGuard,
    {
      // LIMITER=fixed: chay thuat toan cu (cua so co dinh) de tai hien loi. Mac dinh: cua so truot.
      provide: RATE_LIMITER,
      useFactory: () => (process.env.LIMITER === 'fixed' ? new FixedWindowLimiter() : new SlidingWindowLimiter()),
    },
  ],
})
export class AppModule {}
