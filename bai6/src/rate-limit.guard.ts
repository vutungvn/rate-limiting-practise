import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ClockService } from './clock.service';
import { RATE_LIMITER, RateLimiter } from './limiter/rate-limiter';

/** Gioi han theo tai khoan: toi da 100 request trong bat ky 60 giay lien tiep nao. */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
    private readonly clock: ClockService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const userId = req.header('x-user-id');
    if (!userId) throw new UnauthorizedException('Missing x-user-id header');

    res.setHeader('X-RateLimit-Algorithm', this.limiter.constructor.name);
    if (!this.limiter.isAllowed(`user:${userId}`, this.clock.now(req))) {
      throw new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
