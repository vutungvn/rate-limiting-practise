import {
  BadRequestException,
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  HttpCode,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { SellerStore } from '../identity/seller.store';
import { PLANS, isPlan } from '../quota/plans';
import { QuotaService } from '../quota/quota.service';

@Injectable()
class AdminTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const token = context.switchToHttp().getRequest<Request>().header('x-admin-token');
    if (token !== (process.env.ADMIN_TOKEN ?? 'admin-secret')) throw new UnauthorizedException('Sai x-admin-token');
    return true;
  }
}

/** API noi bo (phong kinh doanh / van hanh): doi goi, thu hoi khoa, reset du lieu demo. */
@Controller('admin')
@UseGuards(AdminTokenGuard)
export class AdminController {
  constructor(
    private readonly store: SellerStore,
    private readonly quota: QuotaService,
  ) {}

  @Get('sellers')
  listSellers() {
    return this.store.listSellers();
  }

  @Patch('sellers/:id/plan')
  changePlan(@Param('id') id: string, @Body() body: { plan?: string }) {
    if (!isPlan(body?.plan)) throw new BadRequestException(`plan phai la mot trong: ${PLANS.join(', ')}`);
    const seller = this.store.changePlan(id, body.plan);
    if (!seller) throw new NotFoundException(`Khong tim thay nha ban hang ${id}`);
    return { ...seller, message: `Đã chuyển sang gói ${body.plan}, có hiệu lực ngay từ request kế tiếp.` };
  }

  @Post('api-keys/:key/revoke')
  @HttpCode(200)
  revokeKey(@Param('key') key: string) {
    const apiKey = this.store.revokeKey(key);
    if (!apiKey) throw new NotFoundException(`Khong tim thay API key ${key}`);
    return apiKey;
  }

  @Post('reset')
  @HttpCode(200)
  reset() {
    this.store.reset();
    this.quota.clear();
    return { message: 'Đã khôi phục dữ liệu mẫu và xoá toàn bộ bộ đếm.' };
  }
}
