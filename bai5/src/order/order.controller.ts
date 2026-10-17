import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CreateOrderDto } from './create-order.dto';
import { AuthenticatedRequest } from '../common/mock-auth.middleware';
import { RequireUserGuard } from '../common/require-user.guard';
import { FLASH_SALE_LIMIT } from '../common/throttle-policies';
import { trackByAccount } from '../common/trackers';

@Controller('orders')
@UseGuards(RequireUserGuard)
export class OrderController {
  @Throttle({ default: { ...FLASH_SALE_LIMIT, getTracker: trackByAccount } })
  @Post('flash-sale')
  createFlashSaleOrder(@Body() dto: CreateOrderDto, @Req() req: AuthenticatedRequest) {
    return { status: 'created', userId: req.user!.id, ...dto };
  }
}
