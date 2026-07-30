import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { describe, it } from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { DatevExportStatus, InvoiceKind, OutgoingInvoiceStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { DatevExportStorageService } from '../storage/datev-export-storage.service';
import { InvoiceDocumentStorageService } from '../storage/invoice-document-storage.service';
import { InvoicingService } from './invoicing.service';

type CompanyRow = {
  id: string;
  tenantId: string;
  name: string;
  datevDebtorNumber: number | null;
};

type InvoiceRow = {
  id: string;
  tenantId: string;
  companyId: string;
  number: string | null;
  kind: InvoiceKind;
  status: OutgoingInvoiceStatus;
  invoiceDate: Date;
  taxBreakdown: Array<{ taxCategory: string; taxRateBasisPoints: number; grossCents: number }>;
  grossCents: number;
};

type ProfileRow = {
  tenantId: string;
  datevConsultantNumber: string | null;
  datevClientNumber: string | null;
  datevChart: string;
  revenueAccount19: string;
  revenueAccount7: string;
  revenueAccount0: string;
  revenueAccountReverseCharge: string;
  debtorNumberStart: number;
};

type ExportRow = {
  id: string;
  tenantId: string;
  periodStart: Date;
  periodEnd: Date;
  createdById: string;
  fileStoredPath: string;
  fileSha256: string;
  invoiceIds: string[];
  status: DatevExportStatus;
};

type Store = {
  companies: CompanyRow[];
  invoices: InvoiceRow[];
  profiles: ProfileRow[];
  exports: ExportRow[];
  auditEvents: Array<Record<string, unknown>>;
  files: Map<string, Buffer>;
};

function matchesDateRange(value: Date, gte?: Date, lt?: Date): boolean {
  if (gte && value < gte) return false;
  if (lt && value >= lt) return false;
  return true;
}

function createFakePrisma(store: Store) {
  const client = {
    tenantBillingProfile: {
      findUnique: async (args: { where: { tenantId: string } }) => {
        const row = store.profiles.find((profile) => profile.tenantId === args.where.tenantId);
        return row ? { ...row } : null;
      },
    },
    invoice: {
      findMany: async (args: {
        where: {
          tenantId: string;
          invoiceDate: { gte: Date; lt: Date };
          status: { not: OutgoingInvoiceStatus };
          number: { not: null };
        };
      }) => {
        const rows = store.invoices
          .filter((invoice) => invoice.tenantId === args.where.tenantId)
          .filter((invoice) => matchesDateRange(invoice.invoiceDate, args.where.invoiceDate.gte, args.where.invoiceDate.lt))
          .filter((invoice) => invoice.status !== args.where.status.not)
          .filter((invoice) => invoice.number !== null)
          .sort((left, right) => left.invoiceDate.getTime() - right.invoiceDate.getTime());

        return rows.map((invoice) => ({
          ...invoice,
          company: store.companies.find((company) => company.id === invoice.companyId)!,
        }));
      },
    },
    company: {
      findMany: async (args: { where: { tenantId: string; id: { in: string[] } } }) => {
        return store.companies
          .filter((company) => company.tenantId === args.where.tenantId)
          .filter((company) => args.where.id.in.includes(company.id))
          .sort((left, right) => left.name.localeCompare(right.name))
          .map((company) => ({ ...company }));
      },
      findFirst: async (args: {
        where: { tenantId: string; datevDebtorNumber: { not: null } };
      }) => {
        const rows = store.companies
          .filter((company) => company.tenantId === args.where.tenantId)
          .filter((company) => company.datevDebtorNumber !== null)
          .sort((left, right) => (right.datevDebtorNumber ?? 0) - (left.datevDebtorNumber ?? 0));
        return rows.length > 0 ? { datevDebtorNumber: rows[0].datevDebtorNumber } : null;
      },
      update: async (args: { where: { id: string }; data: { datevDebtorNumber: number } }) => {
        const row = store.companies.find((company) => company.id === args.where.id);
        if (!row) throw new Error('company not found');
        row.datevDebtorNumber = args.data.datevDebtorNumber;
        return { ...row };
      },
    },
    datevExport: {
      findMany: async (args: { where: { tenantId: string } }) =>
        store.exports.filter((row) => row.tenantId === args.where.tenantId).map((row) => ({ ...row })),
      create: async (args: { data: Omit<ExportRow, 'id' | 'status'> }) => {
        const row: ExportRow = {
          id: `datev-export-${store.exports.length + 1}`,
          status: DatevExportStatus.generated,
          ...args.data,
        };
        store.exports.push(row);
        return { ...row };
      },
      findFirst: async (args: { where: { id: string; tenantId: string } }) => {
        const row = store.exports.find(
          (item) => item.id === args.where.id && item.tenantId === args.where.tenantId,
        );
        return row ? { ...row } : null;
      },
      update: async (args: { where: { id: string }; data: { status: DatevExportStatus } }) => {
        const row = store.exports.find((item) => item.id === args.where.id);
        if (!row) throw new Error('datev export not found');
        row.status = args.data.status;
        return { ...row };
      },
    },
    invoiceAuditEvent: {
      createMany: async (args: { data: Array<Record<string, unknown>> }) => {
        for (const row of args.data) store.auditEvents.push(row);
        return { count: args.data.length };
      },
    },
  };

  return {
    ...client,
    $transaction: async (fn: (tx: typeof client) => Promise<unknown>) => fn(client),
  };
}

function createStorage(store: Store): DatevExportStorageService {
  return {
    buildFileName: (periodStart: Date, periodEnd: Date) =>
      `datev-extf-${periodStart.toISOString().slice(0, 10).replace(/-/g, '')}-${periodEnd
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, '')}.csv`,
    save: async (storedFileName: string, contents: Buffer) => {
      const storedPath = `/uploads/datev-exports/${storedFileName}`;
      store.files.set(storedPath, contents);
      return {
        storedPath,
        sha256: 'test-sha',
        byteSize: contents.byteLength,
      };
    },
    open: async (storedPath: string) => {
      const file = store.files.get(storedPath);
      if (!file) return null;
      return { stream: Readable.from(file), contentType: 'text/csv' };
    },
    mimeTypeFor: () => 'text/csv',
  } as unknown as DatevExportStorageService;
}

function createService(store: Store): InvoicingService {
  return new InvoicingService(
    createFakePrisma(store) as unknown as PrismaService,
    { logAction: async () => undefined } as unknown as AuditService,
    {} as unknown as InvoiceDocumentStorageService,
    createStorage(store),
    {} as unknown as MailService,
  );
}

function baseStore(overrides: Partial<Store> = {}): Store {
  return {
    companies: [
      { id: 'company-a', tenantId: 'tenant-a', name: 'Acme', datevDebtorNumber: null },
      { id: 'company-b', tenantId: 'tenant-a', name: 'Beta', datevDebtorNumber: null },
    ],
    invoices: [
      {
        id: 'invoice-a',
        tenantId: 'tenant-a',
        companyId: 'company-a',
        number: 'RE-1',
        kind: InvoiceKind.invoice,
        status: OutgoingInvoiceStatus.sent,
        invoiceDate: new Date('2026-07-10T00:00:00.000Z'),
        taxBreakdown: [
          { taxCategory: 'standard', taxRateBasisPoints: 1900, grossCents: 119_000 },
          { taxCategory: 'reduced', taxRateBasisPoints: 700, grossCents: 10_700 },
          { taxCategory: 'exempt', taxRateBasisPoints: 0, grossCents: 10_000 },
          { taxCategory: 'reverse_charge', taxRateBasisPoints: 0, grossCents: 13_000 },
        ],
        grossCents: 152_700,
      },
    ],
    profiles: [
      {
        tenantId: 'tenant-a',
        datevConsultantNumber: '123',
        datevClientNumber: '456',
        datevChart: 'SKR03',
        revenueAccount19: '8400',
        revenueAccount7: '8300',
        revenueAccount0: '8125',
        revenueAccountReverseCharge: '8337',
        debtorNumberStart: 10000,
      },
    ],
    exports: [],
    auditEvents: [],
    files: new Map(),
    ...overrides,
  };
}

describe('InvoicingService DATEV export', () => {
  it('assigns debtor number from start and reuses existing number on next export', async () => {
    const store = baseStore();
    const service = createService(store);

    const first = await service.exportDatev('2026-07-01', '2026-07-31', 'tenant-a', 'user-a');
    assert.equal(first.invoiceCount, 1);
    assert.equal(store.companies[0].datevDebtorNumber, 10000);

    store.invoices.push({
      ...store.invoices[0],
      id: 'invoice-b',
      number: 'RE-2',
      companyId: 'company-b',
      invoiceDate: new Date('2026-07-11T00:00:00.000Z'),
    });

    const second = await service.exportDatev('2026-07-01', '2026-07-31', 'tenant-a', 'user-a');
    assert.equal(second.invoiceCount, 2);
    assert.equal(store.companies[0].datevDebtorNumber, 10000);
    assert.equal(store.companies[1].datevDebtorNumber, 10001);
  });

  it('returns warning for invoices that were exported before', async () => {
    const store = baseStore({
      exports: [
        {
          id: 'datev-export-1',
          tenantId: 'tenant-a',
          periodStart: new Date('2026-06-01T00:00:00.000Z'),
          periodEnd: new Date('2026-06-30T00:00:00.000Z'),
          createdById: 'user-a',
          fileStoredPath: '/uploads/datev-exports/old.zip',
          fileSha256: 'old-sha',
          invoiceIds: ['invoice-a'],
          status: DatevExportStatus.generated,
        },
      ],
    });
    const service = createService(store);

    const result = await service.exportDatev('2026-07-01', '2026-07-31', 'tenant-a', 'user-a');

    assert.ok(result.warning);
    assert.equal(result.warning?.code, 'DATEV_ALREADY_EXPORTED_INVOICES');
    assert.deepEqual(result.warning?.invoiceNumbers, ['RE-1']);
  });

  it('exports empty period without failing', async () => {
    const store = baseStore({ invoices: [] });
    const service = createService(store);

    const result = await service.exportDatev('2026-07-01', '2026-07-31', 'tenant-a', 'user-a');

    assert.equal(result.invoiceCount, 0);
    assert.equal(store.exports.length, 1);
    assert.equal(result.warning, null);
  });

  it('marks export as downloaded and denies cross-tenant access', async () => {
    const store = baseStore();
    const service = createService(store);

    const created = await service.exportDatev('2026-07-01', '2026-07-31', 'tenant-a', 'user-a');
    const file = await service.downloadDatevExport(created.exportId, 'tenant-a');

    assert.equal(file.mimeType, 'text/csv');
    assert.equal(store.exports[store.exports.length - 1].status, DatevExportStatus.downloaded);

    await assert.rejects(
      service.downloadDatevExport(created.exportId, 'tenant-b'),
      (error: unknown) =>
        error instanceof NotFoundException && error.message === 'DATEV export not found',
    );
  });
});
