import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuditService } from '../../audit/audit.service';

@Catch(ThrottlerException)
export class ThrottlerAuditFilter implements ExceptionFilter {
  constructor(private readonly auditService: AuditService) {}

  catch(exception: ThrottlerException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    if (request.path?.includes('/auth/login') || request.url?.includes('/auth/login')) {
      void this.auditService
        .logAction({
          action: 'auth.login_rate_limited',
          entityType: 'auth',
          summary: 'Login rate limited',
          ipAddress: request.ip,
          userAgent: request.get('user-agent') ?? undefined,
        })
        .catch((error) => {
          console.warn('Rate-limit audit log failed:', error);
        });
    }

    const retryAfter = Math.ceil(60);
    response.setHeader('Retry-After', String(retryAfter));
    response.status(HttpStatus.TOO_MANY_REQUESTS).json({
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      error: 'Too Many Requests',
      message: exception.message,
    });
  }
}
