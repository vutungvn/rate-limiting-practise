import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

export interface AuthUser {
  id: string;
}

export type AuthenticatedRequest = Request & { user?: AuthUser };

/**
 * Xac thuc gia lap cho bai tap: lay ma tai khoan tu header `x-user-id`.
 * Moi truong that thay bang buoc giai ma JWT / session, mien la gan `req.user`
 * TRUOC khi ThrottlerGuard chay (middleware luon chay truoc guard).
 */
@Injectable()
export class MockAuthMiddleware implements NestMiddleware {
  use(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
    const userId = req.header('x-user-id');
    if (userId) req.user = { id: userId };
    next();
  }
}
