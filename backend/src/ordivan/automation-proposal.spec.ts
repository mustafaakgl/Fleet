import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApprovalDecision, AutomationCorrectionCategory } from '@prisma/client';
import { AutomationProposalService } from './automation-proposal.service';

type Row = Record<string, unknown>;

/**
 * CIKARIMIN DEGISMEZLIGI (Faz 13 on kosulu, Faz 14 buna dayaniyor).
 *
 * Ajanin URETTIGI ilk cikarim ile insanin ONAYLADIGI degerler ayni yerde
 * durursa, alti ay sonra "model mi yanildi yoksa insan mi degistirdi"
 * sorusunun cevabi YOKTUR — ve duzeltme olcumu (rubber-stamping, hangi prompt
 * daha az duzeltiliyor) tamamen anlamsizlasir.
 *
 * Bu dosya sozlesmeyi kilitliyor:
 *   - `AutomationProposal.payload` karardan SONRA birebir ayni kalir,
 *   - insanin duzelttigi alanlar `AutomationCorrectionEvent` olarak AYRI yazilir,
 *   - net/brut secimi ve nihai degerler `ServiceRecord` + karar kaydinda durur.
 */

/** Ajanin urettigi cikarim. Testin degismezlik olcusu bu nesne. */
const EXTRACTION = Object.freeze({
  vendorName: 'Werkstatt Nord GmbH',
  invoiceNumber: 'RE-2026-4471',
  invoiceDate: '2026-08-02',
  serviceDate: '2026-08-01',
  plateNumber: 'DU-AB 123',
  vin: 'WDB9066571S123456',
  mileageKm: 184_500,
  currency: 'EUR',
  netAmount: 1_000,
  taxAmount: 190,
  grossAmount: 1_190,
  serviceDescription: 'Bremsen vorne, Inspektion',
});

function build() {
  const proposals: Row[] = [
    {
      id: 'prop-1',
      tenantId: 'tenant-a',
      proposalType: 'service_invoice.draft',
      schemaVersion: 1,
      status: 'pending_review',
      // Ajanin ilk ciktisi. Testin sonunda BIREBIR bu kalmali.
      payload: structuredClone(EXTRACTION),
      confidence: { costAmount: 0.42, serviceDate: 0.55, vendorName: 0.95 },
      evidence: { costAmount: { page: 1 } },
      checks: [],
      expiresAt: null,
      resultServiceRecordId: null,
      createdAt: new Date('2026-08-18T09:00:00.000Z'),
      updatedAt: new Date('2026-08-18T09:00:00.000Z'),
    },
  ];
  const tasks: Row[] = [
    {
      id: 'task-1',
      tenantId: 'tenant-a',
      proposalId: 'prop-1',
      sequence: 1,
      status: 'open',
      assignedRole: null,
      assignedUserId: null,
      openedAt: new Date('2026-08-18T09:05:00.000Z'),
      decision: null,
      rejectionCategory: null,
      decidedAt: null,
      decisionNote: null,
      reviewDurationMs: null,
      changedFieldCount: 0,
      criticalLowConfidenceVerified: false,
      decidedBy: null,
    },
  ];
  const corrections: Row[] = [];
  const serviceRecords: Row[] = [];
  const audits: Row[] = [];
  let seq = 0;

  /** Kosullu `updateMany` GERCEKTEN uygulaniyor: yaris ve idempotency testleri ancak boyle anlamli. */
  const matches = (row: Row, where: Record<string, unknown> | undefined): boolean => {
    if (!where) return true;
    for (const [key, expected] of Object.entries(where)) {
      if (key === 'tenantId') continue;
      const actual = row[key];
      if (expected === null) {
        if (actual !== null && actual !== undefined) return false;
        continue;
      }
      if (expected instanceof Date) {
        if (!(actual instanceof Date) || actual.getTime() !== expected.getTime()) return false;
        continue;
      }
      if (actual !== expected) return false;
    }
    return true;
  };

  const client = {
    automationProposal: {
      findFirst: async (args: { where?: Record<string, unknown> }) => {
        const found = proposals.find((row) => matches(row, args.where));
        if (!found) return null;
        const record = serviceRecords.find((item) => item.id === found.resultServiceRecordId) ?? null;
        return {
          ...found,
          // Iliskiler: servis bunlari `select` ile istiyor.
          job: { id: 'job-1', jobType: 'document.service_invoice.extract', schemaVersion: 1, document: null },
          agentRun: null,
          approvalTasks: tasks
            .filter((task) => task.proposalId === found.id)
            .map((task) => ({ ...task })),
          resultServiceRecord: record,
        };
      },
      updateMany: async (args: { where?: Record<string, unknown>; data: Row }) => {
        let count = 0;
        for (const row of proposals) {
          if (matches(row, args.where)) {
            Object.assign(row, args.data);
            count += 1;
          }
        }
        return { count };
      },
    },
    approvalTask: {
      updateMany: async (args: { where?: Record<string, unknown>; data: Row }) => {
        let count = 0;
        for (const row of tasks) {
          if (matches(row, args.where)) {
            Object.assign(row, args.data);
            count += 1;
          }
        }
        return { count };
      },
      count: async () => tasks.length,
    },
    automationCorrectionEvent: {
      createMany: async (args: { data: Row[] }) => {
        for (const item of args.data) {
          seq += 1;
          corrections.push({ id: `corr-${seq}`, tenantId: 'tenant-a', ...item });
        }
        return { count: args.data.length };
      },
    },
    serviceRecord: {
      create: async (args: { data: Row }) => {
        seq += 1;
        const row: Row = { id: `svc-${seq}`, tenantId: 'tenant-a', ...args.data };
        serviceRecords.push(row);
        return { ...row };
      },
    },
    vehicle: {
      findFirst: async (args: { where?: Record<string, unknown> }) => {
        const id = (args.where ?? {}).id;
        return id === 'veh-1' ? { id: 'veh-1' } : null;
      },
    },
  };

  const prisma = {
    ...client,
    unscoped: client,
    $transaction: async <T>(fn: (tx: typeof client) => Promise<T>): Promise<T> => fn(client),
  };
  const audit = {
    logAction: async (entry: Row) => {
      audits.push(entry);
      return {};
    },
  };

  const service = new AutomationProposalService(prisma as never, audit as never);
  return { service, proposals, tasks, corrections, serviceRecords, audits };
}

/** Insanin ekranda yaptigi duzeltme: tutar tabani BRUT, tutar da elle degistirilmis. */
function approvalInput(ctx: ReturnType<typeof build>) {
  return {
    expectedUpdatedAt: (ctx.proposals[0]!.updatedAt as Date).toISOString(),
    decision: ApprovalDecision.approved,
    note: 'Betrag laut Rechnung korrigiert.',
    corrections: [
      {
        fieldName: 'costAmount',
        fieldType: 'decimal',
        changed: true,
        category: AutomationCorrectionCategory.value_corrected,
        criticalLowConfidence: true,
        verifiedByReviewer: true,
      },
      {
        fieldName: 'serviceDate',
        fieldType: 'date',
        changed: false,
        category: AutomationCorrectionCategory.accepted_as_is,
        criticalLowConfidence: true,
        verifiedByReviewer: true,
      },
    ],
    serviceInvoice: {
      vehicleId: 'veh-1',
      // Ajan net/brut karari VERMEDI; insan BRUT sectii.
      costBasis: 'gross' as const,
      // Ajanin onerdigi 1190 degil — insan duzeltti.
      costAmount: 1_250.5,
      currency: 'EUR',
      serviceDate: '2026-08-01',
      repairCompany: 'Werkstatt Nord GmbH',
      serviceType: 'Bremsen vorne',
      mileageKm: 184_500,
    },
  };
}

describe('Faz 13 on kosulu — ilk cikarim DEGISMEZ', () => {
  it('onay `payload`i BIREBIR birakir; duzeltilen tutar oraya yazilmaz', async () => {
    const ctx = build();
    await ctx.service.decide('user-office', 'prop-1', approvalInput(ctx));

    assert.deepEqual(
      ctx.proposals[0]!.payload,
      EXTRACTION,
      'ajanin ilk ciktisi karardan sonra degismis',
    );
    // Insanin yazdigi 1250.5 cikarimin ICINE sizmamali.
    assert.ok(
      !JSON.stringify(ctx.proposals[0]!.payload).includes('1250.5'),
      'duzeltilmis tutar cikarim govdesine sizdi',
    );
  });

  it('reddetme de `payload`a dokunmaz', async () => {
    const ctx = build();
    await ctx.service.decide('user-office', 'prop-1', {
      expectedUpdatedAt: (ctx.proposals[0]!.updatedAt as Date).toISOString(),
      decision: ApprovalDecision.rejected,
      note: 'Falsches Fahrzeug auf der Rechnung.',
      rejectionCategory: 'incorrect_match',
    });

    assert.deepEqual(ctx.proposals[0]!.payload, EXTRACTION);
    assert.equal(ctx.proposals[0]!.status, 'rejected');
  });

  it('karar YALNIZCA durumu degistirir — confidence ve evidence de sabit', async () => {
    const ctx = build();
    const confidenceBefore = structuredClone(ctx.proposals[0]!.confidence);
    const evidenceBefore = structuredClone(ctx.proposals[0]!.evidence);

    await ctx.service.decide('user-office', 'prop-1', approvalInput(ctx));

    assert.deepEqual(ctx.proposals[0]!.confidence, confidenceBefore);
    assert.deepEqual(ctx.proposals[0]!.evidence, evidenceBefore);
    assert.equal(ctx.proposals[0]!.status, 'approved');
  });
});

describe('Faz 13 on kosulu — duzeltme AYRI kayitta', () => {
  it('her duzeltme alani ayri `CorrectionEvent` uretir', async () => {
    const ctx = build();
    await ctx.service.decide('user-office', 'prop-1', approvalInput(ctx));

    assert.equal(ctx.corrections.length, 2);
    const cost = ctx.corrections.find((row) => row.fieldName === 'costAmount');
    assert.ok(cost, 'costAmount duzeltmesi kaydedilmemis');
    assert.equal(cost!.changed, true);
    assert.equal(cost!.category, AutomationCorrectionCategory.value_corrected);
    // Alanin o anki guveni de olcum icin saklaniyor.
    assert.equal(Number(cost!.previousConfidence), 0.42);
  });

  it('duzeltme kaydi ALAN ADI ve TURUNU tasir, DEGERI tasimaz', async () => {
    const ctx = build();
    await ctx.service.decide('user-office', 'prop-1', approvalInput(ctx));

    const serialized = JSON.stringify(ctx.corrections);
    assert.ok(!serialized.includes('1250.5'), 'duzeltilen deger olcum kaydina sizdi');
    assert.ok(!serialized.includes('Werkstatt Nord'), 'belge degeri olcum kaydina sizdi');
  });

  it('karar kaydi degisen alan sayisini ve sureyi tutar', async () => {
    const ctx = build();
    await ctx.service.decide('user-office', 'prop-1', approvalInput(ctx));

    const task = ctx.tasks[0]!;
    assert.equal(task.status, 'decided');
    assert.equal(task.decision, ApprovalDecision.approved);
    assert.equal(task.changedFieldCount, 1);
    assert.equal(task.criticalLowConfidenceVerified, true);
    assert.equal(task.decidedById, 'user-office');
  });
});

describe('Faz 13 on kosulu — nihai degerler canonical kayitta', () => {
  it('`ServiceRecord` INSANIN degerlerini tasir, ajanin degil', async () => {
    const ctx = build();
    await ctx.service.decide('user-office', 'prop-1', approvalInput(ctx));

    assert.equal(ctx.serviceRecords.length, 1);
    const record = ctx.serviceRecords[0]!;
    assert.equal(Number(record.costAmount), 1250.5);
    assert.equal(record.vehicleId, 'veh-1');
    assert.equal(record.currency, 'EUR');
    // Ajanin brut onerisi 1190'di; kayda GIRMEDI.
    assert.notEqual(Number(record.costAmount), 1190);
  });

  it('oneri ile kayit arasinda tek yonlu izlenebilirlik bagi kurulur', async () => {
    const ctx = build();
    await ctx.service.decide('user-office', 'prop-1', approvalInput(ctx));
    assert.equal(ctx.proposals[0]!.resultServiceRecordId, ctx.serviceRecords[0]!.id);
  });

  it('net/brut secimi ve sapma DENETIME yazilir; tutarin kendisi yazilmaz', async () => {
    const ctx = build();
    await ctx.service.decide('user-office', 'prop-1', approvalInput(ctx));

    const entry = ctx.audits.find((row) => row.action === 'automation_proposal.approved');
    assert.ok(entry, 'onay denetime yazilmamis');
    const metadata = entry!.metadata as Record<string, unknown>;
    assert.equal(metadata.costBasis, 'gross');
    assert.equal(metadata.amountDiffersFromExtraction, true);
    // Karar kaydi: DEGER degil, KARAR.
    assert.ok(!JSON.stringify(metadata).includes('1250.5'), 'tutar denetime sizdi');
  });

  it('tekrarlanan ayni onay IKINCI bir maliyet satiri uretmez', async () => {
    const ctx = build();
    const input = approvalInput(ctx);
    await ctx.service.decide('user-office', 'prop-1', input);
    // Ayni karar yeniden gonderiliyor (cift tiklama, yeniden deneme).
    const again = await ctx.service.decide('user-office', 'prop-1', input);

    assert.equal(again.changed, false);
    assert.equal(ctx.serviceRecords.length, 1, 'ikinci ServiceRecord olusmus');
  });
});
