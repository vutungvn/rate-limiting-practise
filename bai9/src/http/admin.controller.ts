import {
  BadRequestException,
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  HttpCode,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { BlockFilter, BlockLog, Verdict } from '../observability/block-log';
import { ShieldMetrics } from '../observability/shield-metrics';
import { PolicyStore, PolicyValidationError } from '../policy/policy.store';
import { FlashSaleService } from '../shop/flash-sale.service';
import { COUNTER_STORE, CounterStore } from '../storage/counter-store';

@Injectable()
class AdminTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const token = context.switchToHttp().getRequest<Request>().header('x-admin-token');
    if (token !== (process.env.ADMIN_TOKEN ?? 'admin-secret')) {
      throw new UnauthorizedException({ code: 'ADMIN_TOKEN_INVALID', message: 'Sai x-admin-token.' });
    }
    return true;
  }
}

const SERVER_STARTED_AT = new Date().toISOString();
const VERDICTS: Verdict[] = ['false-positive', 'confirmed-abuse'];

/** Cong cu cho doi van hanh: doi nguong luc chay, truy vet lan chan, danh dau chan nham, bao cao. */
@Controller('admin')
@UseGuards(AdminTokenGuard)
export class AdminController {
  constructor(
    private readonly policies: PolicyStore,
    private readonly blockLog: BlockLog,
    private readonly metrics: ShieldMetrics,
    private readonly shop: FlashSaleService,
    @Inject(COUNTER_STORE) private readonly store: CounterStore,
  ) {}

  @Get('policy')
  getPolicy() {
    // serverStartedAt + pid giu nguyen sau khi doi nguong -> chung minh khong khoi dong lai.
    return { ...this.policies.current(), serverStartedAt: SERVER_STARTED_AT, pid: process.pid };
  }

  @Get('policy/history')
  history() {
    return this.policies.history();
  }

  /** Body: { "patch": { ...mot phan chinh sach... }, "reason": "..." }. Co hieu luc tu request ke tiep. */
  @Patch('policy')
  updatePolicy(@Body() body: { patch?: unknown; reason?: string }, @Query('by') by?: string) {
    if (body?.patch === undefined) throw new BadRequestException({ code: 'PATCH_REQUIRED', message: 'Thiếu "patch".' });
    try {
      const updated = this.policies.update(body.patch, by ?? 'admin', String(body.reason ?? ''));
      return { ...updated, serverStartedAt: SERVER_STARTED_AT, pid: process.pid };
    } catch (e) {
      if (e instanceof PolicyValidationError) {
        throw new BadRequestException({ code: 'POLICY_INVALID', message: 'Ngưỡng không hợp lệ, chính sách đang chạy giữ nguyên.', errors: e.errors });
      }
      throw e;
    }
  }

  @Get('blocks')
  blocks(@Query() filter: BlockFilter) {
    return this.blockLog.query(filter);
  }

  @Get('blocks/:blockId')
  block(@Param('blockId') blockId: string) {
    const record = this.blockLog.get(blockId);
    if (!record) throw new NotFoundException({ code: 'BLOCK_NOT_FOUND', message: `Không tìm thấy ${blockId}.` });
    return { ...record, policyAtBlock: this.policies.history().find((v) => v.version === record.policyVersion)?.policy[record.layer] };
  }

  @Post('blocks/:blockId/verdict')
  @HttpCode(200)
  verdict(@Param('blockId') blockId: string, @Body() body: { verdict?: Verdict; note?: string }, @Query('by') by?: string) {
    if (!VERDICTS.includes(body?.verdict as Verdict)) {
      throw new BadRequestException({ code: 'VERDICT_INVALID', message: `verdict phải là: ${VERDICTS.join(' | ')}` });
    }
    const record = this.blockLog.review(blockId, body.verdict!, by ?? 'admin', String(body.note ?? ''));
    if (!record) throw new NotFoundException({ code: 'BLOCK_NOT_FOUND', message: `Không tìm thấy ${blockId}.` });
    return record;
  }

  @Get('report')
  report() {
    return this.metrics.report();
  }

  @Post('reset')
  @HttpCode(200)
  async reset() {
    this.policies.reset();
    this.blockLog.clear();
    this.metrics.clear();
    this.shop.reset();
    await this.store.clear();
    return { message: 'Đã khôi phục chính sách mặc định, tồn kho, và xoá bộ đếm / log chặn.' };
  }
}
