import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth/auth.controller';
import { OrderController } from './order/order.controller';
import { MockAuthMiddleware } from './common/mock-auth.middleware';
import { GENERAL_LIMIT } from './common/throttle-policies';

@Module({
  imports: [
    // forRoot chi khai bao cau hinh; tu no KHONG chan request nao.
    ThrottlerModule.forRoot([{ name: 'default', ...GENERAL_LIMIT }]),
  ],
  controllers: [OrderController, AuthController],
  providers: [
    // Kich hoat ThrottlerGuard cho TOAN BO ung dung - thieu dong nay thi hang rao vo tac dung.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(MockAuthMiddleware).forRoutes(OrderController);
  }
}
