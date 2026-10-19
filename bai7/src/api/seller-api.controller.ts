import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { QuotaGuard, QuotaRequest, UseEndpointQuota } from '../quota/quota.guard';

/** Kem thong bao khi request bi ha xuong han muc thap nhat (thieu khoa / khoa sai / khoa bi thu hoi). */
const noticeOf = (req: QuotaRequest) => {
  const notice = req.quota?.identity.notice;
  return notice ? { notice } : {};
};

@Controller('api/v1')
@UseGuards(QuotaGuard)
export class SellerApiController {
  @Get('products')
  listProducts(@Req() req: QuotaRequest) {
    return {
      sellerId: req.quota?.identity.sellerId ?? null,
      data: [{ id: 'iphone-17', name: 'iPhone 17', price: 29_990_000 }],
      ...noticeOf(req),
    };
  }

  @UseEndpointQuota('report-export')
  @Post('reports/export')
  exportReport(@Req() req: QuotaRequest) {
    return {
      sellerId: req.quota?.identity.sellerId ?? null,
      reportId: `rpt_${Date.now()}`,
      status: 'queued',
      ...noticeOf(req),
    };
  }
}
