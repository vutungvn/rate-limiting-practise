import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post, Req, UseInterceptors } from '@nestjs/common';
import { JourneyTokenService } from '../enforcement/journey-token.service';
import { BlockLog } from '../observability/block-log';
import { FlashSaleService } from '../shop/flash-sale.service';
import { ShieldRequest } from './request-context';
import { ShieldInterceptor, Shielded, idempotencyKeyOf } from './shield.interceptor';

@Controller('api')
@UseInterceptors(ShieldInterceptor)
export class FlashSaleController {
  constructor(
    private readonly shop: FlashSaleService,
    private readonly tokens: JourneyTokenService,
    private readonly blockLog: BlockLog,
  ) {}

  /** Trang san pham: tra thong tin + ve hanh trinh (bat buoc khi dat hang). */
  @Get('flash-sales/:productId')
  @Shielded('browse')
  view(@Param('productId') productId: string, @Req() req: ShieldRequest) {
    const ctx = req.shield!;
    const product = this.shop.getProduct(productId);
    return {
      product,
      saleToken: this.tokens.issue(ctx.accountId, ctx.deviceId, productId, ctx.now),
    };
  }

  @Post('flash-sales/:productId/orders')
  @Shielded('order')
  order(@Param('productId') productId: string, @Req() req: ShieldRequest) {
    const ctx = req.shield!;
    const order = this.shop.placeOrder({
      accountId: ctx.accountId,
      productId,
      quantity: ctx.quantity!,
      // Khong co ve chi xay ra khi lop Hanh trinh dang shadow/off -> khong chong dat trung duoc, dung requestId.
      idempotencyKey: ctx.saleToken ? idempotencyKeyOf(ctx.saleToken) : `req:${ctx.requestId}`,
    });
    return { order, replayed: false };
  }

  /** Khach cho rang minh bi chan nham -> gui khieu nai. Moi khieu nai la mot tin hieu "co the chan nham". */
  @Post('appeals')
  appeal(@Body() body: { blockId?: string; message?: string }, @Req() req: ShieldRequest) {
    if (!body?.blockId) throw new BadRequestException({ code: 'BLOCK_ID_REQUIRED', message: 'Thiếu blockId.' });
    const record = this.blockLog.get(body.blockId);
    if (!record) throw new NotFoundException({ code: 'BLOCK_NOT_FOUND', message: `Không tìm thấy mã chặn ${body.blockId}.` });
    if (record.subject.accountId !== req.header('x-account-id')) {
      throw new ForbiddenException({ code: 'NOT_YOUR_BLOCK', message: 'Mã chặn này không thuộc tài khoản của bạn.' });
    }
    this.blockLog.appeal(body.blockId, String(body.message ?? '').slice(0, 1_000));
    return { blockId: body.blockId, status: 'received', message: 'Đã ghi nhận khiếu nại, đội vận hành sẽ xem xét.' };
  }
}
