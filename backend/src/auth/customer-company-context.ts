import { PrismaService } from '../prisma/prisma.service';

export type CustomerCompanyContext = {
  companyIds: string[];
  companyId: string | null;
  companies: { id: string; name: string }[];
};

export async function resolveCustomerCompanyContext(
  prisma: PrismaService,
  userId: string,
): Promise<CustomerCompanyContext | null> {
  const memberships = await prisma.companyUser.findMany({
    where: { userId },
    include: {
      company: {
        select: { id: true, name: true },
      },
    },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  });

  if (memberships.length === 0) {
    return {
      companyIds: [],
      companyId: null,
      companies: [],
    };
  }

  const companies = memberships.map((membership) => ({
    id: membership.company.id,
    name: membership.company.name,
  }));

  const primaryMembership =
    memberships.find((membership) => membership.isPrimary) ?? memberships[0];

  return {
    companyIds: companies.map((company) => company.id),
    companyId: primaryMembership.company.id,
    companies,
  };
}
