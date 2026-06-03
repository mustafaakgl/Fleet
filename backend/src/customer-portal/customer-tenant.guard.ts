import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CustomerCompanySummary, CustomerTenantRequest } from './customer-portal.types';

@Injectable()
export class CustomerTenantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CustomerTenantRequest>();
    const user = request.user;

    if (!user || user.role !== 'customer') {
      throw new ForbiddenException('Customer role required');
    }

    const memberships = await this.prisma.companyUser.findMany({
      where: { userId: user.id },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            portalSettings: {
              select: { portalEnabled: true },
            },
          },
        },
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });

    if (memberships.length === 0) {
      throw new ForbiddenException('No company memberships found for this customer user');
    }

    const enabledMemberships = memberships.filter(
      (membership) => membership.company.portalSettings?.portalEnabled !== false,
    );

    if (enabledMemberships.length === 0) {
      throw new ForbiddenException('Customer portal is disabled for all assigned companies');
    }

    const customerCompanies: CustomerCompanySummary[] = enabledMemberships.map((membership) => ({
      id: membership.company.id,
      name: membership.company.name,
    }));

    request.customerCompanyIds = customerCompanies.map((company) => company.id);
    request.customerCompanies = customerCompanies;

    return true;
  }
}
