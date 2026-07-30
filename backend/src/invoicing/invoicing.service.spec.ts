import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { InvoiceTaxCategory, OutgoingInvoiceStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { DatevExportStorageService } from '../storage/datev-export-storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { InvoiceDocumentStorageService } from '../storage/invoice-document-storage.service';
import { InvoicingService } from './invoicing.service';

function createService(prisma: object): InvoicingService {
  return new InvoicingService(
    prisma as unknown as PrismaService,
    { logAction: async () => undefined } as unknown as AuditService,
    // These cases never reach document generation; finalize is covered separately.
    {} as unknown as InvoiceDocumentStorageService,
    // Nor DATEV export; dedicated specs cover that path.
    {} as unknown as DatevExportStorageService,
    // Nor mail delivery; sending is covered in invoicing-send.spec.ts.
    {} as unknown as MailService,
  );
}

const baseDraft = {
  companyId: 'company-a',
  servicePeriodStart: '2026-07-01',
  servicePeriodEnd: '2026-07-07',
  assignmentIds: ['assignment-a'],
  manualLines: [],
};

const company = {
  id: 'company-a',
  name: 'Acme Logistik',
  defaultDailyRevenue: new Prisma.Decimal('1000.00'),
  defaultTaxCategory: InvoiceTaxCategory.standard,
  defaultPaymentTermDays: 14,
};

function assignment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'assignment-a',
    companyId: 'company-a',
    status: 'completed',
    workDate: new Date('2026-07-02T00:00:00.000Z'),
    cargoName: 'Paletten',
    routeName: 'Berlin – Hamburg',
    pickupAddress: 'Berlin',
    deliveryAddress: 'Hamburg',
    expectedDailyRevenue: new Prisma.Decimal('1000.00'),
    invoiceClaim: null,
    company: { defaultDailyRevenue: new Prisma.Decimal('900.00') },
    ...overrides,
  };
}

function draftPrisma(assignments: object[]) {
  return {
    company: { findUnique: async () => company },
    tenantBillingProfile: { findFirst: async () => null },
    assignment: { findMany: async () => assignments },
  };
}

describe('InvoicingService draft safety', () => {
  it('rejects assignments owned by another company', async () => {
    const service = createService(
      draftPrisma([assignment({ companyId: 'company-b' })]),
    );

    await assert.rejects(
      service.createDraft(baseDraft, 'user-a'),
      (error: unknown) =>
        error instanceof BadRequestException &&
        error.message === 'All assignments must belong to the selected company',
    );
  });

  it('rejects an assignment without an assignment or company price', async () => {
    const service = createService(
      draftPrisma([
        assignment({
          expectedDailyRevenue: null,
          company: { defaultDailyRevenue: null },
        }),
      ]),
    );

    await assert.rejects(
      service.createDraft(baseDraft, 'user-a'),
      (error: unknown) =>
        error instanceof BadRequestException &&
        error.message === 'Assignment assignment-a has no invoice price',
    );
  });

  it('rejects changes after an invoice leaves draft status', async () => {
    const service = createService({
      invoice: {
        findUnique: async () => ({
          id: 'invoice-a',
          status: OutgoingInvoiceStatus.finalized,
          servicePeriodStart: new Date('2026-07-01T00:00:00.000Z'),
          servicePeriodEnd: new Date('2026-07-07T00:00:00.000Z'),
        }),
      },
    });

    await assert.rejects(
      service.updateDraft('invoice-a', { notes: 'changed' }, 'user-a'),
      (error: unknown) =>
        error instanceof ConflictException &&
        error.message === 'Only draft invoices can be changed',
    );
  });

  it('validates the invoice number format before writing a billing profile', async () => {
    const service = createService({});

    await assert.rejects(
      service.upsertBillingProfile(
        'tenant-a',
        {
          legalName: 'Fleet GmbH',
          street: 'Musterstr. 1',
          postalCode: '10115',
          city: 'Berlin',
          countryCode: 'DE',
          taxNumber: '12/345/67890',
          iban: 'DE001234',
          invoiceNumberFormat: 'INVALID',
          defaultPaymentTermDays: 14,
          defaultTaxRateBasisPoints: 1900,
          smallBusinessRule: false,
          dunningEnabled: true,
          dunningLevel1Days: 1,
          dunningLevel2Days: 14,
          dunningLevel3Days: 28,
          dunningLevel1FeeCents: 0,
          dunningLevel2FeeCents: 500,
          dunningLevel3FeeCents: 1000,
        },
        'user-a',
      ),
      RangeError,
    );
  });
});
