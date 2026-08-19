import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AutomationJobService } from './automation-job.service';
import type { AuthenticatedConnector } from './ordivan-connector.service';

type Row = Record<string, unknown>;

/**
 * GELEN KUTUSU INCELEMESININ ACILISI (Faz 16).
 *
 * Bu set ESLESTIRMENIN SUNUCUDA yapildigini ve ajanin ciktisinin bir kimlik
 * uretemedigini ucdan uca gosteriyor. Saf eslestirme kurallari ayrica
 * `core/order-intake-match.spec.ts` icinde olculuyor; burada olculen sey
 * BAGLANTI: dogru girdiler dogru yerden geliyor mu.
 */

const CONNECTOR: AuthenticatedConnector = {
  connectorId: 'conn-1',
  tenantId: 'tenant-a',
  capabilities: ['transport_order.extract@v1'],
  displayName: 'Posta-Connector',
};

const COMPANIES: Row[] = [
  {
    id: 'cmp-muster',
    name: 'Spedition Muster GmbH',
    vatId: 'DE123456789',
    email: 'dispo@muster.example',
    invoiceEmail: null,
    datevDebtorNumber: 10042,
  },
  {
    id: 'cmp-tochter',
    name: 'Muster Tochter GmbH',
    vatId: null,
    // AYNI DOMAIN — domainin neden kanit olmadigini gostermek icin.
    email: 'buchhaltung@muster.example',
    invoiceEmail: null,
    datevDebtorNumber: null,
  },
];

const ORDERS: Row[] = [
  {
    id: 'ord-1',
    companyId: 'cmp-muster',
    orderNumber: 'TA-2026-0001',
    externalReference: 'KD-2026-0031',
    status: 'confirmed',
  },
];

function build(
  options: { fromAddress?: string | null; containsFinancialData?: 'yes' | 'no' | 'unknown' } = {},
) {
  const reviews: Row[] = [];
  const messages: Row[] = [
    {
      id: 'msg-1',
      fromAddress: options.fromAddress === undefined ? 'dispo@muster.example' : options.fromAddress,
      // Finansal gorevin acilip acilmadigini belirler; `no` = yalnizca operasyonel.
      containsFinancialData: options.containsFinancialData ?? 'no',
      subject: 'Transportauftrag',
      bodyText: 'Ladestelle: Duisburg',
      status: 'extracting',
    },
  ];
  const jobs: Row[] = [
    {
      id: 'job-1',
      jobType: 'transport_order.extract',
      status: 'leased',
      leaseToken: 'lease-1',
      leasedByConnectorId: 'conn-1',
      attempt: 1,
      payload: { messageId: 'msg-1' },
    },
  ];
  const runs: Row[] = [{ id: 'run-1', jobId: 'job-1', attempt: 1 }];
  const proposals: Row[] = [];
  const approvalTasks: Row[] = [];
  const audits: Row[] = [];
  let seq = 0;

  const prisma = {
    automationJob: {
      async findFirst({ where }: { where: Row }) {
        return jobs.find((row) => row.id === where.id) ?? null;
      },
      async updateMany({ where, data }: { where: Row; data: Row }) {
        let count = 0;
        for (const row of jobs) {
          if (row.id !== where.id || row.leaseToken !== where.leaseToken) continue;
          Object.assign(row, data);
          count += 1;
        }
        return { count };
      },
    },
    agentRun: {
      async findFirst({ where }: { where: Row }) {
        return runs.find((row) => row.jobId === where.jobId) ?? null;
      },
      async updateMany() {
        return { count: 1 };
      },
    },
    automationProposal: {
      async findFirst() {
        return proposals[proposals.length - 1] ?? null;
      },
      async create({ data }: { data: Row }) {
        const row = { id: `prop-${(seq += 1)}`, ...data };
        proposals.push(row);
        return row;
      },
    },
    approvalTask: {
      async create({ data }: { data: Row }) {
        const row = { id: `task-${(seq += 1)}`, ...data };
        approvalTasks.push(row);
        return row;
      },
      // Faz 16'da gorevler 1:n olarak TOPLU aciliyor.
      async createMany({ data }: { data: Row[] }) {
        for (const item of data) approvalTasks.push({ id: `task-${(seq += 1)}`, ...item });
        return { count: data.length };
      },
    },
    orderIntakeMessage: {
      async findFirst({ where }: { where: Row }) {
        return messages.find((row) => row.id === where.id) ?? null;
      },
      async updateMany({ where, data }: { where: Row; data: Row }) {
        for (const row of messages) {
          if (row.id === where.id) Object.assign(row, data);
        }
        return { count: 1 };
      },
    },
    orderIntakeReview: {
      async create({ data }: { data: Row }) {
        const row = { id: `rev-${(seq += 1)}`, ...data };
        reviews.push(row);
        return row;
      },
    },
    company: {
      async findMany() {
        return COMPANIES;
      },
    },
    transportOrder: {
      async findMany() {
        return ORDERS;
      },
    },
  };

  const audit = {
    async logAction(entry: Row) {
      audits.push(entry);
      return {};
    },
  };

  const content = {
    async contentForExtraction() {
      return {
        messageId: 'msg-1',
        subject: String(messages[0]!.subject ?? ''),
        bodyText: String(messages[0]!.bodyText ?? ''),
        attachmentTexts: [],
      };
    },
  };

  const service = new AutomationJobService(prisma as never, audit as never, content as never);
  return { service, reviews, messages, proposals, approvalTasks };
}

async function complete(harness: ReturnType<typeof build>, payload: Row) {
  return harness.service.completeJob(CONNECTOR, 'job-1', {
    leaseToken: 'lease-1',
    proposalType: 'transport_order.extraction',
    proposalSchemaVersion: 1,
    payload,
  });
}

describe('Inceleme acilisi — musteri eslestirmesi SUNUCUDA', () => {
  it('musteri numarasi kesin eslesme uretir', async () => {
    const harness = build();
    await complete(harness, { intent: 'new_order', customerNumber: '10042' });

    const review = harness.reviews[0]!;
    assert.equal(review.matchedCompanyId, 'cmp-muster');
    assert.equal(review.companyMatchStatus, 'customer_number');
  });

  it('AJANIN gonderdigi bir kimlik KABUL EDILMEZ — sema reddeder', async () => {
    const harness = build();
    await assert.rejects(() => complete(harness, { intent: 'new_order', companyId: 'cmp-tochter' }));
    // Ne oneri ne inceleme olustu.
    assert.equal(harness.reviews.length, 0);
    assert.equal(harness.proposals.length, 0);
  });

  it('TAKLIT EDILMIS gonderen yetki URETMEZ', async () => {
    const harness = build({ fromAddress: 'angreifer@sahte.example' });
    await complete(harness, { intent: 'new_order' });

    const review = harness.reviews[0]!;
    assert.equal(review.matchedCompanyId, null);
    assert.equal(review.companyMatchStatus, 'unknown');
  });

  it('paylasilan DOMAIN yalnizca aday uretir', async () => {
    const harness = build({ fromAddress: 'einkauf@muster.example' });
    await complete(harness, { intent: 'new_order' });

    const review = harness.reviews[0]!;
    assert.equal(review.matchedCompanyId, null);
    assert.equal(review.companyMatchStatus, 'ambiguous');
    const candidates = review.companyCandidates as { ids: string[]; reason: string };
    assert.equal(candidates.reason, 'domain_candidates_only');
    assert.equal(candidates.ids.length, 2);
  });
});

describe('Inceleme acilisi — siparis eslestirmesi ve duplicate', () => {
  it('ayni musteri + referans DUPLICATE isaretler, ikinci siparis ACMAZ', async () => {
    const harness = build();
    await complete(harness, {
      intent: 'new_order',
      customerNumber: '10042',
      externalReference: 'KD-2026-0031',
    });

    const review = harness.reviews[0]!;
    assert.equal(review.possibleDuplicate, true);
    assert.equal(review.duplicateOfOrderId, 'ord-1');
    // Niyet degismiyor: insan "evet, gercekten ikinci siparis" diyebilmeli.
    assert.equal(review.proposedIntent, 'new_order');
  });

  it('degisiklik: siparis eslesmediyse SECIM ZORUNLU isaretleniyor', async () => {
    const harness = build();
    await complete(harness, { intent: 'amendment', customerNumber: '10042' });

    const review = harness.reviews[0]!;
    assert.equal(review.matchedOrderId, null);
    const candidates = review.orderCandidates as { requiresOrderSelection: boolean };
    assert.equal(candidates.requiresOrderSelection, true);
  });

  it('degisiklik: kesin eslesmede siparis baglaniyor', async () => {
    const harness = build();
    await complete(harness, {
      intent: 'amendment',
      customerNumber: '10042',
      externalReference: 'KD-2026-0031',
    });

    const review = harness.reviews[0]!;
    assert.equal(review.matchedOrderId, 'ord-1');
    assert.equal(review.orderMatchStatus, 'external_reference');
    const candidates = review.orderCandidates as { requiresOrderSelection: boolean };
    assert.equal(candidates.requiresOrderSelection, false);
  });

  it('`unknown` niyet OLDUGU GIBI kaydediliyor', async () => {
    const harness = build();
    await complete(harness, { intent: 'unknown' });
    assert.equal(harness.reviews[0]!.proposedIntent, 'unknown');
  });
});

describe('Inceleme acilisi — durum ve degismezlik', () => {
  it('mesaj `needs_review` durumuna geciyor', async () => {
    const harness = build();
    await complete(harness, { intent: 'new_order' });
    assert.equal(harness.messages[0]!.status, 'needs_review');
  });

  it('inceleme ONERIYE bagli ve oneri DEGISMEZ kaliyor', async () => {
    const harness = build();
    await complete(harness, { intent: 'new_order', customerNumber: '10042' });

    const proposal = harness.proposals[0]!;
    assert.equal(harness.reviews[0]!.proposalId, proposal.id);
    // Eslestirme sonucu ONERININ govdesine YAZILMIYOR: oneri ajanin degismez
    // ciktisi, eslestirme sunucunun karari. Ikisi ayri satirda duruyor.
    const payload = proposal.payload as Row;
    assert.equal('companyId' in payload, false);
    assert.equal('matchedCompanyId' in payload, false);
  });

  it('inceleme HICBIR siparis/revizyon URETMIYOR', async () => {
    const harness = build();
    await complete(harness, {
      intent: 'cancellation',
      customerNumber: '10042',
      externalReference: 'KD-2026-0031',
    });
    // Yalnizca inceleme ve onay gorevi olustu; canonical kayda dokunulmadi.
    assert.equal(harness.reviews.length, 1);
    assert.equal(harness.approvalTasks.length, 1);
  });
});

describe('Inceleme acilisi — 1:n onay gorevleri', () => {
  it('fiyatsiz mesajda YALNIZCA operasyonel gorev aciliyor', async () => {
    const harness = build({ containsFinancialData: 'no' });
    await complete(harness, { intent: 'new_order' });
    assert.deepEqual(harness.approvalTasks.map((task) => task.sequence), [1]);
  });

  it('tutar varsa finansal gorev de aciliyor', async () => {
    const harness = build({ containsFinancialData: 'no' });
    await complete(harness, { intent: 'new_order', revenueAmount: 1250, currency: 'EUR' });
    assert.deepEqual(harness.approvalTasks.map((task) => task.sequence), [1, 2]);
    assert.equal(harness.approvalTasks[1]!.assignedRole, 'accounting');
  });

  it('`unknown` finansal isaret finansal gorevi ACIYOR — guvenli sayilmiyor', async () => {
    const harness = build({ containsFinancialData: 'unknown' });
    await complete(harness, { intent: 'new_order' });
    assert.equal(harness.approvalTasks.length, 2);
  });
});
