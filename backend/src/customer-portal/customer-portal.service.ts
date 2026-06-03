import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CustomerCompanySummary } from './customer-portal.types';

@Injectable()
export class CustomerPortalService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string, customerCompanies: CustomerCompanySummary[]) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        language: true,
        status: true,
      },
    });

    if (!user || user.status !== 'active') {
      throw new NotFoundException('User not found');
    }

    const memberships = await this.prisma.companyUser.findMany({
      where: { userId },
      select: { companyId: true, isPrimary: true },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });

    const enabledCompanyIds = new Set(customerCompanies.map((company) => company.id));
    const primaryMembership =
      memberships.find((membership) => membership.isPrimary && enabledCompanyIds.has(membership.companyId)) ??
      memberships.find((membership) => enabledCompanyIds.has(membership.companyId));

    return {
      user: {
        id: user.id,
        name: user.fullName,
        email: user.email,
        role: user.role,
        language: user.language,
        companyIds: customerCompanies.map((company) => company.id),
        companyId: primaryMembership?.companyId ?? customerCompanies[0]?.id ?? null,
        companies: customerCompanies,
      },
      companies: customerCompanies,
      primaryCompanyId: primaryMembership?.companyId ?? customerCompanies[0]?.id ?? null,
    };
  }
}
