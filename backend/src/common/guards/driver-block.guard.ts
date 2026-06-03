import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

const BLOCKED_WEB_ROLES = new Set(['driver', 'customer']);

@Injectable()
export class DriverBlockGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: { role?: string } }>();
    const role = request.user?.role;
    if (role && BLOCKED_WEB_ROLES.has(role)) {
      throw new ForbiddenException(`${role} role is not allowed for this endpoint`);
    }
    return true;
  }
}