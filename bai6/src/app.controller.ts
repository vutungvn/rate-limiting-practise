import { Controller, Get, Headers, UseGuards } from '@nestjs/common';
import { RateLimitGuard } from './rate-limit.guard';

@Controller('api')
@UseGuards(RateLimitGuard)
export class AppController {
  @Get('products')
  listProducts(@Headers('x-user-id') userId: string) {
    return { userId, products: [{ id: 'iphone-17', price: 29_990_000 }] };
  }
}
