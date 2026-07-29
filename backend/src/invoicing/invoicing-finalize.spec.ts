import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { describe, it } from 'node:test';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  EInvoicePreference,
  InvoiceLineSource,
  InvoiceTaxCategory,
  InvoiceUnit,
  OutgoingInvoiceStatus,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceDocumentStorageService } from '../storage/invoice-document-storage.service';
import { TenantContext } from '../tenant/tenant-context';
import { applyTenantScope } from '../tenant/tenant-prisma.extension';
import { InvoicingService } from './invoicing.service';

type InvoiceRow = {
  id: string;
  tenantId: string;
  companyId: string;
  status: OutgoingInvoiceStatus;
  number: string | null;
  invoiceDate: Date;
  servicePeriodStart: Date;
  servicePeriodEnd: Date;
  paymentTermDays: number;
  dueDate: Date | null;
  currency: string;
  netCents: number;
  taxCents: number;
  grossCents: number;
  taxBreakdown: unknown;
  notes: string | null;
  customerName: string | null;
  customerStreet: string | null;
  customerPostalCode: string | null;
  customerCity: string | null;
  customerCountryCode: string | null;
  customerVatId: string | null;
  customerEmail: string | null;
  supplierSnapshot: unknown;
  finalizedAt: Date | null;
  finalizedById: string | null;
  leitwegId: string | null;
  pdfStoredPath: string | null;
  pdfSha256: string | null;
  zugferdXmlStoredPath: string | null;
  zugferdXmlSha256: string | null;
  xrechnungStoredPath: string | null;
  xrechnungSha256: string | null;
};

type LineRow = {
  id: string;
  tenantId: string;
  invoiceId: string;
  position: number;
  description: string;
  quantity: Prisma.Decimal;
  unit: InvoiceUnit;
  unitPriceCents: number;
  taxRateBasisPoints: number;
  taxCategory: InvoiceTaxCategory;
  netCents: number;
  taxCents: number;
  grossCents: number;
  source: InvoiceLineSource;
  assignmentId: string | null;
};

type CompanyRow = {
  id: string;
  tenantId: string;
  name: string;
  billingName: string | null;
  billingStreet: string | null;
  billingPostalCode: string | null;
  billingCity: string | null;
  billingCountryCode: string;
  vatId: string | null;
  invoiceEmail: string | null;
  leitwegId: string | null;
  eInvoicePreference: EInvoicePreference;
};

type ProfileRow = {
  id: string;
  tenantId: string;
  legalName: string;
  street: string;
  postalCode: string;
  city: string;
  countryCode: string;
  taxNumber: string | null;
  vatId: string | null;
  iban: string;
  bic: string | null;
  bankName: string | null;
  invoiceNumberFormat: string;
  defaultPaymentTermDays: number;
  defaultTaxRateBasisPoints: number;
  smallBusinessRule: boolean;
  invoiceFooterText: string | null;
};

type Store = {
  invoices: InvoiceRow[];
  lines: LineRow[];
  companies: CompanyRow[];
  profiles: ProfileRow[];
  sequences: Array<{ tenantId: string; year: number; lastValue: number }>;
  claims: Array<{ tenantId: string; assignmentId: string; invoiceLineId: string }>;
  auditEvents: Array<Record<string, unknown>>;
  documents: Array<{ storedPath: string; contents: Buffer }>;
};

function matches(row: object, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  const record = row as Record<string, unknown>;
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') {
      return (value as Array<Record<string, unknown>>).every((clause) => matches(row, clause));
    }
    return record[key] === value;
  });
}

function assign(row: object, data: Record<string, unknown>): void {
  Object.assign(row, data);
}

/**
 * In-memory Prisma stand-in. It reuses the production `applyTenantScope` so the tenant
 * isolation assertions exercise the real scoping rules, and it models PostgreSQL row
 * locking (`FOR UPDATE`) plus the atomic sequence upsert so concurrency can be asserted.
 */
function createFakePrisma(store: Store) {
  const rowLocks = new Map<string, Promise<void>>();

  function scope(model: string, operation: string, args: Record<string, unknown>) {
    const tenantId = TenantContext.getTenantId();
    return tenantId ? applyTenantScope(operation, args, tenantId, model) : args;
  }

  function makeClient(releases: Array<() => void>) {
    async function lockRow(key: string): Promise<void> {
      const previous = rowLocks.get(key) ?? Promise.resolve();
      let release: () => void = () => undefined;
      const current = new Promise<void>((resolve) => {
        release = resolve;
      });
      rowLocks.set(key, previous.then(() => current));
      releases.push(release);
      await previous;
    }

    return {
      async $queryRaw(query: Prisma.Sql): Promise<Array<Record<string, unknown>>> {
        if (query.sql.includes('FOR UPDATE')) {
          const [id, tenantId] = query.values as [string, string];
          await lockRow(`Invoice:${id}`);
          return store.invoices
            .filter((invoice) => invoice.id === id && invoice.tenantId === tenantId)
            .map((invoice) => ({ id: invoice.id, status: invoice.status }));
        }
        if (query.sql.includes('InvoiceNumberSequence')) {
          const [, tenantId, year] = query.values as [string, string, number];
          const existing = store.sequences.find(
            (row) => row.tenantId === tenantId && row.year === year,
          );
          if (existing) {
            existing.lastValue += 1;
            return [{ lastValue: existing.lastValue }];
          }
          store.sequences.push({ tenantId, year, lastValue: 1 });
          return [{ lastValue: 1 }];
        }
        throw new Error(`Unexpected raw query: ${query.sql}`);
      },
      invoice: {
        findUnique: async (args: { where: Record<string, unknown> }) => {
          const where = scope('Invoice', 'findUnique', args).where as Record<string, unknown>;
          const found = store.invoices.find((invoice) => matches(invoice, where));
          return found ? { ...found } : null;
        },
        update: async (args: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
          include?: { company?: boolean; lines?: unknown };
        }) => {
          const scoped = scope('Invoice', 'update', args);
          const where = scoped.where as Record<string, unknown>;
          const found = store.invoices.find((invoice) => matches(invoice, where));
          if (!found) throw new Error('Fake invoice.update matched no row');
          assign(found, args.data);
          const result: Record<string, unknown> = { ...found };
          if (args.include?.company) {
            result.company = store.companies.find((company) => company.id === found.companyId);
          }
          if (args.include?.lines) {
            result.lines = store.lines
              .filter((line) => line.invoiceId === found.id)
              .sort((left, right) => left.position - right.position)
              .map((line) => ({ ...line }));
          }
          return result;
        },
      },
      invoiceLine: {
        findMany: async (args: { where: Record<string, unknown> }) => {
          const where = scope('InvoiceLine', 'findMany', args).where as Record<string, unknown>;
          return store.lines
            .filter((line) => matches(line, where))
            .sort((left, right) => left.position - right.position)
            .map((line) => ({ ...line }));
        },
        update: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          const where = scope('InvoiceLine', 'update', args).where as Record<string, unknown>;
          const found = store.lines.find((line) => matches(line, where));
          if (!found) throw new Error('Fake invoiceLine.update matched no row');
          assign(found, args.data);
          return { ...found };
        },
      },
      company: {
        findUnique: async (args: { where: Record<string, unknown> }) => {
          const where = scope('Company', 'findUnique', args).where as Record<string, unknown>;
          const found = store.companies.find((company) => matches(company, where));
          return found ? { ...found } : null;
        },
      },
      tenantBillingProfile: {
        findUnique: async (args: { where: Record<string, unknown> }) => {
          const where = scope('TenantBillingProfile', 'findUnique', args).where as Record<
            string,
            unknown
          >;
          const found = store.profiles.find((profile) => matches(profile, where));
          return found ? { ...found } : null;
        },
      },
      invoiceAssignmentClaim: {
        create: async (args: { data: Record<string, unknown> }) => {
          const data = scope('InvoiceAssignmentClaim', 'create', args).data as Record<
            string,
            unknown
          >;
          const assignmentId = data.assignmentId as string;
          if (store.claims.some((claim) => claim.assignmentId === assignmentId)) {
            throw new Prisma.PrismaClientKnownRequestError(
              'Unique constraint failed on the fields: (`assignmentId`)',
              { code: 'P2002', clientVersion: 'test' },
            );
          }
          const claim = {
            tenantId: data.tenantId as string,
            assignmentId,
            invoiceLineId: data.invoiceLineId as string,
          };
          store.claims.push(claim);
          return claim;
        },
      },
      invoiceAuditEvent: {
        create: async (args: { data: Record<string, unknown> }) => {
          const data = scope('InvoiceAuditEvent', 'create', args).data as Record<string, unknown>;
          store.auditEvents.push(data);
          return data;
        },
      },
    };
  }

  return {
    ...makeClient([]),
    $transaction: async (
      fn: (tx: ReturnType<typeof makeClient>) => Promise<unknown>,
    ): Promise<unknown> => {
      const releases: Array<() => void> = [];
      try {
        return await fn(makeClient(releases));
      } finally {
        for (const release of releases) release();
      }
    },
  };
}

/** Records what finalize wrote instead of touching the disk, keeping the hashing real. */
function createFakeDocumentStorage(store: Store) {
  return {
    buildStoredPath: (fileName: string) => `/uploads/invoice-documents/${fileName}`,
    buildFileName: (invoiceNumber: string, kind: 'rechnung' | 'zugferd' | 'xrechnung') =>
      `${invoiceNumber.replace(/[^A-Za-z0-9._-]+/g, '-')}-${kind}.${kind === 'rechnung' ? 'pdf' : 'xml'}`,
    save: async (storedFileName: string, contents: Uint8Array | string) => {
      const buffer =
        typeof contents === 'string' ? Buffer.from(contents, 'utf8') : Buffer.from(contents);
      const storedPath = `/uploads/invoice-documents/${storedFileName}`;
      store.documents.push({ storedPath, contents: buffer });
      return {
        storedPath,
        sha256: createHash('sha256').update(buffer).digest('hex'),
        byteSize: buffer.byteLength,
      };
    },
    open: async (storedPath: string) => {
      const found = store.documents.find((document) => document.storedPath === storedPath);
      return found ? { stream: Readable.from(found.contents) } : null;
    },
    mimeTypeFor: (storedPath: string) =>
      storedPath.endsWith('.pdf') ? 'application/pdf' : 'application/xml',
  };
}

function createService(store: Store): InvoicingService {
  return new InvoicingService(
    createFakePrisma(store) as unknown as PrismaService,
    { logAction: async () => undefined } as unknown as AuditService,
    createFakeDocumentStorage(store) as unknown as InvoiceDocumentStorageService,
  );
}

function billingProfile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: 'profile-a',
    tenantId: 'tenant-a',
    legalName: 'Fleet Transporte GmbH',
    street: 'Musterstr. 1',
    postalCode: '10115',
    city: 'Berlin',
    countryCode: 'DE',
    taxNumber: '30/123/45678',
    vatId: 'DE123456789',
    iban: 'DE02120300000000202051',
    bic: 'BYLADEM1001',
    bankName: 'Deutsche Kreditbank',
    invoiceNumberFormat: 'RE-{YYYY}-{00001}',
    defaultPaymentTermDays: 14,
    defaultTaxRateBasisPoints: 1_900,
    smallBusinessRule: false,
    invoiceFooterText: null,
    ...overrides,
  };
}

function company(overrides: Partial<CompanyRow> = {}): CompanyRow {
  return {
    id: 'company-a',
    tenantId: 'tenant-a',
    name: 'Acme Logistik GmbH',
    billingName: 'Acme Logistik GmbH – Zentrale',
    billingStreet: 'Hafenstr. 12',
    billingPostalCode: '20457',
    billingCity: 'Hamburg',
    billingCountryCode: 'DE',
    vatId: 'DE987654321',
    invoiceEmail: 'rechnung@acme.example',
    leitwegId: null,
    eInvoicePreference: EInvoicePreference.zugferd,
    ...overrides,
  };
}

function invoice(overrides: Partial<InvoiceRow> = {}): InvoiceRow {
  return {
    id: 'invoice-a',
    tenantId: 'tenant-a',
    companyId: 'company-a',
    status: OutgoingInvoiceStatus.draft,
    number: null,
    invoiceDate: new Date('2026-07-27T00:00:00.000Z'),
    servicePeriodStart: new Date('2026-07-01T00:00:00.000Z'),
    servicePeriodEnd: new Date('2026-07-26T00:00:00.000Z'),
    paymentTermDays: 14,
    dueDate: null,
    currency: 'EUR',
    netCents: 0,
    taxCents: 0,
    grossCents: 0,
    taxBreakdown: null,
    notes: null,
    customerName: null,
    customerStreet: null,
    customerPostalCode: null,
    customerCity: null,
    customerCountryCode: null,
    customerVatId: null,
    customerEmail: null,
    supplierSnapshot: null,
    finalizedAt: null,
    finalizedById: null,
    leitwegId: null,
    pdfStoredPath: null,
    pdfSha256: null,
    zugferdXmlStoredPath: null,
    zugferdXmlSha256: null,
    xrechnungStoredPath: null,
    xrechnungSha256: null,
    ...overrides,
  };
}

function line(overrides: Partial<LineRow> = {}): LineRow {
  const netCents = overrides.netCents ?? 100_000;
  const taxRateBasisPoints = overrides.taxRateBasisPoints ?? 1_900;
  return {
    id: 'line-a',
    tenantId: 'tenant-a',
    invoiceId: 'invoice-a',
    position: 1,
    description: 'Tour Berlin – Hamburg',
    quantity: new Prisma.Decimal('1'),
    unit: InvoiceUnit.tour,
    unitPriceCents: netCents,
    taxRateBasisPoints,
    taxCategory: InvoiceTaxCategory.standard,
    netCents,
    taxCents: Math.round((netCents * taxRateBasisPoints) / 10_000),
    grossCents: netCents + Math.round((netCents * taxRateBasisPoints) / 10_000),
    source: InvoiceLineSource.assignment,
    assignmentId: 'assignment-a',
    ...overrides,
  };
}

function createStore(overrides: Partial<Store> = {}): Store {
  return {
    invoices: [invoice()],
    lines: [line()],
    companies: [company()],
    profiles: [billingProfile()],
    sequences: [],
    claims: [],
    auditEvents: [],
    documents: [],
    ...overrides,
  };
}

describe('InvoicingService finalize', () => {
  it('allocates gapless, unique numbers when two invoices are finalized in parallel', async () => {
    const store = createStore({
      invoices: [invoice({ id: 'invoice-a' }), invoice({ id: 'invoice-b' })],
      lines: [
        line({ id: 'line-a', invoiceId: 'invoice-a', assignmentId: 'assignment-a' }),
        line({ id: 'line-b', invoiceId: 'invoice-b', assignmentId: 'assignment-b' }),
      ],
    });
    const service = createService(store);

    const finalized = await TenantContext.run('tenant-a', () =>
      Promise.all([
        service.finalizeInvoice('invoice-a', 'tenant-a', 'user-a'),
        service.finalizeInvoice('invoice-b', 'tenant-a', 'user-a'),
      ]),
    );

    const numbers = finalized.map((entry) => entry.number).sort();
    assert.deepEqual(numbers, ['RE-2026-00001', 'RE-2026-00002']);
    assert.equal(new Set(numbers).size, 2);
    assert.deepEqual(store.sequences, [{ tenantId: 'tenant-a', year: 2026, lastValue: 2 }]);
  });

  it('lets only one of two parallel finalizations of the same invoice win', async () => {
    const store = createStore();
    const service = createService(store);

    const results = await TenantContext.run('tenant-a', () =>
      Promise.allSettled([
        service.finalizeInvoice('invoice-a', 'tenant-a', 'user-a'),
        service.finalizeInvoice('invoice-a', 'tenant-a', 'user-b'),
      ]),
    );

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.ok(rejected[0].status === 'rejected' && rejected[0].reason instanceof ConflictException);
    assert.equal(rejected[0].status === 'rejected' && rejected[0].reason.message, 'Invoice has already been finalized');

    // The losing attempt must not burn an invoice number.
    assert.deepEqual(store.sequences, [{ tenantId: 'tenant-a', year: 2026, lastValue: 1 }]);
    assert.equal(store.invoices[0].number, 'RE-2026-00001');
    assert.equal(store.claims.length, 1);
  });

  it('rejects a draft update after the invoice has been finalized', async () => {
    const store = createStore();
    const service = createService(store);

    await TenantContext.run('tenant-a', () =>
      service.finalizeInvoice('invoice-a', 'tenant-a', 'user-a'),
    );

    await assert.rejects(
      TenantContext.run('tenant-a', () =>
        service.updateDraft('invoice-a', { notes: 'nachträglich geändert' }, 'user-a'),
      ),
      (error: unknown) =>
        error instanceof ConflictException &&
        error.message === 'Only draft invoices can be changed',
    );
    assert.equal(store.invoices[0].notes, null);
  });

  it('keeps the customer snapshot when the company master data changes afterwards', async () => {
    const store = createStore();
    const service = createService(store);

    const finalized = await TenantContext.run('tenant-a', () =>
      service.finalizeInvoice('invoice-a', 'tenant-a', 'user-a'),
    );
    assert.equal(finalized.customerName, 'Acme Logistik GmbH – Zentrale');
    assert.equal(finalized.customerStreet, 'Hafenstr. 12');
    assert.equal(finalized.customerPostalCode, '20457');
    assert.equal(finalized.customerCity, 'Hamburg');
    assert.equal(finalized.customerCountryCode, 'DE');
    assert.equal(finalized.customerVatId, 'DE987654321');
    assert.equal(finalized.customerEmail, 'rechnung@acme.example');

    store.companies[0].billingName = 'Umbenannt Spedition GmbH';
    store.companies[0].name = 'Umbenannt Spedition GmbH';
    store.companies[0].billingStreet = 'Neue Str. 99';
    store.companies[0].vatId = 'DE000000000';

    assert.equal(store.invoices[0].customerName, 'Acme Logistik GmbH – Zentrale');
    assert.equal(store.invoices[0].customerStreet, 'Hafenstr. 12');
    assert.equal(store.invoices[0].customerVatId, 'DE987654321');
  });

  it('snapshots the billing profile and derives the due date from the payment term', async () => {
    const store = createStore({ invoices: [invoice({ paymentTermDays: 30 })] });
    const service = createService(store);

    const finalized = await TenantContext.run('tenant-a', () =>
      service.finalizeInvoice('invoice-a', 'tenant-a', 'user-a'),
    );

    assert.equal(finalized.status, OutgoingInvoiceStatus.finalized);
    assert.equal(finalized.dueDate?.toISOString(), '2026-08-26T00:00:00.000Z');
    assert.equal(finalized.finalizedById, 'user-a');
    assert.deepEqual(finalized.supplierSnapshot, {
      legalName: 'Fleet Transporte GmbH',
      street: 'Musterstr. 1',
      postalCode: '10115',
      city: 'Berlin',
      countryCode: 'DE',
      taxNumber: '30/123/45678',
      vatId: 'DE123456789',
      iban: 'DE02120300000000202051',
      bic: 'BYLADEM1001',
      bankName: 'Deutsche Kreditbank',
      invoiceNumberFormat: 'RE-{YYYY}-{00001}',
      defaultPaymentTermDays: 14,
      defaultTaxRateBasisPoints: 1_900,
      smallBusinessRule: false,
      invoiceFooterText: null,
    });

    store.profiles[0].legalName = 'Fleet Transporte GmbH & Co. KG';
    assert.deepEqual(
      (store.invoices[0].supplierSnapshot as Record<string, unknown>).legalName,
      'Fleet Transporte GmbH',
    );

    const auditEvent = store.auditEvents[store.auditEvents.length - 1];
    assert.equal(auditEvent?.action, 'finalized');
    assert.equal(auditEvent?.actorUserId, 'user-a');
    const snapshot = auditEvent?.snapshot as {
      before: Record<string, unknown>;
      after: Record<string, unknown>;
    };
    assert.equal(snapshot.before.status, OutgoingInvoiceStatus.draft);
    assert.equal(snapshot.before.number, null);
    assert.equal(snapshot.after.status, OutgoingInvoiceStatus.finalized);
    assert.equal(snapshot.after.number, 'RE-2026-00001');
  });

  it('recomputes the totals of a mixed 19% and 7% invoice', async () => {
    const store = createStore({
      lines: [
        line({
          id: 'line-a',
          position: 1,
          netCents: 100_000,
          taxRateBasisPoints: 1_900,
          taxCategory: InvoiceTaxCategory.standard,
        }),
        line({
          id: 'line-b',
          position: 2,
          netCents: 50_000,
          taxRateBasisPoints: 700,
          taxCategory: InvoiceTaxCategory.reduced,
          source: InvoiceLineSource.manual,
          assignmentId: null,
          // Deliberately wrong client-side totals: finalizing must overwrite them.
          taxCents: 1,
          grossCents: 1,
        }),
      ],
    });
    const service = createService(store);

    const finalized = await TenantContext.run('tenant-a', () =>
      service.finalizeInvoice('invoice-a', 'tenant-a', 'user-a'),
    );

    assert.equal(finalized.netCents, 150_000);
    assert.equal(finalized.taxCents, 22_500);
    assert.equal(finalized.grossCents, 172_500);
    assert.deepEqual(finalized.taxBreakdown, [
      {
        taxCategory: InvoiceTaxCategory.standard,
        taxRateBasisPoints: 1_900,
        netCents: 100_000,
        taxCents: 19_000,
        grossCents: 119_000,
      },
      {
        taxCategory: InvoiceTaxCategory.reduced,
        taxRateBasisPoints: 700,
        netCents: 50_000,
        taxCents: 3_500,
        grossCents: 53_500,
      },
    ]);
    assert.equal(store.lines[1].taxCents, 3_500);
    assert.equal(store.lines[1].grossCents, 53_500);
  });

  it('applies the §19 UStG small business rule and adds the mandatory note', async () => {
    const store = createStore({
      profiles: [billingProfile({ smallBusinessRule: true })],
      invoices: [invoice({ notes: 'Vielen Dank für Ihren Auftrag.' })],
      lines: [
        line({ id: 'line-a', position: 1, netCents: 100_000, taxRateBasisPoints: 1_900 }),
        line({
          id: 'line-b',
          position: 2,
          netCents: 50_000,
          taxRateBasisPoints: 700,
          taxCategory: InvoiceTaxCategory.reduced,
          source: InvoiceLineSource.manual,
          assignmentId: null,
        }),
      ],
    });
    const service = createService(store);

    const finalized = await TenantContext.run('tenant-a', () =>
      service.finalizeInvoice('invoice-a', 'tenant-a', 'user-a'),
    );

    assert.equal(finalized.netCents, 150_000);
    assert.equal(finalized.taxCents, 0);
    assert.equal(finalized.grossCents, 150_000);
    assert.deepEqual(finalized.taxBreakdown, [
      {
        taxCategory: InvoiceTaxCategory.exempt,
        taxRateBasisPoints: 0,
        netCents: 150_000,
        taxCents: 0,
        grossCents: 150_000,
      },
    ]);
    for (const stored of store.lines) {
      assert.equal(stored.taxCategory, InvoiceTaxCategory.exempt);
      assert.equal(stored.taxRateBasisPoints, 0);
      assert.equal(stored.taxCents, 0);
      assert.equal(stored.grossCents, stored.netCents);
    }
    assert.equal(
      finalized.notes,
      'Vielen Dank für Ihren Auftrag.\nGemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).',
    );
  });

  it('does not let one tenant finalize another tenant invoice', async () => {
    const store = createStore({
      invoices: [invoice({ id: 'invoice-b', tenantId: 'tenant-b', companyId: 'company-b' })],
      lines: [line({ id: 'line-b', tenantId: 'tenant-b', invoiceId: 'invoice-b' })],
      companies: [company({ id: 'company-b', tenantId: 'tenant-b' })],
      profiles: [billingProfile({ id: 'profile-b', tenantId: 'tenant-b' })],
    });
    const service = createService(store);

    await assert.rejects(
      TenantContext.run('tenant-a', () =>
        service.finalizeInvoice('invoice-b', 'tenant-a', 'user-a'),
      ),
      (error: unknown) =>
        error instanceof NotFoundException && error.message === 'Invoice not found',
    );

    assert.equal(store.invoices[0].status, OutgoingInvoiceStatus.draft);
    assert.equal(store.invoices[0].number, null);
    assert.deepEqual(store.sequences, []);
    assert.deepEqual(store.auditEvents, []);
  });

  it('refuses to finalize without a billing profile or without lines', async () => {
    const withoutProfile = createStore({ profiles: [] });
    await assert.rejects(
      TenantContext.run('tenant-a', () =>
        createService(withoutProfile).finalizeInvoice('invoice-a', 'tenant-a', 'user-a'),
      ),
      (error: unknown) =>
        error instanceof BadRequestException &&
        error.message === 'A billing profile is required before finalizing',
    );

    const withoutLines = createStore({ lines: [] });
    await assert.rejects(
      TenantContext.run('tenant-a', () =>
        createService(withoutLines).finalizeInvoice('invoice-a', 'tenant-a', 'user-a'),
      ),
      (error: unknown) =>
        error instanceof BadRequestException &&
        error.message === 'An invoice needs at least one line before it can be finalized',
    );

    assert.deepEqual(withoutProfile.sequences, []);
    assert.deepEqual(withoutLines.sequences, []);
  });

  it('refuses to finalize an assignment that another invoice already claimed', async () => {
    const store = createStore({
      claims: [
        { tenantId: 'tenant-a', assignmentId: 'assignment-a', invoiceLineId: 'line-older' },
      ],
    });
    const service = createService(store);

    await assert.rejects(
      TenantContext.run('tenant-a', () =>
        service.finalizeInvoice('invoice-a', 'tenant-a', 'user-a'),
      ),
      (error: unknown) =>
        error instanceof ConflictException &&
        error.message ===
          'An assignment on this invoice has already been finalized on another invoice',
    );
  });
});

describe('InvoicingService finalize document generation', () => {
  async function collect(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  function storedAt(store: Store, path: string | null): Buffer {
    const found = store.documents.find((document) => document.storedPath === path);
    assert.ok(found, `expected a stored document at ${path}`);
    return found.contents;
  }

  it('stores a PDF and a ZUGFeRD XML for a zugferd customer', async () => {
    const store = createStore();
    const service = createService(store);

    const finalized = await TenantContext.run('tenant-a', () =>
      service.finalizeInvoice('invoice-a', 'tenant-a', 'user-a'),
    );

    assert.equal(store.documents.length, 2);
    assert.equal(finalized.pdfStoredPath, '/uploads/invoice-documents/RE-2026-00001-rechnung.pdf');
    assert.equal(
      finalized.zugferdXmlStoredPath,
      '/uploads/invoice-documents/RE-2026-00001-zugferd.xml',
    );
    assert.equal(finalized.xrechnungStoredPath, null);
    assert.equal(finalized.xrechnungSha256, null);

    // The persisted hashes must match the bytes that were actually written.
    assert.equal(
      finalized.pdfSha256,
      createHash('sha256').update(storedAt(store, finalized.pdfStoredPath)).digest('hex'),
    );
    assert.equal(
      finalized.zugferdXmlSha256,
      createHash('sha256').update(storedAt(store, finalized.zugferdXmlStoredPath)).digest('hex'),
    );

    const xml = storedAt(store, finalized.zugferdXmlStoredPath).toString('utf8');
    assert.ok(xml.includes('<rsm:CrossIndustryInvoice'));
    assert.ok(xml.includes('<ram:ID>RE-2026-00001</ram:ID>'));
    assert.ok(xml.includes('<ram:Name>Acme Logistik GmbH – Zentrale</ram:Name>'));
    assert.ok(storedAt(store, finalized.pdfStoredPath).subarray(0, 5).toString('latin1') === '%PDF-');
  });

  it('stores an XRechnung UBL for a public-sector customer', async () => {
    const store = createStore({
      companies: [
        company({
          eInvoicePreference: EInvoicePreference.xrechnung,
          leitwegId: '991-33333TEST-33',
        }),
      ],
    });
    const service = createService(store);

    const finalized = await TenantContext.run('tenant-a', () =>
      service.finalizeInvoice('invoice-a', 'tenant-a', 'user-a'),
    );

    assert.equal(store.documents.length, 2);
    assert.equal(finalized.zugferdXmlStoredPath, null);
    assert.equal(
      finalized.xrechnungStoredPath,
      '/uploads/invoice-documents/RE-2026-00001-xrechnung.xml',
    );
    // The Leitweg-ID is snapshotted onto the invoice, not read live at render time.
    assert.equal(finalized.leitwegId, '991-33333TEST-33');

    const xml = storedAt(store, finalized.xrechnungStoredPath).toString('utf8');
    assert.ok(xml.includes('urn:xoev-de:kosit:standard:xrechnung_3.0'));
    assert.ok(xml.includes('<cbc:BuyerReference>991-33333TEST-33</cbc:BuyerReference>'));
  });

  it('stores all three documents when the customer wants both formats', async () => {
    const store = createStore({
      companies: [
        company({
          eInvoicePreference: EInvoicePreference.both,
          leitwegId: '991-33333TEST-33',
        }),
      ],
    });
    const service = createService(store);

    const finalized = await TenantContext.run('tenant-a', () =>
      service.finalizeInvoice('invoice-a', 'tenant-a', 'user-a'),
    );

    assert.equal(store.documents.length, 3);
    assert.ok(finalized.pdfStoredPath);
    assert.ok(finalized.zugferdXmlStoredPath);
    assert.ok(finalized.xrechnungStoredPath);
  });

  it('refuses to finalize an XRechnung customer without a Leitweg-ID', async () => {
    const store = createStore({
      companies: [company({ eInvoicePreference: EInvoicePreference.xrechnung, leitwegId: null })],
    });
    const service = createService(store);

    await assert.rejects(
      TenantContext.run('tenant-a', () => service.finalizeInvoice('invoice-a', 'tenant-a', 'user-a')),
      (error: unknown) =>
        error instanceof BadRequestException &&
        error.message ===
          'A Leitweg-ID is required on the customer before an XRechnung invoice can be finalized',
    );

    // No number burned, no invoice touched, no half-written documents left behind.
    assert.deepEqual(store.sequences, []);
    assert.deepEqual(store.documents, []);
    assert.equal(store.invoices[0].status, OutgoingInvoiceStatus.draft);
  });

  it('records the document hashes on the finalize audit event', async () => {
    const store = createStore();
    const service = createService(store);

    const finalized = await TenantContext.run('tenant-a', () =>
      service.finalizeInvoice('invoice-a', 'tenant-a', 'user-a'),
    );

    const event = store.auditEvents[store.auditEvents.length - 1];
    const snapshot = event.snapshot as { after: Record<string, unknown> };
    assert.equal(snapshot.after.pdfSha256, finalized.pdfSha256);
    assert.equal(snapshot.after.zugferdXmlSha256, finalized.zugferdXmlSha256);
    assert.equal(snapshot.after.xrechnungXmlSha256 ?? null, null);
  });

  it('serves the stored bytes on download instead of rendering again', async () => {
    const store = createStore();
    const service = createService(store);

    const finalized = await TenantContext.run('tenant-a', () =>
      service.finalizeInvoice('invoice-a', 'tenant-a', 'user-a'),
    );
    const documentsAfterFinalize = store.documents.length;

    const pdf = await TenantContext.run('tenant-a', () =>
      service.downloadInvoiceDocument('invoice-a', 'pdf'),
    );
    assert.equal(pdf.fileName, 'RE-2026-00001.pdf');
    assert.equal(pdf.mimeType, 'application/pdf');
    assert.deepEqual(await collect(pdf.stream), storedAt(store, finalized.pdfStoredPath));

    const xml = await TenantContext.run('tenant-a', () =>
      service.downloadInvoiceDocument('invoice-a', 'xml'),
    );
    assert.equal(xml.fileName, 'RE-2026-00001.xml');
    assert.deepEqual(await collect(xml.stream), storedAt(store, finalized.zugferdXmlStoredPath));

    // Nothing was re-rendered or re-stored by serving the files.
    assert.equal(store.documents.length, documentsAfterFinalize);
  });

  it('rejects an unknown xml format and reports a missing document', async () => {
    const store = createStore();
    const service = createService(store);
    await TenantContext.run('tenant-a', () =>
      service.finalizeInvoice('invoice-a', 'tenant-a', 'user-a'),
    );

    await assert.rejects(
      TenantContext.run('tenant-a', () =>
        service.downloadInvoiceDocument('invoice-a', 'xml', 'peppol'),
      ),
      (error: unknown) =>
        error instanceof BadRequestException &&
        error.message === 'format must be either zugferd or xrechnung',
    );

    await assert.rejects(
      TenantContext.run('tenant-a', () =>
        service.downloadInvoiceDocument('invoice-a', 'xml', 'xrechnung'),
      ),
      (error: unknown) =>
        error instanceof NotFoundException &&
        error.message === 'The requested invoice document does not exist',
    );
  });

  it('has no documents to serve while the invoice is still a draft', async () => {
    const store = createStore();
    const service = createService(store);

    await assert.rejects(
      TenantContext.run('tenant-a', () => service.downloadInvoiceDocument('invoice-a', 'pdf')),
      (error: unknown) =>
        error instanceof ConflictException &&
        error.message === 'Draft invoices have no legal documents yet',
    );
  });
});
