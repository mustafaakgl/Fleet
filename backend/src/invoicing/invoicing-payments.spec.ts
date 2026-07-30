import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { InvoicePaymentMethod, OutgoingInvoiceStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
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
  grossCents: number;
  paidCents: number;
  paidAt: Date | null;
  finalizedAt: Date | null;
  sentAt: Date | null;
};

type PaymentRow = {
  id: string;
  tenantId: string;
  invoiceId: string;
  amountCents: number;
  paidAt: Date;
  method: InvoicePaymentMethod;
  reference: string | null;
  note: string | null;
  recordedById: string;
  createdAt: Date;
};

type Store = {
  invoices: InvoiceRow[];
  payments: PaymentRow[];
  auditEvents: Array<Record<string, unknown>>;
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

function createFakePrisma(store: Store) {
  function scope(model: string, operation: string, args: Record<string, unknown>) {
    const tenantId = TenantContext.getTenantId();
    return tenantId ? applyTenantScope(operation, args, tenantId, model) : args;
  }

  const client = {
    invoice: {
      findFirst: async (args: {
        where: Record<string, unknown>;
        select?: Record<string, unknown>;
        include?: Record<string, unknown>;
      }) => {
        const where = scope('Invoice', 'findFirst', args).where as Record<string, unknown>;
        const found = store.invoices.find((invoice) => matches(invoice, where));
        if (!found) return null;

        if (!args.include && !args.select) return { ...found };

        const result: Record<string, unknown> = { ...found };
        if (args.include?.company) result.company = { id: found.companyId, name: 'Acme' };
        if (args.include?.lines) result.lines = [];
        if (args.include?.payments) {
          result.payments = [...store.payments]
            .filter((payment) => payment.invoiceId === found.id)
            .sort((left, right) => right.paidAt.getTime() - left.paidAt.getTime());
        }
        if (args.include?.deliveryAttempts) result.deliveryAttempts = [];
        if (args.include?.dunningNotices) result.dunningNotices = [];
        if (args.include?.auditEvents) result.auditEvents = [...store.auditEvents];
        return result;
      },
      findUnique: async (args: {
        where: Record<string, unknown>;
        select?: Record<string, unknown>;
        include?: Record<string, unknown>;
      }) => {
        const where = scope('Invoice', 'findUnique', args).where as Record<string, unknown>;
        const found = store.invoices.find((invoice) => matches(invoice, where));
        if (!found) return null;

        if (!args.include && !args.select) return { ...found };

        const result: Record<string, unknown> = { ...found };
        if (args.include?.company) result.company = { id: found.companyId, name: 'Acme' };
        if (args.include?.lines) result.lines = [];
        if (args.include?.payments) {
          result.payments = [...store.payments]
            .filter((payment) => payment.invoiceId === found.id)
            .sort((left, right) => right.paidAt.getTime() - left.paidAt.getTime());
        }
        if (args.include?.deliveryAttempts) result.deliveryAttempts = [];
        if (args.include?.dunningNotices) result.dunningNotices = [];
        if (args.include?.auditEvents) result.auditEvents = [...store.auditEvents];
        return result;
      },
      update: async (args: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
        include?: Record<string, unknown>;
      }) => {
        const where = scope('Invoice', 'update', args).where as Record<string, unknown>;
        const found = store.invoices.find((invoice) => matches(invoice, where));
        if (!found) throw new Error('Fake invoice.update matched no row');
        Object.assign(found, args.data);

        const result: Record<string, unknown> = { ...found };
        if (args.include?.company) result.company = { id: found.companyId, name: 'Acme' };
        if (args.include?.lines) result.lines = [];
        if (args.include?.payments) {
          result.payments = [...store.payments]
            .filter((payment) => payment.invoiceId === found.id)
            .sort((left, right) => right.paidAt.getTime() - left.paidAt.getTime());
        }
        return result;
      },
    },
    invoicePayment: {
      findFirst: async (args: { where: Record<string, unknown>; include?: Record<string, unknown> }) => {
        const where = scope('InvoicePayment', 'findFirst', args).where as Record<string, unknown>;
        const found = store.payments.find((payment) => matches(payment, where));
        if (!found) return null;

        const result: Record<string, unknown> = { ...found };
        if (args.include?.invoice) {
          result.invoice = store.invoices.find((invoice) => invoice.id === found.invoiceId);
        }
        return result;
      },
      create: async (args: { data: Record<string, unknown> }) => {
        const data = scope('InvoicePayment', 'create', args).data as Omit<PaymentRow, 'id' | 'createdAt'>;
        const row: PaymentRow = {
          ...data,
          id: `payment-${store.payments.length + 1}`,
          createdAt: new Date('2026-07-30T10:00:00.000Z'),
        };
        store.payments.push(row);
        return row;
      },
      findUnique: async (args: { where: Record<string, unknown>; include?: Record<string, unknown> }) => {
        const where = scope('InvoicePayment', 'findUnique', args).where as Record<string, unknown>;
        const found = store.payments.find((payment) => matches(payment, where));
        if (!found) return null;

        const result: Record<string, unknown> = { ...found };
        if (args.include?.invoice) {
          result.invoice = store.invoices.find((invoice) => invoice.id === found.invoiceId);
        }
        return result;
      },
      delete: async (args: { where: Record<string, unknown> }) => {
        const where = scope('InvoicePayment', 'delete', args).where as Record<string, unknown>;
        const index = store.payments.findIndex((payment) => matches(payment, where));
        if (index < 0) throw new Error('Fake invoicePayment.delete matched no row');
        const [removed] = store.payments.splice(index, 1);
        return removed;
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
    {} as unknown as MailService,
  );
}

function invoice(overrides: Partial<InvoiceRow> = {}): InvoiceRow {
  return {
    id: 'invoice-a',
    tenantId: 'tenant-a',
    companyId: 'company-a',
    status: OutgoingInvoiceStatus.sent,
    number: 'RE-2026-00001',
    grossCents: 10_000,
    paidCents: 0,
    paidAt: null,
    finalizedAt: new Date('2026-07-20T00:00:00.000Z'),
    sentAt: new Date('2026-07-21T00:00:00.000Z'),
    ...overrides,
  };
}

function payment(overrides: Partial<PaymentRow> = {}): PaymentRow {
  return {
    id: 'payment-1',
    tenantId: 'tenant-a',
    invoiceId: 'invoice-a',
    amountCents: 6_000,
    paidAt: new Date('2026-07-29T08:00:00.000Z'),
    method: InvoicePaymentMethod.bank_transfer,
    reference: 'REF-1',
    note: null,
    recordedById: 'user-a',
    createdAt: new Date('2026-07-29T08:00:00.000Z'),
    ...overrides,
  };
}

function store(overrides: Partial<Store> = {}): Store {
  return {
    invoices: [invoice()],
    payments: [],
    auditEvents: [],
    ...overrides,
  };
}

describe('InvoicingService payments', () => {
  it('marks invoice partially_paid after a partial payment', async () => {
    const memory = store();
    const service = createService(memory);

    const result = await TenantContext.run('tenant-a', () =>
      service.recordPayment('invoice-a', 'tenant-a', 'user-a', {
        amountCents: 3_000,
        paidAt: '2026-07-30T08:00:00.000Z',
        method: InvoicePaymentMethod.bank_transfer,
        reference: 'BANK-1',
      }),
    );

    assert.equal(result.invoice.paidCents, 3_000);
    assert.equal(result.invoice.status, OutgoingInvoiceStatus.partially_paid);
    assert.equal(memory.payments.length, 1);
    assert.equal(memory.auditEvents[memory.auditEvents.length - 1].action, 'payment.recorded');
  });

  it('marks invoice paid when total reaches gross amount', async () => {
    const memory = store();
    const service = createService(memory);

    const result = await TenantContext.run('tenant-a', () =>
      service.recordPayment('invoice-a', 'tenant-a', 'user-a', {
        amountCents: 10_000,
        paidAt: '2026-07-30T09:00:00.000Z',
        method: InvoicePaymentMethod.cash,
      }),
    );

    assert.equal(result.invoice.paidCents, 10_000);
    assert.equal(result.invoice.status, OutgoingInvoiceStatus.paid);
    assert.ok(result.invoice.paidAt instanceof Date);
  });

  it('rejects overpayment with a clear message', async () => {
    const memory = store({ invoices: [invoice({ paidCents: 9_500, status: OutgoingInvoiceStatus.partially_paid })] });
    const service = createService(memory);

    await assert.rejects(
      TenantContext.run('tenant-a', () =>
        service.recordPayment('invoice-a', 'tenant-a', 'user-a', {
          amountCents: 1_000,
          paidAt: '2026-07-30T10:00:00.000Z',
          method: InvoicePaymentMethod.other,
        }),
      ),
      (error: unknown) =>
        error instanceof BadRequestException &&
        error.message === 'Payment exceeds the open amount (500 cents remaining)',
    );
  });

  it('rejects payment on draft invoice', async () => {
    const memory = store({ invoices: [invoice({ status: OutgoingInvoiceStatus.draft })] });
    const service = createService(memory);

    await assert.rejects(
      TenantContext.run('tenant-a', () =>
        service.recordPayment('invoice-a', 'tenant-a', 'user-a', {
          amountCents: 1_000,
          paidAt: '2026-07-30T11:00:00.000Z',
          method: InvoicePaymentMethod.bank_transfer,
        }),
      ),
      (error: unknown) =>
        error instanceof ConflictException && error.message === 'Draft invoices cannot be paid',
    );
  });

  it('rejects payment on cancelled invoice', async () => {
    const memory = store({ invoices: [invoice({ status: OutgoingInvoiceStatus.cancelled })] });
    const service = createService(memory);

    await assert.rejects(
      TenantContext.run('tenant-a', () =>
        service.recordPayment('invoice-a', 'tenant-a', 'user-a', {
          amountCents: 1_000,
          paidAt: '2026-07-30T11:30:00.000Z',
          method: InvoicePaymentMethod.bank_transfer,
        }),
      ),
      (error: unknown) =>
        error instanceof ConflictException &&
        error.message === 'Cancelled invoices cannot be paid',
    );
  });

  it('recalculates paidCents and restores sent status when payment is deleted', async () => {
    const memory = store({
      invoices: [invoice({ status: OutgoingInvoiceStatus.partially_paid, paidCents: 6_000 })],
      payments: [payment()],
    });
    const service = createService(memory);

    const result = await TenantContext.run('tenant-a', () =>
      service.deletePayment('payment-1', 'tenant-a', 'user-a'),
    );

    assert.equal(result.invoice.paidCents, 0);
    assert.equal(result.invoice.status, OutgoingInvoiceStatus.sent);
    assert.equal(memory.payments.length, 0);
    assert.equal(memory.auditEvents[memory.auditEvents.length - 1].action, 'payment.deleted');
  });

  it('returns invoice payment history from getInvoice', async () => {
    const memory = store({
      payments: [
        payment({ id: 'payment-1', paidAt: new Date('2026-07-29T08:00:00.000Z') }),
        payment({ id: 'payment-2', paidAt: new Date('2026-07-30T08:00:00.000Z'), amountCents: 4_000 }),
      ],
    });
    const service = createService(memory);

    const result = await TenantContext.run('tenant-a', () => service.getInvoice('invoice-a'));

    assert.equal(result.payments.length, 2);
    assert.equal(result.payments[0].id, 'payment-2');
    assert.equal(result.payments[1].id, 'payment-1');
  });

  it('enforces tenant isolation for payment recording', async () => {
    const memory = store();
    const service = createService(memory);

    await assert.rejects(
      TenantContext.run('tenant-b', () =>
        service.recordPayment('invoice-a', 'tenant-b', 'user-b', {
          amountCents: 1_000,
          paidAt: '2026-07-30T12:00:00.000Z',
          method: InvoicePaymentMethod.other,
        }),
      ),
      (error: unknown) => error instanceof NotFoundException && error.message === 'Invoice not found',
    );

    assert.equal(memory.payments.length, 0);
  });
});
