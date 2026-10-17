// BAN GOC (CO LOI) - giu nguyen cau hinh dang chay tren moi truong that cua ShopFast.
// Chi dung trong test/buggy.e2e-spec.ts de tai hien loi. KHONG dung cho production.
import { Body, Controller, Module, Post } from '@nestjs/common';
import { SkipThrottle, ThrottlerModule } from '@nestjs/throttler';
import { CreateOrderDto } from '../order/create-order.dto';
import { SendOtpDto } from '../auth/send-otp.dto';

@Controller('orders')
export class BuggyOrderController {
  @Post('flash-sale')
  createFlashSaleOrder(@Body() dto: CreateOrderDto) {
    return { status: 'created', ...dto };
  }
}

@Controller('auth')
export class BuggyAuthController {
  @SkipThrottle()
  @Post('send-otp')
  sendOtp(@Body() dto: SendOtpDto) {
    return { status: 'sent', phone: dto.phone };
  }
}

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 3 }]),
  ],
  // (khong dang ky ThrottlerGuard o pham vi toan ung dung)
  controllers: [BuggyOrderController, BuggyAuthController],
})
export class BuggyAppModule {}
