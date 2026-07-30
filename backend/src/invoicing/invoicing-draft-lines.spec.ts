import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  InvoiceLineSource,
  InvoiceTaxCategory,
  InvoiceUnit,
  OutgoingInvoiceStatus,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { DatevExportStorageService } from '../storage/datev-export-storage.service';
import { InvoiceDocumentStorageService } from '../storage/invoice-document-storage.service';
import { TenantContext } from '../tenant/tenant-context';
import { InvoicingService } from './invoicing.service';

type InvoiceRow = {
  id: string;
  tenantId: string;
  companyId: string;
  status: OutgoingInvoiceStatus;
  netCents: number;
  taxCents: number;
  grossCents: number;
  taxBreakdown: unknown;
};

type LineRow = {
  id: string;
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
  serviceDate: Date | null;
};

type Store = {
  invoices: InvoiceRow[];
  lines: LineRow[];
  auditEvents: Array<Record<string, unknown>>;
};

function lastAuditAction(store: Store): unknown {
  return store.auditEvents[store.auditEvents.length - 1]?.action;
}

function matches(row: object, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  const record = row as Record<string, unknown>;
  return Object.entries(where).every(([key, value]) => record[key] === value);
}

function createFakePrisma(store: Store) {
  const client = {
    invoice: {
      findUnique: async (args: { where: Record<string, unknown> }) => {
        const found = store.invoices.find((row) => matches(row, args.where));
        if (!found) return null;
        return {
          ...found,
          lines: [...store.lines]
            .filter((line) => line.invoiceId === found.id)
            .sort((left, right) => left.position - right.position),
        };
      },
      update: async (args: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
        include?: Record<string, unknown>;
      }) => {
        const found = store.invoices.find((row) => matches(row, args.where));
        if (!found) throw new Error('Fake invoice.update matched no row');
        Object.assign(found, args.data);

        const result: Record<string, unknown> = { ...found };
        if (args.include?.company) result.company = { id: found.companyId, name: 'Acme' };
        if (args.include?.lines) {
          result.lines = [...store.lines]
            .filter((line) => line.invoiceId === found.id)
            .sort((left, right) => left.position - right.position);
        }
        return result;
      },
    },
    invoiceLine: {
      findMany: async (args: { where: Record<string, unknown> }) =>
        [...store.lines]
          .filter((line) => matches(line, args.where))
          .sort((left, right) => left.position - right.position)
          .map((line) => ({ ...line })),
      create: async (args: { data: Record<string, unknown> }) => {
        const { invoice, ...rest } = args.data as Record<string, unknown> & {
          invoice: { connect: { id: string } };
        };
        const row = {
          ...(rest as Omit<LineRow, 'id' | 'invoiceId'>),
          id: `line-${store.lines.length + 1}`,
          invoiceId: invoice.connect.id,
        } as LineRow;
        store.lines.push(row);
        return row;
      },
      update: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const found = store.lines.find((line) => matches(line, args.where));
        if (!found) throw new Error('Fake invoiceLine.update matched no row');
        Object.assign(found, args.data);
        return { ...found };
      },
      delete: async (args: { where: Record<string, unknown> }) => {
        const index = store.lines.findIndex((line) => matches(line, args.where));
        if (index < 0) throw new Error('Fake invoiceLine.delete matched no row');
        const [removed] = store.lines.splice(index, 1);
        return removed;
      },
    },
    invoiceAuditEvent: {
      create: async (args: { data: Record<string, unknown> }) => {
        store.auditEvents.push(args.data);
        return args.data;
      },
    },
  };

  return {
    ...client,
    $transaction: async (fn: (tx: typeof client) => Promise<unknown>): Promise<unknown> =>
      fn(client),
  };
}

function createService(store: Store): InvoicingService {
  return new InvoicingService(
    createFakePrisma(store) as unknown as PrismaService,
    { logAction: async () => undefined } as unknown as AuditService,
    {} as unknown as InvoiceDocumentStorageService,
    {} as unknown as DatevExportStorageService,
    {} as unknown as MailService,
  );
}

function line(overrides: Partial<LineRow> = {}): LineRow {
  return {
    id: 'line-1',
    invoiceId: 'invoice-a',
    position: 1,
    description: 'Tour Berlin',
    quantity: new Prisma.Decimal('1.000'),
    unit: InvoiceUnit.tour,
    unitPriceCents: 10_000,
    taxRateBasisPoints: 1_900,
    taxCategory: InvoiceTaxCategory.standard,
    netCents: 10_000,
    taxCents: 1_900,
    grossCents: 11_900,
    source: InvoiceLineSource.manual,
    serviceDate: null,
    ...overrides,
  };
}

function store(overrides: Partial<Store> = {}): Store {
  return {
    invoices: [
      {
        id: 'invoice-a',
        tenantId: 'tenant-a',
        companyId: 'company-a',
        status: OutgoingInvoiceStatus.draft,
        netCents: 10_000,
        taxCents: 1_900,
        grossCents: 11_900,
        taxBreakdown: [],
      },
    ],
    lines: [line()],
    auditEvents: [],
    ...overrides,
  };
}

describe('InvoicingService draft lines', () => {
  it('adds a line and recalculates the stored totals', async () => {
    const memory = store();
    const service = createService(memory);

    const result = await TenantContext.run('tenant-a', () =>
      service.addDraftLine(
        'invoice-a',
        {
          description: 'Zusatzstunden',
          quantity: '2.5',
          unit: InvoiceUnit.hour,
          unitPriceCents: 4_000,
          taxRateBasisPoints: 1_900,
          taxCategory: InvoiceTaxCategory.standard,
        },
        'user-a',
      ),
    );

    assert.equal(memory.lines.length, 2);
    assert.equal(result.netCents, 20_000);
    assert.equal(result.taxCents, 3_800);
    assert.equal(result.grossCents, 23_800);
    assert.equal(memory.lines[1].position, 2);
    assert.equal(lastAuditAction(memory), 'draft.line_added');
  });

  it('updates a line and rewrites net, tax and gross', async () => {
    const memory = store();
    const service = createService(memory);

    const result = await TenantContext.run('tenant-a', () =>
      service.updateDraftLine('invoice-a', 'line-1', { unitPriceCents: 20_000 }, 'user-a'),
    );

    assert.equal(memory.lines[0].unitPriceCents, 20_000);
    assert.equal(result.netCents, 20_000);
    assert.equal(result.taxCents, 3_800);
    assert.equal(result.grossCents, 23_800);
    assert.equal(lastAuditAction(memory), 'draft.line_updated');
  });

  it('removes a line and renumbers the remaining positions', async () => {
    const memory = store({
      lines: [line(), line({ id: 'line-2', position: 2, unitPriceCents: 5_000 })],
    });
    const service = createService(memory);

    const result = await TenantContext.run('tenant-a', () =>
      service.deleteDraftLine('invoice-a', 'line-1', 'user-a'),
    );

    assert.equal(memory.lines.length, 1);
    assert.equal(memory.lines[0].id, 'line-2');
    assert.equal(memory.lines[0].position, 1);
    assert.equal(result.netCents, 5_000);
    assert.equal(lastAuditAction(memory), 'draft.line_removed');
  });

  it('refuses to delete the last remaining line', async () => {
    const service = createService(store());

    await assert.rejects(
      TenantContext.run('tenant-a', () => service.deleteDraftLine('invoice-a', 'line-1', 'user-a')),
      (error: unknown) =>
        error instanceof BadRequestException &&
        error.message === 'An invoice must keep at least one line',
    );
  });

  it('refuses line changes once the invoice left draft', async () => {
    const memory = store();
    memory.invoices[0].status = OutgoingInvoiceStatus.finalized;
    const service = createService(memory);

    await assert.rejects(
      TenantContext.run('tenant-a', () =>
        service.updateDraftLine('invoice-a', 'line-1', { unitPriceCents: 1 }, 'user-a'),
      ),
      (error: unknown) =>
        error instanceof ConflictException &&
        error.message === 'Only draft invoices can be changed',
    );
  });

  it('rejects an unknown line id', async () => {
    const service = createService(store());

    await assert.rejects(
      TenantContext.run('tenant-a', () =>
        service.updateDraftLine('invoice-a', 'line-404', { unitPriceCents: 1 }, 'user-a'),
      ),
      (error: unknown) => error instanceof NotFoundException,
    );
  });

  it('rejects a tax rate that contradicts the tax category', async () => {
    const service = createService(store());

    await assert.rejects(
      TenantContext.run('tenant-a', () =>
        service.updateDraftLine(
          'invoice-a',
          'line-1',
          { taxCategory: InvoiceTaxCategory.exempt, taxRateBasisPoints: 1_900 },
          'user-a',
        ),
      ),
      (error: unknown) => error instanceof RangeError || error instanceof BadRequestException,
    );
  });
});
