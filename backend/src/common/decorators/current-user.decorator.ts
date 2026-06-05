import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { UserRole } from '../utils/permissions';

export type AuthenticatedUser = {
  id: string;
  email: string;
  role: UserRole;
  tenantId?: string;
};

export const CurrentUser = createParamDecorator(
  (property: keyof AuthenticatedUser | undefined, ctx: ExecutionContext): AuthenticatedUser | string | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      return undefined;
    }

    return property ? user[property] : user;
  },
);