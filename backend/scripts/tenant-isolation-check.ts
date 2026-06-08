/**
 * Verifies tenant isolation via Prisma extension.
 * Run: npx ts-node --transpile-only scripts/tenant-isolation-check.ts
 */
import { PrismaClient } from '@prisma/client';
import { TenantContext } from '../src/tenant/tenant-context';
import { createTenantPrismaExtension } from '../src/tenant/tenant-prisma.extension';

const DEFAULT_TENANT = 'default-tenant';

async function main() {
  const base = new PrismaClient();
  const scoped = base.$extends(createTenantPrismaExtension());

  try {
    const tenants = await base.tenant.findMany({ take: 2, orderBy: { createdAt: 'asc' } });
    if (tenants.length === 0) {
      throw new Error('No tenants found — run migrations and seed first.');
    }

    const tenantA = tenants[0]!.id;
    const tenantB = tenants[1]?.id ?? tenantA;

    const totalDrivers = await base.driver.count();
    const scopedA = await TenantContext.run(tenantA, () =>
      scoped.driver.count(),
    );
    const scopedB = await TenantContext.run(tenantB, () =>
      scoped.driver.count(),
    );

    console.log(`Total drivers (unscoped): ${totalDrivers}`);
    console.log(`Scoped drivers tenant A (${tenantA}): ${scopedA}`);
    console.log(`Scoped drivers tenant B (${tenantB}): ${scopedB}`);

    if (tenantA !== tenantB && scopedA + scopedB > totalDrivers) {
      throw new Error('Isolation failure: scoped counts exceed total');
    }

    if (tenantA !== tenantB) {
      const crossRead = await TenantContext.run(tenantA, () =>
        scoped.driver.findFirst({
          where: { tenantId: tenantB },
        }),
      );
      if (crossRead) {
        throw new Error('Isolation failure: tenant A context read tenant B driver');
      }
    }

    const defaultTenantDrivers = await TenantContext.run(DEFAULT_TENANT, () =>
      scoped.driver.count(),
    );
    console.log(`Default tenant drivers: ${defaultTenantDrivers}`);

    const totalLatest = await base.driverLocationLatest.count();
    const scopedLatestA = await TenantContext.run(tenantA, () =>
      scoped.driverLocationLatest.count(),
    );
    console.log(`DriverLocationLatest total: ${totalLatest}, tenant A scoped: ${scopedLatestA}`);

    if (tenantA !== tenantB) {
      const crossLatest = await TenantContext.run(tenantA, () =>
        scoped.driverLocationLatest.findFirst({
          where: { tenantId: tenantB },
        }),
      );
      if (crossLatest) {
        throw new Error('Isolation failure: tenant A context read tenant B location latest');
      }
    }

    const totalMessages = await base.customerAssignmentMessage.count();
    const scopedMessagesA = await TenantContext.run(tenantA, () =>
      scoped.customerAssignmentMessage.count(),
    );
    console.log(`CustomerAssignmentMessage total: ${totalMessages}, tenant A scoped: ${scopedMessagesA}`);

    if (tenantA !== tenantB) {
      const crossMessage = await TenantContext.run(tenantA, () =>
        scoped.customerAssignmentMessage.findFirst({
          where: { tenantId: tenantB },
        }),
      );
      if (crossMessage) {
        throw new Error('Isolation failure: tenant A context read tenant B customer message');
      }
    }

    console.log('Tenant isolation check passed.');
  } finally {
    await base.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
