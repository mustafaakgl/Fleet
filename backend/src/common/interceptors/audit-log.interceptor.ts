import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';

type AuthenticatedRequest = Request & {
  user?: {
    id?: string;
    tenantId?: string;
  };
};

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'newPassword',
  'currentPassword',
  'confirmPassword',
  'token',
  'refreshToken',
  'accessToken',
  'authorization',
  'secret',
  'mfaCode',
  'otp',
]);

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    return next.handle().pipe(
      tap({
        next: () => {
          void this.writeAuditLog(request);
        },
      }),
    );
  }

  private async writeAuditLog(request: AuthenticatedRequest): Promise<void> {
    try {
      const method = request.method ?? 'UNKNOWN';
      const routePath = request.route?.path ?? request.path ?? request.originalUrl ?? 'unknown';
      const action = `${method} ${routePath}`;
      const entityType = this.resolveEntityType(routePath);
      const entityId = this.resolveEntityId(request.params);
      const redactedBody = this.redactSensitive(request.body ?? {});
      const timestamp = new Date().toISOString();

      await this.prisma.auditLog.create({
        data: {
          tenantId: request.user?.tenantId ?? null,
          actorUserId: request.user?.id ?? null,
          action,
          entityType,
          entityId,
          summary: 'HTTP operation completed',
          metadata: {
            timestamp,
            method,
            route: routePath,
            ipAddress: this.resolveIpAddress(request),
            body: redactedBody,
          } as Prisma.InputJsonValue,
          ipAddress: this.resolveIpAddress(request),
          userAgent: request.get?.('user-agent') ?? null,
        },
      });
    } catch {
      // Audit logging must not break request flow.
    }
  }

  private resolveEntityType(routePath: string): string {
    const cleaned = routePath.split('?')[0] ?? routePath;
    const segments = cleaned.split('/').filter(Boolean);
    return segments[0] ?? 'system';
  }

  private resolveEntityId(params: Request['params'] | undefined): string | null {
    if (!params) {
      return null;
    }

    const idCandidateKeys = ['id', 'vehicleId', 'driverId', 'assignmentId', 'tripId', 'maintenanceId'];
    for (const key of idCandidateKeys) {
      const value = params[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
    }

    const first = Object.values(params).find(
      (value) => typeof value === 'string' && value.trim().length > 0,
    );
    return typeof first === 'string' ? first : null;
  }

  private resolveIpAddress(request: AuthenticatedRequest): string | null {
    const xForwardedFor = request.headers['x-forwarded-for'];
    if (typeof xForwardedFor === 'string' && xForwardedFor.length > 0) {
      return xForwardedFor.split(',')[0]?.trim() ?? null;
    }
    if (Array.isArray(xForwardedFor) && xForwardedFor.length > 0) {
      return xForwardedFor[0] ?? null;
    }
    return request.ip ?? null;
  }

  private redactSensitive(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.redactSensitive(item));
    }

    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const redacted: Record<string, unknown> = {};

      for (const [key, raw] of Object.entries(obj)) {
        if (SENSITIVE_KEYS.has(key)) {
          redacted[key] = '[REDACTED]';
          continue;
        }
        redacted[key] = this.redactSensitive(raw);
      }

      return redacted;
    }

    return value;
  }
}
