import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import { ShieldRequest, requestIdOf } from './request-context';

/**
 * Moi ngoai le deu thanh mot phan hoi JSON co requestId - khong bao gio de lo stack trace hay lam sap tien trinh.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<ShieldRequest>();
    const res = http.getResponse<Response>();
    const requestId = requestIdOf(req);

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      const payload = typeof body === 'string' ? { statusCode: exception.getStatus(), message: body } : body;
      res.status(exception.getStatus()).json({ requestId, ...(payload as object) });
      return;
    }

    this.logger.error(`Loi khong luong truoc req=${requestId} ${req.method} ${req.originalUrl}: ${(exception as Error)?.stack ?? exception}`);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Hệ thống gặp sự cố, vui lòng thử lại. Mã tra cứu: ' + requestId,
      requestId,
    });
  }
}
