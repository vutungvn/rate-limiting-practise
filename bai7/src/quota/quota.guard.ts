import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { ClockService } from '../clock.service';
import { Identity, IdentityService } from '../identity/identity.service';
import { EndpointQuota, PLAN_LIMITS } from './plans';
import { QuotaDecision, QuotaService } from './quota.service';

const ENDPOINT_QUOTA = 'endpoint-quota';

/** Danh dau endpoint ton tai nguyen, ap them han muc rieng trong ENDPOINT_LIMITS. */
export const UseEndpointQuota = (name: EndpointQuota) => SetMetadata(ENDPOINT_QUOTA, name);

export type QuotaRequest = Request & { quota?: { identity: Identity; decision: QuotaDecision } };

@Injectable()
export class QuotaGuard implements CanActivate {
  constructor(
    private readonly identity: IdentityService,
    private readonly quota: QuotaService,
    private readonly clock: ClockService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const req = http.getRequest<QuotaRequest>();
    const res = http.getResponse<Response>();

    // B1-B2: xac dinh danh tinh + goi hien tai (doc moi request).
    const identity = this.identity.resolve(req);
    // B3: endpoint co han muc rieng khong?
    const endpoint = this.reflector.getAllAndOverride<EndpointQuota | undefined>(ENDPOINT_QUOTA, [
      context.getHandler(),
      context.getClass(),
    ]);
    // B4-B5: kiem tra moi tang, tat ca hoac khong.
    const decision = this.quota.consume(identity.subject, identity.plan, endpoint, this.clock.now(req));

    // B6: luon tra header han muc - ca khi cho qua lan khi chan.
    this.setHeaders(res, identity, decision);
    req.quota = { identity, decision };

    if (!decision.allowed) throw new HttpException(this.tooManyRequestsBody(identity, decision), HttpStatus.TOO_MANY_REQUESTS);
    return true;
  }

  private setHeaders(res: Response, identity: Identity, decision: QuotaDecision) {
    res.setHeader('X-RateLimit-Plan', decision.plan);
    res.setHeader('X-ApiKey-Status', identity.apiKeyStatus);
    for (const t of decision.tiers) {
      res.setHeader(`X-RateLimit-Limit-${t.name}`, t.limit);
      res.setHeader(`X-RateLimit-Remaining-${t.name}`, t.remaining);
      res.setHeader(`X-RateLimit-Reset-${t.name}`, t.resetSeconds);
    }
    // Tom tat cho client don gian: tang dang "chat" nhat (con it luot nhat).
    const tightest = decision.tiers.reduce((a, b) => (b.remaining < a.remaining ? b : a));
    res.setHeader('X-RateLimit-Limit', tightest.limit);
    res.setHeader('X-RateLimit-Remaining', tightest.remaining);
    res.setHeader('X-RateLimit-Reset', tightest.resetSeconds);

    const blocked = decision.tiers.filter((t) => t.blocked);
    if (blocked.length) res.setHeader('Retry-After', Math.max(...blocked.map((t) => t.retryAfterSeconds)));
  }

  private tooManyRequestsBody(identity: Identity, decision: QuotaDecision) {
    const blocked = decision.tiers.filter((t) => t.blocked);
    const retryAfter = Math.max(...blocked.map((t) => t.retryAfterSeconds));
    return {
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Đã vượt hạn mức ${blocked.map((t) => t.label).join('; ')}. Thử lại sau ${retryAfter} giây.`,
      plan: decision.plan,
      planName: PLAN_LIMITS[decision.plan].displayName,
      apiKeyStatus: identity.apiKeyStatus,
      blockedBy: blocked.map((t) => ({ tier: t.name, limit: t.limit, retryAfterSeconds: t.retryAfterSeconds })),
      ...(identity.notice && { notice: identity.notice }),
    };
  }
}
