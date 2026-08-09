import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { describe, it } from 'node:test';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EInvoicePreference, InvoiceLineSource, OutgoingInvoiceStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { MailService, type SendMailParams } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { DatevExportStorageService } from '../storage/datev-export-storage.service';
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
  dueDate: Date | null;
  currency: string;
  netCents: number;
  taxCents: number;
  grossCents: number;
  notes: string | null;
  customerName: string | null;
  customerEmail: string | null;
  supplierSnapshot: Record<string, unknown> | null;
  sentAt: Date | null;
  pdfStoredPath: string | null;
  zugferdXmlStoredPath: string | null;
  xrechnungStoredPath: string | null;
};

type CompanyRow = {
  id: string;
  tenantId: string;
  name: string;
  invoiceEmail: string | null;
  eInvoicePreference: EInvoicePreference;
};

type InvoiceLineRow = {
  tenantId: string;
  invoiceId: string;
  position: number;
  source: InvoiceLineSource;
  assignmentId: string | null;
  serviceDate: Date | null;
  sourceSnapshot: Record<string, unknown> | null;
};

/** Only the columns the trip overview falls back to when a snapshot predates the plate. */
type AssignmentRow = {
  id: string;
  tenantId: string;
  vehicle: { plateNumber: string };
};

type ProfileRow = {
  id: string;
  tenantId: string;
  legalName: string;
  iban: string;
  bic: string | null;
  bankName: string | null;
  invoiceFooterText: string | null;
  invoiceEmailCc: string | null;
};

type DeliveryAttemptRow = {
  tenantId?: string;
  invoiceId: string;
  recipientEmail: string;
  ccEmail: string | null;
  status: string;
  mailMode: string;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  attemptedAt?: Date;
};

type Store = {
  invoices: InvoiceRow[];
  lines: InvoiceLineRow[];
  assignments: AssignmentRow[];
  companies: CompanyRow[];
  profiles: ProfileRow[];
  documents: Array<{ storedPath: string; contents: Buffer }>;
  attempts: DeliveryAttemptRow[];
  auditEvents: Array<Record<string, unknown>>;
  mails: SendMailParams[];
};

/** Lets a single test make the first send fail and a later retry succeed. */
type MailBehaviour = { enabled: boolean; failWith: string | null };

/** Reads the timestamp fresh so an earlier `assert.equal(..., null)` cannot narrow it away. */
function sentAtOf(store: Store): Date | null {
  return store.invoices[0].sentAt;
}

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

/**
 * In-memory Prisma stand-in for the delivery path. It routes every call through the
 * production `applyTenantScope`, so the tenant isolation assertion exercises the real
 * scoping rules instead of a hand-written filter.
 */
function createFakePrisma(store: Store) {
  function scope(model: string, operation: string, args: Record<string, unknown>) {
    const tenantId = TenantContext.getTenantId();
    return tenantId ? applyTenantScope(operation, args, tenantId, model) : args;
  }

  function linesOf(invoiceId: string): InvoiceLineRow[] {
    return store.lines
      .filter((line) => line.invoiceId === invoiceId)
      .sort((left, right) => left.position - right.position);
  }

  const client = {
    invoice: {
      findUnique: async (args: {
        where: Record<string, unknown>;
        include?: { company?: unknown; lines?: unknown };
      }) => {
        const where = scope('Invoice', 'findUnique', args).where as Record<string, unknown>;
        const found = store.invoices.find((invoice) => matches(invoice, where));
        if (!found) return null;
        const result: Record<string, unknown> = { ...found };
        if (args.include?.company) {
          result.company = store.companies.find((company) => company.id === found.companyId);
        }
        if (args.include?.lines) result.lines = linesOf(found.id);
        return result;
      },
      update: async (args: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
        include?: { company?: unknown; lines?: unknown };
      }) => {
        const where = scope('Invoice', 'update', args).where as Record<string, unknown>;
        const found = store.invoices.find((invoice) => matches(invoice, where));
        if (!found) throw new Error('Fake invoice.update matched no row');
        Object.assign(found, args.data);
        const result: Record<string, unknown> = { ...found };
        if (args.include?.company) {
          result.company = store.companies.find((company) => company.id === found.companyId);
        }
        if (args.include?.lines) result.lines = linesOf(found.id);
        return result;
      },
    },
    assignment: {
      findMany: async (args: { where: { id: { in: string[] } } }) => {
        // findMany scoping wraps the caller's filter as `AND: [where, { tenantId }]`,
        // so both clauses have to be read back out to reproduce the real isolation.
        const where = scope('Assignment', 'findMany', args).where as Record<string, unknown>;
        const clauses = (where.AND as Array<Record<string, unknown>> | undefined) ?? [where];
        const ids = clauses.find((clause) => 'id' in clause)?.id as { in: string[] } | undefined;
        const tenantId = clauses.find((clause) => 'tenantId' in clause)?.tenantId as
          | string
          | undefined;
        return store.assignments
          .filter((row) => ids?.in.includes(row.id) ?? true)
          .filter((row) => tenantId === undefined || row.tenantId === tenantId)
          .map((row) => ({ id: row.id, vehicle: row.vehicle }));
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
    invoiceDeliveryAttempt: {
      create: async (args: { data: Record<string, unknown> }) => {
        const data = scope('InvoiceDeliveryAttempt', 'create', args).data as DeliveryAttemptRow;
        store.attempts.push({ ...data });
        return data;
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

function createFakeDocumentStorage(store: Store) {
  return {
    open: async (storedPath: string) => {
      const found = store.documents.find((document) => document.storedPath === storedPath);
      return found ? { stream: Readable.from(found.contents) } : null;
    },
  };
}

function createFakeMail(store: Store, behaviour: MailBehaviour) {
  return {
    isEnabled: () => behaviour.enabled,
    sendMail: async (params: SendMailParams) => {
      if (behaviour.failWith) throw new Error(behaviour.failWith);
      store.mails.push(params);
      return {
        sent: behaviour.enabled,
        mode: behaviour.enabled ? ('smtp' as const) : ('log' as const),
        messageId: `message-${store.mails.length}`,
      };
    },
  };
}

function createService(
  store: Store,
  behaviour: MailBehaviour = { enabled: true, failWith: null },
): InvoicingService {
  return new InvoicingService(
    createFakePrisma(store) as unknown as PrismaService,
    { logAction: async () => undefined } as unknown as AuditService,
    createFakeDocumentStorage(store) as unknown as InvoiceDocumentStorageService,
    {} as unknown as DatevExportStorageService,
    createFakeMail(store, behaviour) as unknown as MailService,
  );
}

function supplierSnapshot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    legalName: 'Fleet Transporte GmbH',
    street: 'Musterstr. 1',
    postalCode: '10115',
    city: 'Berlin',
    countryCode: 'DE',
    vatId: 'DE123456789',
    iban: 'DE02120300000000202051',
    bic: 'BYLADEM1001',
    bankName: 'Deutsche Kreditbank',
    smallBusinessRule: false,
    invoiceFooterText: null,
    ...overrides,
  };
}

function invoice(overrides: Partial<InvoiceRow> = {}): InvoiceRow {
  return {
    id: 'invoice-a',
    tenantId: 'tenant-a',
    companyId: 'company-a',
    status: OutgoingInvoiceStatus.finalized,
    number: 'RE-2026-00001',
    invoiceDate: new Date('2026-07-27T00:00:00.000Z'),
    servicePeriodStart: new Date('2026-07-01T00:00:00.000Z'),
    servicePeriodEnd: new Date('2026-07-26T00:00:00.000Z'),
    dueDate: new Date('2026-08-10T00:00:00.000Z'),
    currency: 'EUR',
    netCents: 100_000,
    taxCents: 19_000,
    grossCents: 119_000,
    notes: null,
    customerName: 'Acme Logistik GmbH – Zentrale',
    customerEmail: 'rechnung@acme.example',
    supplierSnapshot: supplierSnapshot(),
    sentAt: null,
    pdfStoredPath: '/uploads/invoice-documents/RE-2026-00001-rechnung.pdf',
    zugferdXmlStoredPath: '/uploads/invoice-documents/RE-2026-00001-zugferd.xml',
    xrechnungStoredPath: null,
    ...overrides,
  };
}

function line(overrides: Partial<InvoiceLineRow> = {}): InvoiceLineRow {
  return {
    tenantId: 'tenant-a',
    invoiceId: 'invoice-a',
    position: 1,
    source: InvoiceLineSource.assignment,
    assignmentId: 'assignment-a',
    serviceDate: new Date('2026-07-02T00:00:00.000Z'),
    sourceSnapshot: {
      cargoName: 'Paletten',
      routeName: 'Berlin – Hamburg',
      pickupAddress: 'Berlin, Alexanderplatz 1',
      deliveryAddress: 'Hamburg, Speicherstadt 4',
      workDate: '2026-07-02T00:00:00.000Z',
      vehiclePlate: 'B-FL 1234',
    },
    ...overrides,
  };
}

function company(overrides: Partial<CompanyRow> = {}): CompanyRow {
  return {
    id: 'company-a',
    tenantId: 'tenant-a',
    name: 'Acme Logistik GmbH',
    invoiceEmail: 'buchhaltung@acme.example',
    eInvoicePreference: EInvoicePreference.zugferd,
    ...overrides,
  };
}

function billingProfile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: 'profile-a',
    tenantId: 'tenant-a',
    legalName: 'Fleet Transporte GmbH',
    iban: 'DE02120300000000202051',
    bic: 'BYLADEM1001',
    bankName: 'Deutsche Kreditbank',
    invoiceFooterText: null,
    invoiceEmailCc: 'kopie@fleet.example',
    ...overrides,
  };
}

function createStore(overrides: Partial<Store> = {}): Store {
  return {
    invoices: [invoice()],
    lines: [line()],
    // The live plate differs from the snapshotted one on purpose: the mail must quote the
    // vehicle that actually drove, not whatever the assignment carries today.
    assignments: [{ id: 'assignment-a', tenantId: 'tenant-a', vehicle: { plateNumber: 'B-XX 9999' } }],
    companies: [company()],
    profiles: [billingProfile()],
    documents: [
      {
        storedPath: '/uploads/invoice-documents/RE-2026-00001-rechnung.pdf',
        contents: Buffer.from('%PDF-1.7 stored pdf bytes'),
      },
      {
        storedPath: '/uploads/invoice-documents/RE-2026-00001-zugferd.xml',
        contents: Buffer.from('<CrossIndustryInvoice />'),
      },
      {
        storedPath: '/uploads/invoice-documents/RE-2026-00001-xrechnung.xml',
        contents: Buffer.from('<Invoice />'),
      },
    ],
    attempts: [],
    auditEvents: [],
    mails: [],
    ...overrides,
  };
}

describe('InvoicingService send', () => {
  it('refuses to send a draft and leaves no delivery attempt behind', async () => {
    const store = createStore({ invoices: [invoice({ status: OutgoingInvoiceStatus.draft, number: null })] });
    const service = createService(store);

    await assert.rejects(
      TenantContext.run('tenant-a', () => service.sendInvoice('invoice-a', 'tenant-a', 'user-a')),
      (error: unknown) =>
        error instanceof ConflictException &&
        error.message === 'The invoice must be finalized before it can be sent',
    );

    assert.deepEqual(store.attempts, []);
    assert.deepEqual(store.mails, []);
    assert.equal(store.invoices[0].sentAt, null);
  });

  it('rejects an invoice without any recipient address before it tries to send', async () => {
    const store = createStore({
      invoices: [invoice({ customerEmail: null })],
      companies: [company({ invoiceEmail: null })],
    });
    const service = createService(store);

    await assert.rejects(
      TenantContext.run('tenant-a', () => service.sendInvoice('invoice-a', 'tenant-a', 'user-a')),
      (error: unknown) =>
        error instanceof BadRequestException &&
        error.message ===
          'The customer has no invoice e-mail address; add one to the company or the invoice before sending',
    );

    assert.deepEqual(store.attempts, []);
    assert.deepEqual(store.mails, []);
  });

  it('sends the stored PDF to the snapshot address with the billing profile CC', async () => {
    const store = createStore();
    const service = createService(store);

    const result = await TenantContext.run('tenant-a', () =>
      service.sendInvoice('invoice-a', 'tenant-a', 'user-a'),
    );

    assert.equal(result.recipientEmail, 'rechnung@acme.example');
    assert.equal(result.ccEmail, 'kopie@fleet.example');
    assert.equal(result.mailSent, true);
    assert.equal(result.mailMode, 'smtp');
    assert.equal(result.attachedXml, false);

    assert.equal(store.mails.length, 1);
    const mail = store.mails[0];
    assert.equal(mail.to, 'rechnung@acme.example');
    assert.equal(mail.cc, 'kopie@fleet.example');
    assert.equal(mail.subject, 'Rechnung RE-2026-00001 von Fleet Transporte GmbH');
    // ZUGFeRD embeds the CII inside the PDF, so a second XML file would be redundant.
    assert.deepEqual(
      mail.attachments?.map((attachment) => attachment.filename),
      ['RE-2026-00001.pdf'],
    );
    assert.deepEqual(
      mail.attachments?.[0].content,
      Buffer.from('%PDF-1.7 stored pdf bytes'),
    );
    assert.equal(mail.attachments?.[0].contentType, 'application/pdf');

    // German cover letter facts a bookkeeper needs to file the invoice.
    assert.match(mail.text, /Rechnungsnummer: RE-2026-00001/);
    assert.match(mail.text, /Rechnungsbetrag: 1\.190,00 €/);
    assert.match(mail.text, /Zahlbar bis: 10\.08\.2026/);
    assert.match(mail.text, /Leistungszeitraum: 01\.07\.2026 – 26\.07\.2026/);
    assert.match(mail.text, /IBAN: DE02120300000000202051/);

    assert.equal(store.invoices[0].status, OutgoingInvoiceStatus.sent);
    assert.ok(store.invoices[0].sentAt instanceof Date);

    assert.equal(store.attempts.length, 1);
    assert.deepEqual(
      {
        tenantId: store.attempts[0].tenantId,
        invoiceId: store.attempts[0].invoiceId,
        recipientEmail: store.attempts[0].recipientEmail,
        ccEmail: store.attempts[0].ccEmail,
        status: store.attempts[0].status,
        mailMode: store.attempts[0].mailMode,
        providerMessageId: store.attempts[0].providerMessageId,
      },
      {
        tenantId: 'tenant-a',
        invoiceId: 'invoice-a',
        recipientEmail: 'rechnung@acme.example',
        ccEmail: 'kopie@fleet.example',
        status: 'sent',
        mailMode: 'smtp',
        providerMessageId: 'message-1',
      },
    );

    const event = store.auditEvents[store.auditEvents.length - 1];
    assert.equal(event.action, 'sent');
    assert.equal(event.actorUserId, 'user-a');
    const snapshot = event.snapshot as Record<string, unknown>;
    assert.equal(snapshot.recipientEmail, 'rechnung@acme.example');
    assert.equal(snapshot.statusBefore, OutgoingInvoiceStatus.finalized);
    assert.equal(snapshot.statusAfter, OutgoingInvoiceStatus.sent);
    assert.deepEqual(snapshot.attachments, ['RE-2026-00001.pdf']);
  });

  it('falls back to the company invoice address when the snapshot has none', async () => {
    const store = createStore({ invoices: [invoice({ customerEmail: null })] });
    const service = createService(store);

    const result = await TenantContext.run('tenant-a', () =>
      service.sendInvoice('invoice-a', 'tenant-a', 'user-a'),
    );

    assert.equal(result.recipientEmail, 'buchhaltung@acme.example');
    assert.equal(store.mails[0].to, 'buchhaltung@acme.example');
    assert.equal(store.attempts[0].recipientEmail, 'buchhaltung@acme.example');
  });

  it('attaches the XRechnung XML because it is the legally original document', async () => {
    const store = createStore({
      invoices: [
        invoice({
          zugferdXmlStoredPath: null,
          xrechnungStoredPath: '/uploads/invoice-documents/RE-2026-00001-xrechnung.xml',
        }),
      ],
      companies: [company({ eInvoicePreference: EInvoicePreference.xrechnung })],
    });
    const service = createService(store);

    const result = await TenantContext.run('tenant-a', () =>
      service.sendInvoice('invoice-a', 'tenant-a', 'user-a'),
    );

    assert.equal(result.attachedXml, true);
    assert.deepEqual(
      store.mails[0].attachments?.map((attachment) => attachment.filename),
      ['RE-2026-00001.pdf', 'RE-2026-00001.xml'],
    );
    assert.deepEqual(store.mails[0].attachments?.[1].content, Buffer.from('<Invoice />'));
    assert.match(store.mails[0].text, /elektronische Rechnung im XML-Format/);
  });

  it('attaches the ZUGFeRD XML when the caller explicitly asks for it', async () => {
    const store = createStore();
    const service = createService(store);

    await TenantContext.run('tenant-a', () =>
      service.sendInvoice('invoice-a', 'tenant-a', 'user-a', { includeXml: true }),
    );

    assert.deepEqual(
      store.mails[0].attachments?.map((attachment) => attachment.filename),
      ['RE-2026-00001.pdf', 'RE-2026-00001.xml'],
    );
    assert.deepEqual(
      store.mails[0].attachments?.[1].content,
      Buffer.from('<CrossIndustryInvoice />'),
    );
  });

  it('uses the requested English cover-letter template', async () => {
    const store = createStore();
    const service = createService(store);

    await TenantContext.run('tenant-a', () =>
      service.sendInvoice('invoice-a', 'tenant-a', 'user-a', { language: 'en' }),
    );

    const mail = store.mails[0];
    assert.equal(mail.subject, 'Invoice RE-2026-00001 from Fleet Transporte GmbH');
    assert.match(mail.text, /Invoice number: RE-2026-00001/);
    assert.match(mail.text, /Payable by: 10\.08\.2026/);
    assert.match(mail.text, /Kind regards/);
    assert.ok(mail.text.includes('Invoiced trips:'));
    assert.ok(mail.text.includes('Route: Berlin – Hamburg | Load: Paletten | Vehicle: B-FL 1234'));
  });

  it('uses the Turkish labels for the trip overview', async () => {
    const store = createStore();
    const service = createService(store);

    await TenantContext.run('tenant-a', () =>
      service.sendInvoice('invoice-a', 'tenant-a', 'user-a', { language: 'tr' }),
    );

    const mail = store.mails[0];
    assert.ok(mail.text.includes('Faturalanan seferler:'));
    assert.ok(
      mail.text.includes('Guzergah: Berlin – Hamburg | Yuk: Paletten | Arac: B-FL 1234'),
    );
  });

  it('lists every invoiced trip with date, route, load and vehicle', async () => {
    const store = createStore({
      lines: [
        line(),
        line({
          position: 2,
          assignmentId: 'assignment-b',
          serviceDate: new Date('2026-07-09T00:00:00.000Z'),
          sourceSnapshot: {
            cargoName: 'Kühlware',
            routeName: 'Hamburg – Bremen',
            pickupAddress: 'Hamburg',
            deliveryAddress: 'Bremen',
            workDate: '2026-07-09T00:00:00.000Z',
            vehiclePlate: 'HH-FL 4321',
          },
        }),
      ],
    });
    const service = createService(store);

    await TenantContext.run('tenant-a', () => service.sendInvoice('invoice-a', 'tenant-a', 'user-a'));

    const mail = store.mails[0];
    assert.ok(mail.text.includes('Abgerechnete Fahrten:'));
    assert.ok(
      mail.text.includes(
        '- 02.07.2026 | Strecke: Berlin – Hamburg | Ladung: Paletten | Fahrzeug: B-FL 1234',
      ),
    );
    assert.ok(
      mail.text.includes(
        '- 09.07.2026 | Strecke: Hamburg – Bremen | Ladung: Kühlware | Fahrzeug: HH-FL 4321',
      ),
    );
    // The plate is the one that drove, not the vehicle the assignment carries today.
    assert.doesNotMatch(mail.text, /B-XX 9999/);

    const html = mail.html ?? '';
    assert.ok(html.includes('Abgerechnete Fahrten'));
    assert.ok(html.includes('<th align="left"'));
    assert.ok(html.includes('B-FL 1234'));
    assert.ok(html.includes('HH-FL 4321'));
  });

  it('names the assignment vehicle for lines invoiced before the plate was snapshotted', async () => {
    const store = createStore({
      lines: [
        line({
          sourceSnapshot: {
            cargoName: 'Paletten',
            routeName: 'Berlin – Hamburg',
            pickupAddress: 'Berlin',
            deliveryAddress: 'Hamburg',
            workDate: '2026-07-02T00:00:00.000Z',
          },
        }),
      ],
    });
    const service = createService(store);

    await TenantContext.run('tenant-a', () => service.sendInvoice('invoice-a', 'tenant-a', 'user-a'));

    assert.ok(store.mails[0].text.includes('Fahrzeug: B-XX 9999'));
  });

  it('falls back to the address pair when the trip carries no route name', async () => {
    const store = createStore({
      lines: [
        line({
          sourceSnapshot: {
            cargoName: 'Paletten',
            routeName: null,
            pickupAddress: 'Berlin, Alexanderplatz 1',
            deliveryAddress: 'Hamburg, Speicherstadt 4',
            workDate: '2026-07-02T00:00:00.000Z',
            vehiclePlate: 'B-FL 1234',
          },
        }),
      ],
    });
    const service = createService(store);

    await TenantContext.run('tenant-a', () => service.sendInvoice('invoice-a', 'tenant-a', 'user-a'));

    assert.ok(
      store.mails[0].text.includes(
        'Strecke: Berlin, Alexanderplatz 1 → Hamburg, Speicherstadt 4',
      ),
    );
  });

  it('leaves the overview out of an invoice that carries no trips', async () => {
    const store = createStore({
      lines: [
        line({
          source: InvoiceLineSource.manual,
          assignmentId: null,
          sourceSnapshot: null,
        }),
      ],
    });
    const service = createService(store);

    await TenantContext.run('tenant-a', () => service.sendInvoice('invoice-a', 'tenant-a', 'user-a'));

    const mail = store.mails[0];
    assert.doesNotMatch(mail.text, /Abgerechnete Fahrten/);
    assert.doesNotMatch(mail.html ?? '', /Abgerechnete Fahrten/);
    // The invoice facts must still be there — only the trip list is conditional.
    assert.match(mail.text, /Rechnungsnummer: RE-2026-00001/);
  });

  it('caps a long trip list and points to the attachment for the rest', async () => {
    const store = createStore({
      lines: Array.from({ length: 30 }, (_unused, index) =>
        line({
          position: index + 1,
          assignmentId: `assignment-${index}`,
          sourceSnapshot: {
            cargoName: `Ladung ${index + 1}`,
            routeName: `Route ${index + 1}`,
            pickupAddress: 'Berlin',
            deliveryAddress: 'Hamburg',
            workDate: '2026-07-02T00:00:00.000Z',
            vehiclePlate: 'B-FL 1234',
          },
        }),
      ),
    });
    const service = createService(store);

    await TenantContext.run('tenant-a', () => service.sendInvoice('invoice-a', 'tenant-a', 'user-a'));

    const mail = store.mails[0];
    assert.ok(mail.text.includes('Ladung: Ladung 25'));
    assert.doesNotMatch(mail.text, /Ladung: Ladung 26/);
    assert.ok(mail.text.includes('sowie 5 weitere Positionen'));
  });

  it('records a failed attempt without touching the invoice, and the retry succeeds', async () => {
    const store = createStore();
    const behaviour: MailBehaviour = { enabled: true, failWith: '550 mailbox unavailable' };
    const service = createService(store, behaviour);

    await assert.rejects(
      TenantContext.run('tenant-a', () => service.sendInvoice('invoice-a', 'tenant-a', 'user-a')),
      (error: unknown) =>
        error instanceof ServiceUnavailableException &&
        error.message.includes('550 mailbox unavailable'),
    );

    // The invoice itself must survive a bounced mail untouched.
    assert.equal(store.invoices[0].status, OutgoingInvoiceStatus.finalized);
    assert.equal(store.invoices[0].sentAt, null);
    assert.equal(store.attempts.length, 1);
    assert.equal(store.attempts[0].status, 'failed');
    assert.equal(store.attempts[0].mailMode, 'smtp');
    assert.equal(store.attempts[0].errorMessage, '550 mailbox unavailable');
    assert.equal(store.attempts[0].providerMessageId ?? null, null);
    assert.equal(store.auditEvents[store.auditEvents.length - 1].action, 'send.failed');
    assert.deepEqual(store.mails, []);

    behaviour.failWith = null;
    const result = await TenantContext.run('tenant-a', () =>
      service.sendInvoice('invoice-a', 'tenant-a', 'user-a'),
    );

    assert.equal(result.mailSent, true);
    assert.equal(store.attempts.length, 2);
    assert.deepEqual(
      store.attempts.map((attempt) => attempt.status),
      ['failed', 'sent'],
    );
    assert.equal(store.invoices[0].status, OutgoingInvoiceStatus.sent);
    assert.ok(sentAtOf(store) instanceof Date);
  });

  it('records a failed attempt when the stored PDF cannot be read', async () => {
    const store = createStore({ documents: [] });
    const service = createService(store);

    await assert.rejects(
      TenantContext.run('tenant-a', () => service.sendInvoice('invoice-a', 'tenant-a', 'user-a')),
      (error: unknown) => error instanceof ServiceUnavailableException,
    );

    assert.equal(store.attempts.length, 1);
    assert.equal(store.attempts[0].status, 'failed');
    assert.match(store.attempts[0].errorMessage ?? '', /could not be read/);
    assert.equal(store.invoices[0].status, OutgoingInvoiceStatus.finalized);
    assert.equal(store.invoices[0].sentAt, null);
  });

  it('writes a second attempt on re-send and keeps the first delivery timestamp', async () => {
    const store = createStore();
    const service = createService(store);

    await TenantContext.run('tenant-a', () => service.sendInvoice('invoice-a', 'tenant-a', 'user-a'));
    const firstSentAt = store.invoices[0].sentAt;
    await TenantContext.run('tenant-a', () => service.sendInvoice('invoice-a', 'tenant-a', 'user-b'));

    assert.equal(store.attempts.length, 2);
    assert.deepEqual(
      store.attempts.map((attempt) => attempt.status),
      ['sent', 'sent'],
    );
    assert.equal(store.mails.length, 2);
    assert.equal(store.invoices[0].sentAt?.getTime(), firstSentAt?.getTime());
    assert.equal(store.invoices[0].status, OutgoingInvoiceStatus.sent);
  });

  it('does not roll a paid invoice back to sent', async () => {
    const store = createStore({
      invoices: [invoice({ status: OutgoingInvoiceStatus.paid })],
    });
    const service = createService(store);

    await TenantContext.run('tenant-a', () => service.sendInvoice('invoice-a', 'tenant-a', 'user-a'));

    assert.equal(store.invoices[0].status, OutgoingInvoiceStatus.paid);
    assert.ok(store.invoices[0].sentAt instanceof Date);
    assert.equal(store.attempts[0].status, 'sent');
  });

  it('moves overdue invoices back to sent after a successful delivery', async () => {
    const store = createStore({
      invoices: [invoice({ status: OutgoingInvoiceStatus.overdue })],
    });
    const service = createService(store);

    await TenantContext.run('tenant-a', () => service.sendInvoice('invoice-a', 'tenant-a', 'user-a'));

    assert.equal(store.invoices[0].status, OutgoingInvoiceStatus.sent);
    assert.ok(store.invoices[0].sentAt instanceof Date);
    assert.equal(store.attempts[0].status, 'sent');
  });

  it('reports log mode when SMTP is disabled so nobody mistakes it for a real delivery', async () => {
    const store = createStore();
    const service = createService(store, { enabled: false, failWith: null });

    const result = await TenantContext.run('tenant-a', () =>
      service.sendInvoice('invoice-a', 'tenant-a', 'user-a'),
    );

    assert.equal(result.mailSent, false);
    assert.equal(result.mailMode, 'log');
    assert.equal(store.attempts[0].mailMode, 'log');
    assert.equal(store.invoices[0].status, OutgoingInvoiceStatus.sent);
  });

  it('keeps the invoice snapshot bank details even after the billing profile changes', async () => {
    const store = createStore({
      profiles: [billingProfile({ legalName: 'Fleet Transporte GmbH & Co. KG', iban: 'DE99999999999999999999' })],
    });
    const service = createService(store);

    await TenantContext.run('tenant-a', () => service.sendInvoice('invoice-a', 'tenant-a', 'user-a'));

    assert.equal(store.mails[0].subject, 'Rechnung RE-2026-00001 von Fleet Transporte GmbH');
    assert.match(store.mails[0].text, /IBAN: DE02120300000000202051/);
    assert.doesNotMatch(store.mails[0].text, /DE99999999999999999999/);
  });

  it('never sends another tenant invoice', async () => {
    const store = createStore();
    const service = createService(store);

    await assert.rejects(
      TenantContext.run('tenant-b', () => service.sendInvoice('invoice-a', 'tenant-b', 'user-b')),
      (error: unknown) => error instanceof NotFoundException && error.message === 'Invoice not found',
    );

    assert.deepEqual(store.attempts, []);
    assert.deepEqual(store.mails, []);
    assert.equal(store.invoices[0].sentAt, null);
    assert.equal(store.invoices[0].status, OutgoingInvoiceStatus.finalized);
  });
});
