import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { NextFunction, Response } from 'express';
import { DEFENSE_LAYERS } from './enforcement/defense-layer';
import { JourneyTokenService } from './enforcement/journey-token.service';
import { AccountFarmLayer } from './enforcement/layers/account-farm.layer';
import { JourneyLayer } from './enforcement/layers/journey.layer';
import { PurchaseQuotaLayer } from './enforcement/layers/purchase-quota.layer';
import { VelocityLayer } from './enforcement/layers/velocity.layer';
import { Shield } from './enforcement/shield';
import { AdminController } from './http/admin.controller';
import { AllExceptionsFilter } from './http/all-exceptions.filter';
import { ClockService } from './http/clock.service';
import { FlashSaleController } from './http/flash-sale.controller';
import { ShieldRequest, requestIdOf } from './http/request-context';
import { ShieldInterceptor } from './http/shield.interceptor';
import { BlockLog } from './observability/block-log';
import { ShieldMetrics } from './observability/shield-metrics';
import { PolicyStore } from './policy/policy.store';
import { FlashSaleService } from './shop/flash-sale.service';
import { COUNTER_STORE } from './storage/counter-store';
import { InMemoryCounterStore } from './storage/in-memory-counter-store';

@Module({
  controllers: [FlashSaleController, AdminController],
  providers: [
    // Chinh sach
    PolicyStore,
    // Luu tru bo dem (doi sang Redis: chi thay dong nay)
    { provide: COUNTER_STORE, useClass: InMemoryCounterStore },
    // Co che thuc thi - THU TU = thu tu kiem tra, tu re den dat
    VelocityLayer,
    AccountFarmLayer,
    JourneyLayer,
    PurchaseQuotaLayer,
    {
      provide: DEFENSE_LAYERS,
      useFactory: (...layers: unknown[]) => layers,
      inject: [VelocityLayer, AccountFarmLayer, JourneyLayer, PurchaseQuotaLayer],
    },
    JourneyTokenService,
    Shield,
    // Quan sat
    BlockLog,
    ShieldMetrics,
    // Nghiep vu + HTTP
    FlashSaleService,
    ClockService,
    ShieldInterceptor,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply((req: ShieldRequest, res: Response, next: NextFunction) => {
        res.setHeader('X-Request-Id', requestIdOf(req));
        next();
      })
      .forRoutes('*');
  }
}
