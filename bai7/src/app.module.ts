import { Module } from '@nestjs/common';
import { AdminController } from './api/admin.controller';
import { SellerApiController } from './api/seller-api.controller';
import { ClockService } from './clock.service';
import { IdentityService } from './identity/identity.service';
import { SellerStore } from './identity/seller.store';
import { QuotaGuard } from './quota/quota.guard';
import { QuotaService } from './quota/quota.service';

@Module({
  controllers: [SellerApiController, AdminController],
  providers: [ClockService, SellerStore, IdentityService, QuotaService, QuotaGuard],
})
export class AppModule {}
