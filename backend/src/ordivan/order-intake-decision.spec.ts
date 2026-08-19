import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { OrderIntakeDecisionService } from './order-intake-decision.service';

type Row = Record<string, unknown>;

/**
 * ONAY VE DOMAIN SONUCU (Faz 16, bolum 6).
 *
 * Buradaki testler tek bir soruya cevap veriyor: onaydan sonra NE OLUSTU ve
 * daha onemlisi NE OLUSMADI. Faz 15 servisi MOCK ama cagrilari kaydediliyor —
 * "iptal `cancel()` cagirmiyor" iddiasi ancak boyle kanitlanabilir.
 */

interface BuildOptions {
  intent?: string;
  status?: string;
  matchedCompanyId?: string | null;
  matchedOrderId?: string | null;
  financialTask?: boolean;
  operationalDecided?: boolean;
  financialDecided?: boolean;
  alreadyLinkedOrderId?: string | null;
}

function build(options: BuildOptions = {}) {
  const proposals: Row[] = [
    {
      id: 'prop-1',
      payload: { intent: options.intent ?? 'new_order', customerName: 'Muster', currency: 'EUR' },
      status: 'pending_review',
      resultTransportOrderId: options.alreadyLinkedOrderId ?? null,
      resultTransportOrderRevisionId: null,
    },
  ];
  const reviews: Row[] = [
    {
      id: 'rev-1',
      messageId: 'msg-1',
      proposalId: 'prop-1',
      status: options.status ?? 'open',
      matchedCompanyId: options.matchedCompanyId === undefined ? 'cmp-1' : options.matchedCompanyId,
      matchedOrderId: options.matchedOrderId ?? null,
      selectedOrderId: null,
    },
  ];
  const tasks: Row[] = [
    {
      id: 'task-1',
      proposalId: 'prop-1',
      sequence: 1,
      assignedRole: 'office',
      status: options.operationalDecided === false ? 'open' : 'decided',
      decision: options.operationalDecided === false ? null : 'approved',
      changedFieldCount: 0,
    },
  ];
  if (options.financialTask) {
    tasks.push({
      id: 'task-2',
      proposalId: 'prop-1',
      sequence: 2,
      assignedRole: 'accounting',
      status: options.financialDecided ? 'decided' : 'open',
      decision: options.financialDecided ? 'approved' : null,
      changedFieldCount: 0,
    });
  }
  const messages: Row[] = [{ id: 'msg-1', status: 'needs_review' }];
  const corrections: Row[] = [];
  const revisions: Row[] = [];
  const audits: Row[] = [];

  /** Faz 15 cagrilari — HANGISININ cagrildigini kanitlamak icin. */
  const calls: string[] = [];

  const prisma = {
    orderIntakeReview: {
      async findFirst({ where }: { where: Row }) {
        const row = reviews.find((item) => item.id === where.id);
        if (!row) return null;
        return { ...row, proposal: proposals.find((item) => item.id === row.proposalId) };
      },
      async updateMany({ where, data }: { where: Row; data: Row }) {
        let count = 0;
        for (const row of reviews) {
          if (row.id !== where.id) continue;
          if (where.status !== undefined && row.status !== where.status) continue;
          Object.assign(row, data);
          count += 1;
        }
        return { count };
      },
    },
    approvalTask: {
      async findMany({ where }: { where: Row }) {
        return tasks.filter((row) => row.proposalId === where.proposalId);
      },
      async findFirst({ where }: { where: Row }) {
        return (
          tasks.find(
            (row) => row.proposalId === where.proposalId && row.sequence === where.sequence,
          ) ?? null
        );
      },
      async updateMany({ where, data }: { where: Row; data: Row }) {
        let count = 0;
        for (const row of tasks) {
          if (row.id !== where.id) continue;
          if (where.status !== undefined && row.status !== where.status) continue;
          Object.assign(row, data);
          count += 1;
        }
        return { count };
      },
    },
    automationProposal: {
      async updateMany({ where, data }: { where: Row; data: Row }) {
        let count = 0;
        for (const row of proposals) {
          if (row.id !== where.id) continue;
          // `@unique` alanin kosullu guncellemesi: `null` degilse yazilmaz.
          if ('resultTransportOrderId' in where && row.resultTransportOrderId !== null) continue;
          if ('resultTransportOrderRevisionId' in where && row.resultTransportOrderRevisionId !== null) continue;
          if ('status' in where && row.status !== where.status) continue;
          Object.assign(row, data);
          count += 1;
        }
        return { count };
      },
    },
    automationCorrectionEvent: {
      async createMany({ data }: { data: Row[] }) {
        corrections.push(...data);
        return { count: data.length };
      },
    },
    orderIntakeMessage: {
      async updateMany({ where, data }: { where: Row; data: Row }) {
        for (const row of messages) if (row.id === where.id) Object.assign(row, data);
        return { count: 1 };
      },
    },
    transportOrderRevision: {
      async findFirst() {
        return revisions[revisions.length - 1] ?? null;
      },
    },
    transportOrder: {
      async count() {
        return 7;
      },
    },
  };

  const audit = { async logAction(entry: Row) { audits.push(entry); return {}; } };

  const orders = {
    async createDraft(_userId: string, input: Row, source: string) {
      calls.push(`createDraft:${source}:${String(input.orderNumber)}`);
      return { id: 'ord-new', status: 'draft' };
    },
    async amend(_userId: string, orderId: string, _expected: string, _patch: Row, source: string) {
      calls.push(`amend:${orderId}:${source}`);
      revisions.push({ id: 'rev-pending', status: 'pending_review' });
      return {};
    },
    async cancellationImpact(orderId: string) {
      calls.push(`cancellationImpact:${orderId}`);
      return { assignments: 2, tours: 1, severity: 'high' };
    },
    async cancel() {
      calls.push('cancel');
      return {};
    },
    async confirm() {
      calls.push('confirm');
      return {};
    },
  };

  const service = new OrderIntakeDecisionService(prisma as never, audit as never, orders as never);
  return { service, calls, reviews, proposals, tasks, messages, corrections, audits };
}

const APPROVE = { intent: 'new_order' as const, values: { currency: 'EUR', orderDate: '2026-09-01' } };

// ---------------------------------------------------------------------------
// Yeni siparis
// ---------------------------------------------------------------------------

describe('Yeni siparis — YALNIZCA TASLAK', () => {
  it('canonical taslak olusuyor ve kaynak `email_agent`', async () => {
    const harness = build();
    const result = await harness.service.approve('user-1', 'admin', 'rev-1', APPROVE);

    assert.equal(result.transportOrderId, 'ord-new');
    assert.ok(harness.calls.some((call) => call.startsWith('createDraft:email_agent:')));
  });

  it('OTOMATIK CONFIRM YOK ve Assignment/Tour OLUSMUYOR', async () => {
    const harness = build();
    await harness.service.approve('user-1', 'admin', 'rev-1', APPROVE);

    assert.equal(harness.calls.includes('confirm'), false);
    assert.equal(harness.calls.includes('cancel'), false);
    // Faz 15 disinda hicbir yazma yolu cagrilmadi.
    assert.equal(harness.calls.length, 1);
  });

  it('siparis numarasi SUNUCUDA uretiliyor', async () => {
    const harness = build();
    await harness.service.approve('user-1', 'admin', 'rev-1', APPROVE);
    assert.ok(harness.calls[0]!.includes('TA-'));
  });

  it('PARA BIRIMI yoksa taslak ACILMIYOR — EUR varsayilmiyor', async () => {
    const harness = build();
    await assert.rejects(
      () => harness.service.approve('user-1', 'admin', 'rev-1', { intent: 'new_order', values: {} }),
      (error: unknown) => error instanceof BadRequestException,
    );
    assert.equal(harness.calls.length, 0);
    // Hak geri verildi: inceleme yeniden acik.
    assert.equal(harness.reviews[0]!.status, 'open');
  });

  it('MUSTERI secilmemisse onaylanamaz', async () => {
    const harness = build({ matchedCompanyId: null });
    await assert.rejects(
      () => harness.service.approve('user-1', 'admin', 'rev-1', APPROVE),
      (error: unknown) => error instanceof ConflictException,
    );
    assert.equal(harness.calls.length, 0);
  });
});

describe('EXACTLY-ONCE', () => {
  it('sonuc ONERIYE baglaniyor', async () => {
    const harness = build();
    await harness.service.approve('user-1', 'admin', 'rev-1', APPROVE);
    assert.equal(harness.proposals[0]!.resultTransportOrderId, 'ord-new');
  });

  it('sonucu olan oneri IKINCI kez onaylanamaz', async () => {
    const harness = build({ alreadyLinkedOrderId: 'ord-eski' });
    await assert.rejects(
      () => harness.service.approve('user-1', 'admin', 'rev-1', APPROVE),
      (error: unknown) => error instanceof ConflictException,
    );
    assert.equal(harness.calls.length, 0);
  });

  it('ES ZAMANLI iki onaydan YALNIZ BIRI siparis uretir', async () => {
    const harness = build();
    const results = await Promise.allSettled([
      harness.service.approve('user-1', 'admin', 'rev-1', APPROVE),
      harness.service.approve('user-2', 'admin', 'rev-1', APPROVE),
    ]);

    const fulfilled = results.filter((item) => item.status === 'fulfilled');
    assert.equal(fulfilled.length, 1);
    // Ikinci istek HICBIR canonical kayit uretmedi.
    assert.equal(harness.calls.filter((call) => call.startsWith('createDraft')).length, 1);
  });
});

// ---------------------------------------------------------------------------
// Degisiklik
// ---------------------------------------------------------------------------

describe('Degisiklik — ANA KAYIT DEGISMIYOR', () => {
  const input = {
    intent: 'amendment' as const,
    expectedUpdatedAt: '2026-09-01T10:00:00.000Z',
    values: { specialInstructions: 'Neue Uhrzeit' },
  };

  it('Faz 15 amendment servisi `email_agent` kaynagiyla cagriliyor', async () => {
    const harness = build({ intent: 'amendment', matchedOrderId: 'ord-1' });
    const result = await harness.service.approve('user-1', 'admin', 'rev-1', input);

    assert.deepEqual(harness.calls, ['amend:ord-1:email_agent']);
    assert.equal(result.revisionId, 'rev-pending');
  });

  it('bekleyen revizyon ONERIYE baglaniyor', async () => {
    const harness = build({ intent: 'amendment', matchedOrderId: 'ord-1' });
    await harness.service.approve('user-1', 'admin', 'rev-1', input);
    assert.equal(harness.proposals[0]!.resultTransportOrderRevisionId, 'rev-pending');
  });

  it('SIPARIS secilmemisse degisiklik ilerlemiyor', async () => {
    const harness = build({ intent: 'amendment', matchedOrderId: null });
    await assert.rejects(
      () => harness.service.approve('user-1', 'admin', 'rev-1', input),
      (error: unknown) => error instanceof ConflictException,
    );
    assert.equal(harness.calls.length, 0);
  });

  it('eszamanlilik damgasi olmadan degisiklik yapilamaz', async () => {
    const harness = build({ intent: 'amendment', matchedOrderId: 'ord-1' });
    await assert.rejects(
      () =>
        harness.service.approve('user-1', 'admin', 'rev-1', {
          intent: 'amendment',
          values: {},
        }),
      (error: unknown) => error instanceof BadRequestException,
    );
    assert.equal(harness.calls.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Iptal
// ---------------------------------------------------------------------------

describe('Iptal — YALNIZCA ONIZLEME', () => {
  it('`cancel()` CAGRILMIYOR, yalnizca etki onizlemesi uretiliyor', async () => {
    const harness = build({ intent: 'cancellation', matchedOrderId: 'ord-1' });
    const result = await harness.service.approve('user-1', 'admin', 'rev-1', {
      intent: 'cancellation',
      values: {},
    });

    assert.deepEqual(harness.calls, ['cancellationImpact:ord-1']);
    assert.equal(harness.calls.includes('cancel'), false);
    assert.ok(result.cancellationImpact);
    assert.equal(result.transportOrderId, 'ord-1');
  });

  it('Assignment ve Tour sayilari GOSTERILIYOR — silinmiyor', async () => {
    const harness = build({ intent: 'cancellation', matchedOrderId: 'ord-1' });
    const result = await harness.service.approve('user-1', 'admin', 'rev-1', {
      intent: 'cancellation',
      values: {},
    });
    assert.equal((result.cancellationImpact as Row).assignments, 2);
  });

  it('siparis secilmemisse iptal onerisi bile uretilmiyor', async () => {
    const harness = build({ intent: 'cancellation', matchedOrderId: null });
    await assert.rejects(
      () => harness.service.approve('user-1', 'admin', 'rev-1', { intent: 'cancellation', values: {} }),
      (error: unknown) => error instanceof ConflictException,
    );
    assert.equal(harness.calls.length, 0);
  });
});

// ---------------------------------------------------------------------------
// 1:n onay gorevleri
// ---------------------------------------------------------------------------

describe('Operasyonel ve finansal inceleme', () => {
  it('FINANSAL gorev bitmeden taslak OLUSMUYOR', async () => {
    const harness = build({ financialTask: true, financialDecided: false });
    await assert.rejects(
      () => harness.service.approve('user-1', 'admin', 'rev-1', APPROVE),
      (error: unknown) => error instanceof ConflictException,
    );
    assert.equal(harness.calls.length, 0);
  });

  it('iki gorev de bitince taslak olusuyor', async () => {
    const harness = build({ financialTask: true, financialDecided: true });
    await harness.service.approve('user-1', 'admin', 'rev-1', APPROVE);
    assert.equal(harness.calls.length, 1);
  });

  it('OFIS finansal gorevi kapatamaz', async () => {
    const harness = build({ financialTask: true });
    await assert.rejects(
      () => harness.service.decideTask('user-1', 'office', 'rev-1', 2, 'approved'),
      (error: unknown) => error instanceof ForbiddenException,
    );
  });

  it('MUHASEBE operasyonel gorevi kapatamaz', async () => {
    const harness = build({ operationalDecided: false });
    await assert.rejects(
      () => harness.service.decideTask('user-1', 'accounting', 'rev-1', 1, 'approved'),
      (error: unknown) => error instanceof ForbiddenException,
    );
  });

  it('SURUCU hicbir gorevi kapatamaz', async () => {
    const harness = build({ financialTask: true, operationalDecided: false });
    for (const sequence of [1, 2]) {
      await assert.rejects(
        () => harness.service.decideTask('user-1', 'driver', 'rev-1', sequence, 'approved'),
        (error: unknown) => error instanceof ForbiddenException,
      );
    }
  });

  it('yetkili rol gorevi kapatiyor ve ikinci kez kapatamiyor', async () => {
    const harness = build({ operationalDecided: false });
    await harness.service.decideTask('user-1', 'office', 'rev-1', 1, 'approved', 'passt');
    assert.equal(harness.tasks[0]!.status, 'decided');

    await assert.rejects(
      () => harness.service.decideTask('user-1', 'office', 'rev-1', 1, 'approved'),
      (error: unknown) => error instanceof ConflictException,
    );
  });

  it('operasyonel gorev bitmeden taslak OLUSMUYOR', async () => {
    const harness = build({ operationalDecided: false });
    await assert.rejects(
      () => harness.service.approve('user-1', 'admin', 'rev-1', APPROVE),
      (error: unknown) => error instanceof ConflictException,
    );
  });
});

// ---------------------------------------------------------------------------
// Duzeltme olaylari ve red
// ---------------------------------------------------------------------------

describe('Duzeltme olaylari ve red', () => {
  it('insanin degistirdigi alanlar CorrectionEvent olarak yaziliyor', async () => {
    const harness = build();
    await harness.service.approve('user-1', 'admin', 'rev-1', {
      intent: 'new_order',
      values: { currency: 'EUR', orderDate: '2026-09-01', customerName: 'Nord Logistik' },
    });

    const changed = harness.corrections.filter((row) => row.changed === true);
    assert.ok(changed.some((row) => row.fieldName === 'customerName'));
    // DEGER TASIMIYOR.
    assert.equal(JSON.stringify(harness.corrections).includes('Nord Logistik'), false);
  });

  it('ONERI DEGISMEZ kaliyor — duzeltme ayri satirda', async () => {
    const harness = build();
    const before = JSON.stringify(harness.proposals[0]!.payload);
    await harness.service.approve('user-1', 'admin', 'rev-1', {
      intent: 'new_order',
      values: { currency: 'EUR', customerName: 'Baska' },
    });
    assert.equal(JSON.stringify(harness.proposals[0]!.payload), before);
  });

  it('red SEBEPSIZ yapilamaz', async () => {
    const harness = build();
    await assert.rejects(
      () => harness.service.reject('user-1', 'rev-1', ' '),
      (error: unknown) => error instanceof BadRequestException,
    );
    assert.equal(harness.reviews[0]!.status, 'open');
  });

  it('red inceleme ve oneriyi kapatiyor, HICBIR kayit uretmiyor', async () => {
    const harness = build();
    await harness.service.reject('user-1', 'rev-1', 'Falscher Kunde');
    assert.equal(harness.reviews[0]!.status, 'rejected');
    assert.equal(harness.proposals[0]!.status, 'rejected');
    assert.equal(harness.calls.length, 0);
  });
});
