/// <reference types="node" />

/**
 * Verifies tenant isolation via Prisma extension.
 * Run: npx ts-node --transpile-only scripts/tenant-isolation-check.ts
 */
import { TenantContext } from '../src/tenant/tenant-context';
import { PrismaService } from '../src/prisma/prisma.service';

const DEFAULT_TENANT = 'default-tenant';

async function verifyTenantScopedModel(params: {
  label: string;
  tenantA: string;
  tenantB: string;
  unscopedCountA: () => Promise<number>;
  unscopedCountB: () => Promise<number>;
  scopedCountA: () => Promise<number>;
  scopedCountB: () => Promise<number>;
}) {
  const [expectedA, expectedB, actualA, actualB] = await Promise.all([
    params.unscopedCountA(),
    params.unscopedCountB(),
    params.scopedCountA(),
    params.scopedCountB(),
  ]);

  console.log(`${params.label} tenant A scoped: ${actualA}, tenant B scoped: ${actualB}`);
  if (actualA !== expectedA || actualB !== expectedB) {
    throw new Error(`Isolation failure: ${params.label} scoped count mismatch`);
  }
}

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

    const totalMessageTranslations = await base.messageTranslation.count();
    const tenantATranslationCount = await base.messageTranslation.count({ where: { tenantId: tenantA } });
    const tenantBTranslationCount = await base.messageTranslation.count({ where: { tenantId: tenantB } });
    const scopedTranslationsA = await TenantContext.run(tenantA, () =>
      scoped.messageTranslation.count(),
    );
    const scopedTranslationsB = await TenantContext.run(tenantB, () =>
      scoped.messageTranslation.count(),
    );
    console.log(`MessageTranslation total: ${totalMessageTranslations}, tenant A scoped: ${scopedTranslationsA}`);

    if (scopedTranslationsA !== tenantATranslationCount) {
      throw new Error('Isolation failure: tenant A scoped messageTranslation count mismatch');
    }

    if (scopedTranslationsB !== tenantBTranslationCount) {
      throw new Error('Isolation failure: tenant B scoped messageTranslation count mismatch');
    }

    if (tenantA !== tenantB && scopedTranslationsA + scopedTranslationsB > totalMessageTranslations) {
      throw new Error('Isolation failure: scoped messageTranslation counts exceed total');
    }

    if (tenantA !== tenantB) {
      const crossTranslation = await TenantContext.run(tenantA, () =>
        scoped.messageTranslation.findFirst({
          where: { tenantId: tenantB },
        }),
      );
      if (crossTranslation) {
        throw new Error('Isolation failure: tenant A context read tenant B message translation');
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

    // Arac yakit uyumlulugu. Sizmasi, baska bir kiracinin filosunun teknik
    // donanimini (hangi araci HVO100 ile calisiyor) aciga vurmak olurdu; ayrica
    // surucu ucu istasyon filtresini BU tabloya gore kuruyor.
    const totalFuelCompatibilities = await base.vehicleFuelCompatibility.count();
    const scopedFuelCompatibilitiesA = await TenantContext.run(tenantA, () =>
      scoped.vehicleFuelCompatibility.count(),
    );
    console.log(
      `VehicleFuelCompatibility total: ${totalFuelCompatibilities}, tenant A scoped: ${scopedFuelCompatibilitiesA}`,
    );

    if (tenantA !== tenantB) {
      const crossFuelCompatibility = await TenantContext.run(tenantA, () =>
        scoped.vehicleFuelCompatibility.findFirst({
          where: { tenantId: tenantB },
        }),
      );
      if (crossFuelCompatibility) {
        throw new Error('Isolation failure: tenant A context read tenant B fuel compatibility');
      }
    }

    const totalEquipmentIssuances = await base.equipmentIssuance.count();
    const tenantAEquipmentIssuanceCount = await base.equipmentIssuance.count({ where: { tenantId: tenantA } });
    const tenantBEquipmentIssuanceCount = await base.equipmentIssuance.count({ where: { tenantId: tenantB } });
    const scopedEquipmentIssuancesA = await TenantContext.run(tenantA, () =>
      scoped.equipmentIssuance.count(),
    );
    const scopedEquipmentIssuancesB = await TenantContext.run(tenantB, () =>
      scoped.equipmentIssuance.count(),
    );
    console.log(
      `EquipmentIssuance total: ${totalEquipmentIssuances}, tenant A scoped: ${scopedEquipmentIssuancesA}`,
    );

    if (scopedEquipmentIssuancesA !== tenantAEquipmentIssuanceCount) {
      throw new Error('Isolation failure: tenant A scoped equipmentIssuance count mismatch');
    }

    if (scopedEquipmentIssuancesB !== tenantBEquipmentIssuanceCount) {
      throw new Error('Isolation failure: tenant B scoped equipmentIssuance count mismatch');
    }

    if (tenantA !== tenantB && scopedEquipmentIssuancesA + scopedEquipmentIssuancesB > totalEquipmentIssuances) {
      throw new Error('Isolation failure: scoped equipmentIssuance counts exceed total');
    }

    if (tenantA !== tenantB) {
      const crossEquipmentIssuance = await TenantContext.run(tenantA, () =>
        scoped.equipmentIssuance.findFirst({
          where: { tenantId: tenantB },
        }),
      );
      if (crossEquipmentIssuance) {
        throw new Error('Isolation failure: tenant A context read tenant B equipment issuance');
      }
    }

    const totalWorkSessions = await base.workSession.count();
    const tenantAWorkSessionCount = await base.workSession.count({ where: { tenantId: tenantA } });
    const tenantBWorkSessionCount = await base.workSession.count({ where: { tenantId: tenantB } });
    const scopedWorkSessionsA = await TenantContext.run(tenantA, () =>
      scoped.workSession.count(),
    );
    const scopedWorkSessionsB = await TenantContext.run(tenantB, () =>
      scoped.workSession.count(),
    );
    console.log(`WorkSession total: ${totalWorkSessions}, tenant A scoped: ${scopedWorkSessionsA}`);

    if (scopedWorkSessionsA !== tenantAWorkSessionCount) {
      throw new Error('Isolation failure: tenant A scoped workSession count mismatch');
    }

    if (scopedWorkSessionsB !== tenantBWorkSessionCount) {
      throw new Error('Isolation failure: tenant B scoped workSession count mismatch');
    }

    if (tenantA !== tenantB && scopedWorkSessionsA + scopedWorkSessionsB > totalWorkSessions) {
      throw new Error('Isolation failure: scoped workSession counts exceed total');
    }

    if (tenantA !== tenantB) {
      const crossWorkSession = await TenantContext.run(tenantA, () =>
        scoped.workSession.findFirst({
          where: { tenantId: tenantB },
        }),
      );
      if (crossWorkSession) {
        throw new Error('Isolation failure: tenant A context read tenant B work session');
      }
    }

    await Promise.all([
      // Yakit islemi. Faz 6'dan itibaren fis GORUNTUSU, istasyon adi, fis
      // numarasi ve odeme yontemi de bu satirda duruyor — sizmasi bir
      // kiracinin mali belgesini digerine gostermek olurdu.
      verifyTenantScopedModel({
        label: 'FleetFuelEntry', tenantA, tenantB,
        unscopedCountA: () => base.fleetFuelEntry.count({ where: { tenantId: tenantA } }),
        unscopedCountB: () => base.fleetFuelEntry.count({ where: { tenantId: tenantB } }),
        scopedCountA: () => TenantContext.run(tenantA, () => scoped.fleetFuelEntry.count()),
        scopedCountB: () => TenantContext.run(tenantB, () => scoped.fleetFuelEntry.count()),
      }),
      // Ters kayit. Sizmasi, bir kiracinin hangi fisi neden geri aldigini —
      // yani muhasebe hatasini ve serbest aciklamasini — digerine gostermek
      // olurdu.
      verifyTenantScopedModel({
        label: 'FleetFuelEntryReversal', tenantA, tenantB,
        unscopedCountA: () => base.fleetFuelEntryReversal.count({ where: { tenantId: tenantA } }),
        unscopedCountB: () => base.fleetFuelEntryReversal.count({ where: { tenantId: tenantB } }),
        scopedCountA: () => TenantContext.run(tenantA, () => scoped.fleetFuelEntryReversal.count()),
        scopedCountB: () => TenantContext.run(tenantB, () => scoped.fleetFuelEntryReversal.count()),
      }),
      verifyTenantScopedModel({
        label: 'VehicleFuelCompatibility', tenantA, tenantB,
        unscopedCountA: () => base.vehicleFuelCompatibility.count({ where: { tenantId: tenantA } }),
        unscopedCountB: () => base.vehicleFuelCompatibility.count({ where: { tenantId: tenantB } }),
        scopedCountA: () => TenantContext.run(tenantA, () => scoped.vehicleFuelCompatibility.count()),
        scopedCountB: () => TenantContext.run(tenantB, () => scoped.vehicleFuelCompatibility.count()),
      }),
      // Yakit niyeti. Sizmasi, bir kiracinin surucusunun HANGI ISTASYONDA ve
      // NE ZAMAN duracagini digerine gostermek olurdu — arac, tur ve secim
      // zamani tek satirda duruyor.
      verifyTenantScopedModel({
        label: 'FuelingIntent', tenantA, tenantB,
        unscopedCountA: () => base.fuelingIntent.count({ where: { tenantId: tenantA } }),
        unscopedCountB: () => base.fuelingIntent.count({ where: { tenantId: tenantB } }),
        scopedCountA: () => TenantContext.run(tenantA, () => scoped.fuelingIntent.count()),
        scopedCountB: () => TenantContext.run(tenantB, () => scoped.fuelingIntent.count()),
      }),
      verifyTenantScopedModel({
        label: 'TenantBillingProfile', tenantA, tenantB,
        unscopedCountA: () => base.tenantBillingProfile.count({ where: { tenantId: tenantA } }),
        unscopedCountB: () => base.tenantBillingProfile.count({ where: { tenantId: tenantB } }),
        scopedCountA: () => TenantContext.run(tenantA, () => scoped.tenantBillingProfile.count()),
        scopedCountB: () => TenantContext.run(tenantB, () => scoped.tenantBillingProfile.count()),
      }),
      verifyTenantScopedModel({
        label: 'RateCard', tenantA, tenantB,
        unscopedCountA: () => base.rateCard.count({ where: { tenantId: tenantA } }),
        unscopedCountB: () => base.rateCard.count({ where: { tenantId: tenantB } }),
        scopedCountA: () => TenantContext.run(tenantA, () => scoped.rateCard.count()),
        scopedCountB: () => TenantContext.run(tenantB, () => scoped.rateCard.count()),
      }),
      verifyTenantScopedModel({
        label: 'RateCardItem', tenantA, tenantB,
        unscopedCountA: () => base.rateCardItem.count({ where: { tenantId: tenantA } }),
        unscopedCountB: () => base.rateCardItem.count({ where: { tenantId: tenantB } }),
        scopedCountA: () => TenantContext.run(tenantA, () => scoped.rateCardItem.count()),
        scopedCountB: () => TenantContext.run(tenantB, () => scoped.rateCardItem.count()),
      }),
      verifyTenantScopedModel({
        label: 'Invoice', tenantA, tenantB,
        unscopedCountA: () => base.invoice.count({ where: { tenantId: tenantA } }),
        unscopedCountB: () => base.invoice.count({ where: { tenantId: tenantB } }),
        scopedCountA: () => TenantContext.run(tenantA, () => scoped.invoice.count()),
        scopedCountB: () => TenantContext.run(tenantB, () => scoped.invoice.count()),
      }),
      verifyTenantScopedModel({
        label: 'InvoiceLine', tenantA, tenantB,
        unscopedCountA: () => base.invoiceLine.count({ where: { tenantId: tenantA } }),
        unscopedCountB: () => base.invoiceLine.count({ where: { tenantId: tenantB } }),
        scopedCountA: () => TenantContext.run(tenantA, () => scoped.invoiceLine.count()),
        scopedCountB: () => TenantContext.run(tenantB, () => scoped.invoiceLine.count()),
      }),
      verifyTenantScopedModel({
        label: 'InvoiceAssignmentClaim', tenantA, tenantB,
        unscopedCountA: () => base.invoiceAssignmentClaim.count({ where: { tenantId: tenantA } }),
        unscopedCountB: () => base.invoiceAssignmentClaim.count({ where: { tenantId: tenantB } }),
        scopedCountA: () => TenantContext.run(tenantA, () => scoped.invoiceAssignmentClaim.count()),
        scopedCountB: () => TenantContext.run(tenantB, () => scoped.invoiceAssignmentClaim.count()),
      }),
      verifyTenantScopedModel({
        label: 'InvoiceNumberSequence', tenantA, tenantB,
        unscopedCountA: () => base.invoiceNumberSequence.count({ where: { tenantId: tenantA } }),
        unscopedCountB: () => base.invoiceNumberSequence.count({ where: { tenantId: tenantB } }),
        scopedCountA: () => TenantContext.run(tenantA, () => scoped.invoiceNumberSequence.count()),
        scopedCountB: () => TenantContext.run(tenantB, () => scoped.invoiceNumberSequence.count()),
      }),
      verifyTenantScopedModel({
        label: 'InvoicePayment', tenantA, tenantB,
        unscopedCountA: () => base.invoicePayment.count({ where: { tenantId: tenantA } }),
        unscopedCountB: () => base.invoicePayment.count({ where: { tenantId: tenantB } }),
        scopedCountA: () => TenantContext.run(tenantA, () => scoped.invoicePayment.count()),
        scopedCountB: () => TenantContext.run(tenantB, () => scoped.invoicePayment.count()),
      }),
      verifyTenantScopedModel({
        label: 'InvoiceDeliveryAttempt', tenantA, tenantB,
        unscopedCountA: () => base.invoiceDeliveryAttempt.count({ where: { tenantId: tenantA } }),
        unscopedCountB: () => base.invoiceDeliveryAttempt.count({ where: { tenantId: tenantB } }),
        scopedCountA: () => TenantContext.run(tenantA, () => scoped.invoiceDeliveryAttempt.count()),
        scopedCountB: () => TenantContext.run(tenantB, () => scoped.invoiceDeliveryAttempt.count()),
      }),
      verifyTenantScopedModel({
        label: 'InvoiceAuditEvent', tenantA, tenantB,
        unscopedCountA: () => base.invoiceAuditEvent.count({ where: { tenantId: tenantA } }),
        unscopedCountB: () => base.invoiceAuditEvent.count({ where: { tenantId: tenantB } }),
        scopedCountA: () => TenantContext.run(tenantA, () => scoped.invoiceAuditEvent.count()),
        scopedCountB: () => TenantContext.run(tenantB, () => scoped.invoiceAuditEvent.count()),
      }),
      verifyTenantScopedModel({
        label: 'DunningNotice', tenantA, tenantB,
        unscopedCountA: () => base.dunningNotice.count({ where: { tenantId: tenantA } }),
        unscopedCountB: () => base.dunningNotice.count({ where: { tenantId: tenantB } }),
        scopedCountA: () => TenantContext.run(tenantA, () => scoped.dunningNotice.count()),
        scopedCountB: () => TenantContext.run(tenantB, () => scoped.dunningNotice.count()),
      }),
      verifyTenantScopedModel({
        label: 'DatevExport', tenantA, tenantB,
        unscopedCountA: () => base.datevExport.count({ where: { tenantId: tenantA } }),
        unscopedCountB: () => base.datevExport.count({ where: { tenantId: tenantB } }),
        scopedCountA: () => TenantContext.run(tenantA, () => scoped.datevExport.count()),
        scopedCountB: () => TenantContext.run(tenantB, () => scoped.datevExport.count()),
      }),
      verifyTenantScopedModel({
        label: 'Location', tenantA, tenantB,
        unscopedCountA: () => base.location.count({ where: { tenantId: tenantA } }),
        unscopedCountB: () => base.location.count({ where: { tenantId: tenantB } }),
        scopedCountA: () => TenantContext.run(tenantA, () => scoped.location.count()),
        scopedCountB: () => TenantContext.run(tenantB, () => scoped.location.count()),
      }),
      verifyTenantScopedModel({
        label: 'Tour', tenantA, tenantB,
        unscopedCountA: () => base.tour.count({ where: { tenantId: tenantA } }),
        unscopedCountB: () => base.tour.count({ where: { tenantId: tenantB } }),
        scopedCountA: () => TenantContext.run(tenantA, () => scoped.tour.count()),
        scopedCountB: () => TenantContext.run(tenantB, () => scoped.tour.count()),
      }),
      verifyTenantScopedModel({
        label: 'TourStop', tenantA, tenantB,
        unscopedCountA: () => base.tourStop.count({ where: { tenantId: tenantA } }),
        unscopedCountB: () => base.tourStop.count({ where: { tenantId: tenantB } }),
        scopedCountA: () => TenantContext.run(tenantA, () => scoped.tourStop.count()),
        scopedCountB: () => TenantContext.run(tenantB, () => scoped.tourStop.count()),
      }),
      verifyTenantScopedModel({
        label: 'WorkTimeEvent', tenantA, tenantB,
        unscopedCountA: () => base.workTimeEvent.count({ where: { tenantId: tenantA } }),
        unscopedCountB: () => base.workTimeEvent.count({ where: { tenantId: tenantB } }),
        scopedCountA: () => TenantContext.run(tenantA, () => scoped.workTimeEvent.count()),
        scopedCountB: () => TenantContext.run(tenantB, () => scoped.workTimeEvent.count()),
      }),
      verifyTenantScopedModel({
        label: 'TenantPayrollProfile', tenantA, tenantB,
        unscopedCountA: () => base.tenantPayrollProfile.count({ where: { tenantId: tenantA } }),
        unscopedCountB: () => base.tenantPayrollProfile.count({ where: { tenantId: tenantB } }),
        scopedCountA: () => TenantContext.run(tenantA, () => scoped.tenantPayrollProfile.count()),
        scopedCountB: () => TenantContext.run(tenantB, () => scoped.tenantPayrollProfile.count()),
      }),
      verifyTenantScopedModel({
        label: 'DriverPayrollProfile', tenantA, tenantB,
        unscopedCountA: () => base.driverPayrollProfile.count({ where: { tenantId: tenantA } }),
        unscopedCountB: () => base.driverPayrollProfile.count({ where: { tenantId: tenantB } }),
        scopedCountA: () => TenantContext.run(tenantA, () => scoped.driverPayrollProfile.count()),
        scopedCountB: () => TenantContext.run(tenantB, () => scoped.driverPayrollProfile.count()),
      }),
      verifyTenantScopedModel({
        label: 'PublicHoliday', tenantA, tenantB,
        unscopedCountA: () => base.publicHoliday.count({ where: { tenantId: tenantA } }),
        unscopedCountB: () => base.publicHoliday.count({ where: { tenantId: tenantB } }),
        scopedCountA: () => TenantContext.run(tenantA, () => scoped.publicHoliday.count()),
        scopedCountB: () => TenantContext.run(tenantB, () => scoped.publicHoliday.count()),
      }),
      verifyTenantScopedModel({
        label: 'PayrollDayTypeMapping', tenantA, tenantB,
        unscopedCountA: () => base.payrollDayTypeMapping.count({ where: { tenantId: tenantA } }),
        unscopedCountB: () => base.payrollDayTypeMapping.count({ where: { tenantId: tenantB } }),
        scopedCountA: () => TenantContext.run(tenantA, () => scoped.payrollDayTypeMapping.count()),
        scopedCountB: () => TenantContext.run(tenantB, () => scoped.payrollDayTypeMapping.count()),
      }),
      verifyTenantScopedModel({
        label: 'PayrollPeriod', tenantA, tenantB,
        unscopedCountA: () => base.payrollPeriod.count({ where: { tenantId: tenantA } }),
        unscopedCountB: () => base.payrollPeriod.count({ where: { tenantId: tenantB } }),
        scopedCountA: () => TenantContext.run(tenantA, () => scoped.payrollPeriod.count()),
        scopedCountB: () => TenantContext.run(tenantB, () => scoped.payrollPeriod.count()),
      }),
      verifyTenantScopedModel({
        label: 'PayrollDay', tenantA, tenantB,
        unscopedCountA: () => base.payrollDay.count({ where: { tenantId: tenantA } }),
        unscopedCountB: () => base.payrollDay.count({ where: { tenantId: tenantB } }),
        scopedCountA: () => TenantContext.run(tenantA, () => scoped.payrollDay.count()),
        scopedCountB: () => TenantContext.run(tenantB, () => scoped.payrollDay.count()),
      }),
      verifyTenantScopedModel({
        label: 'PayrollEntry', tenantA, tenantB,
        unscopedCountA: () => base.payrollEntry.count({ where: { tenantId: tenantA } }),
        unscopedCountB: () => base.payrollEntry.count({ where: { tenantId: tenantB } }),
        scopedCountA: () => TenantContext.run(tenantA, () => scoped.payrollEntry.count()),
        scopedCountB: () => TenantContext.run(tenantB, () => scoped.payrollEntry.count()),
      }),
      verifyTenantScopedModel({
        label: 'PayrollWageTypeMapping', tenantA, tenantB,
        unscopedCountA: () => base.payrollWageTypeMapping.count({ where: { tenantId: tenantA } }),
        unscopedCountB: () => base.payrollWageTypeMapping.count({ where: { tenantId: tenantB } }),
        scopedCountA: () => TenantContext.run(tenantA, () => scoped.payrollWageTypeMapping.count()),
        scopedCountB: () => TenantContext.run(tenantB, () => scoped.payrollWageTypeMapping.count()),
      }),
      verifyTenantScopedModel({
        label: 'PayrollExport', tenantA, tenantB,
        unscopedCountA: () => base.payrollExport.count({ where: { tenantId: tenantA } }),
        unscopedCountB: () => base.payrollExport.count({ where: { tenantId: tenantB } }),
        scopedCountA: () => TenantContext.run(tenantA, () => scoped.payrollExport.count()),
        scopedCountB: () => TenantContext.run(tenantB, () => scoped.payrollExport.count()),
      }),
      // Takograf mola adayi. Zeiterfassung kaydi degil ama SURUCU CALISMA
      // ARALIKLARINI tasiyor — sizmasi, bir kiracinin surucusunun ne zaman
      // dinlendigini digerine gostermek olurdu.
      verifyTenantScopedModel({
        label: 'BreakCandidate', tenantA, tenantB,
        unscopedCountA: () => base.breakCandidate.count({ where: { tenantId: tenantA } }),
        unscopedCountB: () => base.breakCandidate.count({ where: { tenantId: tenantB } }),
        scopedCountA: () => TenantContext.run(tenantA, () => scoped.breakCandidate.count()),
        scopedCountB: () => TenantContext.run(tenantB, () => scoped.breakCandidate.count()),
      }),
      // Yakit seviyesi ornekleri. Sizmasi, bir kiracinin araclarinin ne zaman
      // depo doldurdugunu ve seviyelerinin nasil seyrettigini digerine
      // gostermek olurdu — yani filo hareketinin dolayli izi.
      verifyTenantScopedModel({
        label: 'VehicleFuelLevelSample', tenantA, tenantB,
        unscopedCountA: () => base.vehicleFuelLevelSample.count({ where: { tenantId: tenantA } }),
        unscopedCountB: () => base.vehicleFuelLevelSample.count({ where: { tenantId: tenantB } }),
        scopedCountA: () => TenantContext.run(tenantA, () => scoped.vehicleFuelLevelSample.count()),
        scopedCountB: () => TenantContext.run(tenantB, () => scoped.vehicleFuelLevelSample.count()),
      }),
      // Yakit mutabakati. Kiraciyi asmasi EN AGIR sizinti turlerinden biri:
      // satir hem risk degerlendirmesini hem de muhasebenin inceleme notunu
      // tasiyor — yani baska bir firmanin personeli hakkindaki supheyi.
      verifyTenantScopedModel({
        label: 'FuelReconciliation', tenantA, tenantB,
        unscopedCountA: () => base.fuelReconciliation.count({ where: { tenantId: tenantA } }),
        unscopedCountB: () => base.fuelReconciliation.count({ where: { tenantId: tenantB } }),
        scopedCountA: () => TenantContext.run(tenantA, () => scoped.fuelReconciliation.count()),
        scopedCountB: () => TenantContext.run(tenantB, () => scoped.fuelReconciliation.count()),
      }),
    ]);

    console.log('Tenant isolation check passed.');
  } finally {
    await base.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
