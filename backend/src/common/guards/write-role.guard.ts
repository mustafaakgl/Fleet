import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { verify } from 'jsonwebtoken';
import { getJwtSecret } from '../../config/env.validation';
import { OPERATIONAL_WRITE_ROLES } from '../utils/permissions';
import { REQUIRES_WRITE_KEY } from '../decorators/requires-write.decorator';

@Injectable()
export class WriteRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiresWrite = this.reflector.getAllAndOverride<boolean>(REQUIRES_WRITE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiresWrite) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: { role?: string }; headers: Record<string, string | undefined> }>();

    // Global guards run before controller-level JwtAuthGuard, so request.user
    // may not be populated yet. Fall back to verifying the bearer token directly.
    let role = request.user?.role;
    if (!role) {
      const header = request.headers.authorization ?? '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : undefined;
      if (token) {
        try {
          const payload = verify(token, getJwtSecret()) as { role?: string };
          role = payload.role;
        } catch {
          role = undefined;
        }
      }
    }

    if (!role || !OPERATIONAL_WRITE_ROLES.includes(role as (typeof OPERATIONAL_WRITE_ROLES)[number])) {
      throw new ForbiddenException('Write permission required for this operation');
    }
    return true;
  }
}
