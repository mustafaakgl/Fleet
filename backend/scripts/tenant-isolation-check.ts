/// <reference types="node" />

/**
 * Verifies tenant isolation via Prisma extension.
 * Run: npx ts-node --transpile-only scripts/tenant-isolation-check.ts
 */
import { TenantContext } from '../src/tenant/tenant-context';
import { PrismaService } from '../src/prisma/prisma.service';

const DEFAULT_TENANT = 'default-tenant';

async function main() {
  const scoped = new PrismaService();
  const base = scoped.unscoped;

  try {
    const tenants = await base.tenant.findMany({ take: 2, orderBy: { createdAt: 'asc' } });
    if (tenants.length === 0) {
      throw new Error('No tenants found — run migrations and seed first.');
    }

    const tenantA = tenants[0]!.id;
    const tenantB = tenants[1]?.id ?? tenantA;

    const totalDrivers = await base.driver.count();
    const tenantADriverCount = await base.driver.count({ where: { tenantId: tenantA } });
    const tenantBDriverCount = await base.driver.count({ where: { tenantId: tenantB } });
    const scopedA = await TenantContext.run(tenantA, () =>
      scoped.driver.count(),
    );
    const scopedB = await TenantContext.run(tenantB, () =>
      scoped.driver.count(),
    );

    console.log(`Total drivers (unscoped): ${totalDrivers}`);
    console.log(`Scoped drivers tenant A (${tenantA}): ${scopedA}`);
    console.log(`Scoped drivers tenant B (${tenantB}): ${scopedB}`);

    if (scopedA !== tenantADriverCount) {
      throw new Error('Isolation failure: tenant A scoped driver count mismatch');
    }

    if (scopedB !== tenantBDriverCount) {
      throw new Error('Isolation failure: tenant B scoped driver count mismatch');
    }

    if (tenantA !== tenantB && scopedA + scopedB > totalDrivers) {
      throw new Error('Isolation failure: scoped driver counts exceed total');
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
    const tenantALatestCount = await base.driverLocationLatest.count({ where: { tenantId: tenantA } });
    const tenantBLatestCount = await base.driverLocationLatest.count({ where: { tenantId: tenantB } });
    const scopedLatestA = await TenantContext.run(tenantA, () =>
      scoped.driverLocationLatest.count(),
    );
    const scopedLatestB = await TenantContext.run(tenantB, () =>
      scoped.driverLocationLatest.count(),
    );
    console.log(`DriverLocationLatest total: ${totalLatest}, tenant A scoped: ${scopedLatestA}`);

    if (scopedLatestA !== tenantALatestCount) {
      throw new Error('Isolation failure: tenant A scoped driverLocationLatest count mismatch');
    }

    if (scopedLatestB !== tenantBLatestCount) {
      throw new Error('Isolation failure: tenant B scoped driverLocationLatest count mismatch');
    }

    if (tenantA !== tenantB && scopedLatestA + scopedLatestB > totalLatest) {
      throw new Error('Isolation failure: scoped driverLocationLatest counts exceed total');
    }

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
    const tenantAMessageCount = await base.customerAssignmentMessage.count({ where: { tenantId: tenantA } });
    const tenantBMessageCount = await base.customerAssignmentMessage.count({ where: { tenantId: tenantB } });
    const scopedMessagesA = await TenantContext.run(tenantA, () =>
      scoped.customerAssignmentMessage.count(),
    );
    const scopedMessagesB = await TenantContext.run(tenantB, () =>
      scoped.customerAssignmentMessage.count(),
    );
    console.log(`CustomerAssignmentMessage total: ${totalMessages}, tenant A scoped: ${scopedMessagesA}`);

    if (scopedMessagesA !== tenantAMessageCount) {
      throw new Error('Isolation failure: tenant A scoped customerAssignmentMessage count mismatch');
    }

    if (scopedMessagesB !== tenantBMessageCount) {
      throw new Error('Isolation failure: tenant B scoped customerAssignmentMessage count mismatch');
    }

    if (tenantA !== tenantB && scopedMessagesA + scopedMessagesB > totalMessages) {
      throw new Error('Isolation failure: scoped customerAssignmentMessage counts exceed total');
    }

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

    const totalMessageAttachments = await base.messageAttachment.count();
    const tenantAAttachmentCount = await base.messageAttachment.count({ where: { tenantId: tenantA } });
    const tenantBAttachmentCount = await base.messageAttachment.count({ where: { tenantId: tenantB } });
    const scopedAttachmentsA = await TenantContext.run(tenantA, () =>
      scoped.messageAttachment.count(),
    );
    const scopedAttachmentsB = await TenantContext.run(tenantB, () =>
      scoped.messageAttachment.count(),
    );
    console.log(`MessageAttachment total: ${totalMessageAttachments}, tenant A scoped: ${scopedAttachmentsA}`);

    if (scopedAttachmentsA !== tenantAAttachmentCount) {
      throw new Error('Isolation failure: tenant A scoped messageAttachment count mismatch');
    }

    if (scopedAttachmentsB !== tenantBAttachmentCount) {
      throw new Error('Isolation failure: tenant B scoped messageAttachment count mismatch');
    }

    if (tenantA !== tenantB && scopedAttachmentsA + scopedAttachmentsB > totalMessageAttachments) {
      throw new Error('Isolation failure: scoped messageAttachment counts exceed total');
    }

    if (tenantA !== tenantB) {
      const crossAttachment = await TenantContext.run(tenantA, () =>
        scoped.messageAttachment.findFirst({
          where: { tenantId: tenantB },
        }),
      );
      if (crossAttachment) {
        throw new Error('Isolation failure: tenant A context read tenant B message attachment');
      }
    }

    const totalDddFiles = await base.dddFile.count();
    const scopedDddFilesA = await TenantContext.run(tenantA, () =>
      scoped.dddFile.count(),
    );
    console.log(`DddFile total: ${totalDddFiles}, tenant A scoped: ${scopedDddFilesA}`);

    const totalCredentials = await base.tachoProviderCredential.count();
    const scopedCredentialsA = await TenantContext.run(tenantA, () =>
      scoped.tachoProviderCredential.count(),
    );
    console.log(`TachoProviderCredential total: ${totalCredentials}, tenant A scoped: ${scopedCredentialsA}`);

    if (tenantA !== tenantB) {
      const crossDddFile = await TenantContext.run(tenantA, () =>
        scoped.dddFile.findFirst({
          where: { tenantId: tenantB },
        }),
      );
      if (crossDddFile) {
        throw new Error('Isolation failure: tenant A context read tenant B ddd file');
      }

      const crossCredential = await TenantContext.run(tenantA, () =>
        scoped.tachoProviderCredential.findFirst({
          where: { tenantId: tenantB },
        }),
      );
      if (crossCredential) {
        throw new Error('Isolation failure: tenant A context read tenant B provider credential');
      }
    }

    const totalTripPurposeLogs = await base.fleetTripPurposeLog.count();
    const scopedTripPurposeLogsA = await TenantContext.run(tenantA, () =>
      scoped.fleetTripPurposeLog.count(),
    );
    console.log(`FleetTripPurposeLog total: ${totalTripPurposeLogs}, tenant A scoped: ${scopedTripPurposeLogsA}`);

    if (tenantA !== tenantB) {
      const crossTripPurposeLog = await TenantContext.run(tenantA, () =>
        scoped.fleetTripPurposeLog.findFirst({
          where: { tenantId: tenantB },
        }),
      );
      if (crossTripPurposeLog) {
        throw new Error('Isolation failure: tenant A context read tenant B trip purpose log');
      }
    }

    const totalFuelCardBatches = await base.fuelCardImportBatch.count();
    const scopedFuelCardBatchesA = await TenantContext.run(tenantA, () =>
      scoped.fuelCardImportBatch.count(),
    );
    console.log(`FuelCardImportBatch total: ${totalFuelCardBatches}, tenant A scoped: ${scopedFuelCardBatchesA}`);

    if (tenantA !== tenantB) {
      const crossFuelCardBatch = await TenantContext.run(tenantA, () =>
        scoped.fuelCardImportBatch.findFirst({
          where: { tenantId: tenantB },
        }),
      );
      if (crossFuelCardBatch) {
        throw new Error('Isolation failure: tenant A context read tenant B fuel card batch');
      }
    }

    const totalFuelCardTransactions = await base.fuelCardTransaction.count();
    const scopedFuelCardTransactionsA = await TenantContext.run(tenantA, () =>
      scoped.fuelCardTransaction.count(),
    );
    console.log(`FuelCardTransaction total: ${totalFuelCardTransactions}, tenant A scoped: ${scopedFuelCardTransactionsA}`);

    if (tenantA !== tenantB) {
      const crossFuelCardTransaction = await TenantContext.run(tenantA, () =>
        scoped.fuelCardTransaction.findFirst({
          where: { tenantId: tenantB },
        }),
      );
      if (crossFuelCardTransaction) {
        throw new Error('Isolation failure: tenant A context read tenant B fuel card transaction');
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
