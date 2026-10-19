import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'crypto';
import { Response } from 'express';
import { Observable, catchError, finalize, from, of, switchMap, tap, throwError } from 'rxjs';
import { ShieldAction, ShieldContext } from '../enforcement/defense-layer';
import { Shield } from '../enforcement/shield';
import { FlashSaleService, Order } from '../shop/flash-sale.service';
import { ClockService } from './clock.service';
import { ShieldRequest, buildShieldContext } from './request-context';

const SHIELD_ACTION = 'shield-action';
/** Gan endpoint vao la chan: 'browse' (xem san pham) hoac 'order' (dat hang). */
export const Shielded = (action: ShieldAction) => SetMetadata(SHIELD_ACTION, action);

export const idempotencyKeyOf = (saleToken: string) => createHash('sha256').update(saleToken).digest('hex');

interface Deferred {
  promise: Promise<Order | undefined>;
  resolve: (order: Order | undefined) => void;
}

const deferred = (): Deferred => {
  let resolve!: (order: Order | undefined) => void;
  const promise = new Promise<Order | undefined>((r) => (resolve = r));
  return { promise, resolve };
};

/**
 * Cau noi HTTP <-> la chan. Tang nay chi dich request/response; quyet dinh nam o Shield, nguong o PolicyStore.
 *  1. Khach bam "Dat hang" 2 lan (cung ve hanh trinh): tra lai don cu - ke ca khi lan 1 con dang xu ly -
 *     KHONG cho lan 2 qua la chan, de han muc mua khong chan oan khach that.
 *  2. Shield.inspect -> bi chan thi tra loi kem blockId de khach khieu nai / doi van hanh truy vet.
 *  3. Endpoint that bai (vd. het hang) -> hoan lai han muc da giu.
 */
@Injectable()
export class ShieldInterceptor implements NestInterceptor {
  private readonly inflight = new Map<string, Deferred>();

  constructor(
    private readonly reflector: Reflector,
    private readonly shield: Shield,
    private readonly shop: FlashSaleService,
    private readonly clock: ClockService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const action = this.reflector.get<ShieldAction | undefined>(SHIELD_ACTION, context.getHandler());
    if (!action) return next.handle();

    const req = context.switchToHttp().getRequest<ShieldRequest>();
    const res = context.switchToHttp().getResponse<Response>();
    const ctx = buildShieldContext(req, action, this.clock.now());
    req.shield = ctx;

    if (action !== 'order' || !ctx.saleToken) return this.protect(ctx, next, res);

    const key = idempotencyKeyOf(ctx.saleToken);
    const done = this.shop.findByIdempotencyKey(key);
    if (done) return this.replay(done, ctx, next, res);

    const pending = this.inflight.get(key);
    if (pending) return from(pending.promise).pipe(switchMap((order) => this.replay(order, ctx, next, res)));

    const mine = deferred();
    this.inflight.set(key, mine);
    return this.protect(ctx, next, res).pipe(
      tap({ next: (body) => mine.resolve((body as { order?: Order })?.order), error: () => mine.resolve(undefined) }),
      finalize(() => {
        mine.resolve(undefined);
        this.inflight.delete(key);
      }),
    );
  }

  /** Tra lai don da co neu cung tai khoan; neu lan truoc that bai thi xu ly lai tu dau. */
  private replay(order: Order | undefined, ctx: ShieldContext, next: CallHandler, res: Response): Observable<unknown> {
    if (!order || order.accountId !== ctx.accountId) return this.protect(ctx, next, res);
    res.status(200);
    return of({ order, replayed: true, message: 'Đơn hàng này đã được tạo trước đó.' });
  }

  private protect(ctx: ShieldContext, next: CallHandler, res: Response): Observable<unknown> {
    return from(this.shield.inspect(ctx)).pipe(
      switchMap((decision) => {
        if (!decision.allowed) {
          const { block } = decision;
          if (decision.retryAfterSec) res.setHeader('Retry-After', decision.retryAfterSec);
          res.setHeader('X-Shield-Block-Id', block.blockId);
          return throwError(
            () =>
              new HttpException(
                {
                  statusCode: block.status,
                  code: block.code,
                  message: block.message,
                  blockId: block.blockId,
                  requestId: block.requestId,
                  ...(decision.retryAfterSec && { retryAfterSeconds: decision.retryAfterSec }),
                  appeal: { method: 'POST', path: '/api/appeals', body: { blockId: block.blockId, message: '...' } },
                },
                block.status,
              ),
          );
        }
        res.setHeader('X-Shield-Policy-Version', decision.policyVersion);
        return next.handle().pipe(catchError((err) => from(decision.release()).pipe(switchMap(() => throwError(() => err)))));
      }),
    );
  }
}
