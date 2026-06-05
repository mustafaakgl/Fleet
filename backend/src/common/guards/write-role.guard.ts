import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
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

    const request = context.switchToHttp().getRequest<{ user?: { role?: string } }>();
    const role = request.user?.role as (typeof OPERATIONAL_WRITE_ROLES)[number] | undefined;
    if (!role || !OPERATIONAL_WRITE_ROLES.includes(role)) {
      throw new ForbiddenException('Write permission required for this operation');
    }
    return true;
  }
}
