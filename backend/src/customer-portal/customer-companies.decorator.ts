import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { CustomerTenantRequest } from './customer-portal.types';

export const CustomerCompanyIds = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string[] => {
    const request = ctx.switchToHttp().getRequest<CustomerTenantRequest>();
    return request.customerCompanyIds ?? [];
  },
);
