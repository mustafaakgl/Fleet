import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { UserRole } from '../utils/permissions';

@Injectable()
export class RolesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const classRoles = Reflect.getMetadata(ROLES_KEY, context.getClass()) as UserRole[] | undefined;
    const methodRoles = Reflect.getMetadata(ROLES_KEY, context.getHandler()) as UserRole[] | undefined;
    const requiredRoles = methodRoles ?? classRoles;

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: { role?: string } }>();
    const userRole = request.user?.role;

    if (!userRole) {
      throw new ForbiddenException('Missing user role');
    }

    if (!requiredRoles.includes(userRole as UserRole)) {
      throw new ForbiddenException('Insufficient role for this resource');
    }

    return true;
  }
}