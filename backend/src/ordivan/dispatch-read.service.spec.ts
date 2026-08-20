import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { DispatchReadService } from './dispatch-read.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * DISPATCH PROJEKSIYONU VE FINANS MASKESI (Faz 17f).
 *
 * KIRACI KAPSAMI TAKLIT EDILIYOR: mock `where.id` eslesse bile satiri
 * yalnizca AKTIF kiraciya aitse doner. Boylece "baska kiracinin onerisi 404
 * doner" iddiasi gercekten bir sey kanitliyor — kapsami taklit etmeseydik
 * test yalnizca kendi kurgusunu dogrulardi.
 *
 * MASKE ROL BAZLI VE SUNUCUDA: ayni satir, cagiran role gore FARKLI bir
 * govdeye donusuyor. Test tam da bu farki olcuyor.
 */

const TENANT = 't1';

/** Ajanin ciktisi — icine kasitli olarak FAZLADAN alanlar konuldu. */
const AGENT_PAYLOAD = {
  rankedCandidates: [{ candidateRef: 'c1', rank: 1, rationaleKey: 'capacity_fits_best' }],
  consolidationRefs: [{ orderRef: 'o1' }],
  stopOrderRefs: [{ stopRef: 's1' }],
  // Sozlesmede OLMAYAN alanlar: ileride bir surum bunlari ekleyebilir ve
  // projeksiyon onlari SESSIZCE disari cikarmamali.
  internalModelInstruction: 'system prompt fragment',
  estimatedRevenue: 1250,
  rawPromptVersion: 'v7',
};

interface BuildOptions {
  tenantId?: string;
  resultTourId?: string | null;
  rejectionReason?: string | null;
}

function build(options: BuildOptions = {}) {
  const rowTenant = options.tenantId ?? TENANT;

  const proposal = {
    id: 'dp-1',
    tenantId: rowTenant,
    status: 'open',
    generation: 'ready',
    jobAttempt: 1,
    computedAt: new Date('2026-09-01T06:30:00.000Z'),
    routeStatus: 'ok',
    routeFailureClass: null,
    totalDistanceKm: 412.5,
    totalDurationMin: 340,
    plannedStops: [
      { sequence: 1, kind: 'pickup', locationId: 'loc-1', etaAt: '2026-09-01T08:00:00.000Z', internalCost: 90 },
    ],
    resultTourId: options.resultTourId ?? null,
    decidedById: null,
    decidedAt: null,
    rejectionReason: options.rejectionReason ?? null,
    decisionNote: null,
    createdAt: new Date('2026-09-01T06:00:00.000Z'),
    updatedAt: new Date('2026-09-01T06:35:00.000Z'),
    _count: { orders: 1, candidates: 2 },
    orders: [
      {
        sourceRevision: 3,
        transportOrder: {
          id: 'to-1',
          orderNumber: 'A-2026-1',
          status: 'confirmed',
          currentRevision: 3,
          companyId: 'co-1',
          currency: 'EUR',
          contractedRevenue: 1250,
          billingMode: 'on_order_completion',
          company: { name: 'Meyer Logistik' },
          _count: { consignments: 2 },
        },
      },
    ],
    proposal: { proposalType: 'dispatch.plan.suggestion', schemaVersion: 1, payload: AGENT_PAYLOAD },
  };

  const candidates = [
    {
      id: 'cand-1',
      tenantId: rowTenant,
      dispatchProposalId: 'dp-1',
      rank: 1,
      vehicleId: 'veh-1',
      driverId: 'drv-1',
      overallStatus: 'unknown',
      selected: false,
      checks: [
        {
          code: 'vehicle_payload',
          status: 'verified',
          reasonKey: 'capacity_sufficient',
          evidence: { requiredKg: 1200, capacityKg: 4000 },
        },
        {
          code: 'order_margin',
          status: 'unknown',
          reasonKey: 'revenue_below_target',
          evidence: { expectedRevenue: 900, targetRevenue: 1100 },
          override: 'explicit_choice',
        },
      ],
      vehicle: { plateNumber: 'B-FL 1024' },
      driver: { firstName: 'Alex', lastName: 'Meyer' },
    },
  ];

  const tours = [
    {
      id: 'tour-1',
      tenantId: rowTenant,
      status: 'planned',
      workDate: new Date('2026-09-01T00:00:00.000Z'),
      vehicleId: 'veh-1',
      driverId: 'drv-1',
      plannedStartAt: new Date('2026-09-01T07:00:00.000Z'),
      plannedEndAt: new Date('2026-09-01T16:00:00.000Z'),
      plannedDistanceKm: 412.5,
      plannedDurationMin: 340,
      plannedTollCents: 4200,
      stops: [
        {
          sequence: 1,
          kind: 'pickup',
          status: 'pending',
          locationId: 'loc-1',
          plannedArrivalAt: new Date('2026-09-01T08:00:00.000Z'),
          assignmentId: 'as-1',
        },
      ],
    },
  ];

  /** Kiraci kapsamli okuma: satir AKTIF kiraciya ait degilse YOK sayilir. */
  function scoped<T extends { tenantId: string }>(rows: T[]): T[] {
    return rows.filter((row) => row.tenantId === TENANT);
  }

  const prisma = {
    dispatchProposal: {
      count: async () => scoped([proposal]).length,
      findMany: async () => scoped([proposal]),
      findFirst: async () => scoped([proposal])[0] ?? null,
    },
    dispatchCandidate: {
      findMany: async () => scoped(candidates),
    },
    dispatchOverrideDeclaration: {
      findMany: async () => [],
    },
    tour: {
      findFirst: async () => scoped(tours)[0] ?? null,
    },
  } as unknown as PrismaService;

  return { service: new DispatchReadService(prisma) };
}

// ---------------------------------------------------------------------------
// Ofis: finans YOK
// ---------------------------------------------------------------------------

describe('Ofis yanitinda finans YOK', () => {
  it('siparis tutari, para birimi ve faturalama modu null', async () => {
    const detail = await build().service.detail('dp-1', 'office');
    const order = detail.orders[0]!;
    assert.equal(order.contractedRevenue, null);
    assert.equal(order.currency, null);
    assert.equal(order.billingMode, null);
    assert.equal(detail.financialFieldsMasked, true);
    // OPERASYONEL alanlar DOKUNULMAMIS — maske veriyi bozmuyor.
    assert.equal(order.orderNumber, 'A-2026-1');
    assert.equal(order.companyName, 'Meyer Logistik');
    assert.equal(order.consignmentCount, 2);
    assert.equal(detail.route.totalDistanceKm, 412.5);
    assert.equal(detail.route.totalDurationMin, 340);
  });

  it('planlanan duraktaki finansal alan da gitmis', async () => {
    const detail = await build().service.detail('dp-1', 'office');
    const stop = detail.route.plannedStops[0]!;
    assert.equal(stop.sequence, 1);
    assert.equal(stop.locationId, 'loc-1');
    // Projeksiyon bilinmeyen alani ZATEN tasimiyor.
    assert.equal('internalCost' in stop, false);
  });

  it('aday kanitindaki tutar ve gerekce ANAHTARI maskeli', async () => {
    const candidates = await build().service.candidates('dp-1', 'office');
    const checks = candidates[0]!.checks;
    const operational = checks.find((check) => check.code === 'vehicle_payload')!;
    const financial = checks.find((check) => check.code === 'order_margin')!;

    assert.equal(operational.evidence?.requiredKg, 1200);
    assert.equal(operational.reasonKey, 'capacity_sufficient');

    // Tutar gorulemiyor ama kanitin VARLIGI biliniyor.
    assert.equal(financial.evidence?.expectedRevenue, null);
    assert.equal(financial.evidence?.targetRevenue, null);
    // "gelir hedefin altinda" tutar tasimaz ama korunan alani ELE VERIR.
    assert.equal(financial.reasonKey, 'masked_financial');
    // Kontrolun kendisi ve asilabilirligi GORUNUR kaliyor.
    assert.equal(financial.status, 'unknown');
    assert.equal(financial.overridable, true);
  });

  it('tutar tasiyan red gerekcesi ofise gitmiyor', async () => {
    const harness = build({ rejectionReason: 'Marge zu gering: 120,00 EUR' });
    const detail = await harness.service.detail('dp-1', 'office');
    assert.equal(detail.rejectionReason, null);
  });

  it('uygulanmis turda gecis ucreti maskeli, mesafe ve sure acik', async () => {
    const harness = build({ resultTourId: 'tour-1' });
    const tour = await harness.service.resultTour('dp-1', 'office');
    assert.equal(tour.plannedTollCents, null);
    assert.equal(tour.plannedDistanceKm, 412.5);
    assert.equal(tour.plannedDurationMin, 340);
    assert.deepEqual(tour.assignmentIds, ['as-1']);
  });

  it('liste satirinda da finansal alan YOK', async () => {
    const page = await build().service.list({}, 'office');
    const row = page.rows[0]!;
    assert.equal(row.orderCount, 1);
    assert.equal(row.candidateCount, 2);
    assert.equal('contractedRevenue' in row, false);
    assert.equal('currency' in row, false);
  });
});

// ---------------------------------------------------------------------------
// Finans rolleri: alanlar YERINDE
// ---------------------------------------------------------------------------

describe('Finans yetkili rollerde alanlar YERINDE', () => {
  for (const role of ['admin', 'boss', 'accounting'] as const) {
    it(`${role} tutari ve para birimini goruyor`, async () => {
      const detail = await build().service.detail('dp-1', role);
      const order = detail.orders[0]!;
      assert.equal(order.contractedRevenue, 1250);
      assert.equal(order.currency, 'EUR');
      assert.equal(order.billingMode, 'on_order_completion');
      assert.equal(detail.financialFieldsMasked, false);
    });

    it(`${role} kanittaki tutari ve gercek gerekceyi goruyor`, async () => {
      const candidates = await build().service.candidates('dp-1', role);
      const financial = candidates[0]!.checks.find((check) => check.code === 'order_margin')!;
      assert.equal(financial.evidence?.expectedRevenue, 900);
      assert.equal(financial.reasonKey, 'revenue_below_target');
    });

    it(`${role} gecis ucretini goruyor`, async () => {
      const harness = build({ resultTourId: 'tour-1' });
      const tour = await harness.service.resultTour('dp-1', role);
      assert.equal(tour.plannedTollCents, 4200);
    });
  }
});

// ---------------------------------------------------------------------------
// Ham AI ciktisi
// ---------------------------------------------------------------------------

describe('HAM AutomationProposal DONMUYOR', () => {
  it('yalnizca sozlesmedeki alanlar cikiyor', async () => {
    const detail = await build().service.detail('dp-1', 'admin');
    const agent = detail.agent!;
    assert.deepEqual(Object.keys(agent).sort(), [
      'consolidationRefs',
      'proposalType',
      'rankedCandidates',
      'schemaVersion',
      'stopOrderRefs',
    ]);
    assert.deepEqual(agent.rankedCandidates, [
      { candidateRef: 'c1', rank: 1, rationaleKey: 'capacity_fits_best' },
    ]);
    assert.deepEqual(agent.consolidationRefs, ['o1']);
    assert.deepEqual(agent.stopOrderRefs, ['s1']);
  });

  /**
   * MODEL IC TALIMATI VE SOZLESME DISI ALANLAR CIKMIYOR.
   *
   * `payload`i oldugu gibi dondurseydik bu alanlar admin'e — ve maskesi
   * atlanabilecek her yola — sizardi. Test tam olarak bunu olcuyor: en
   * yetkili rolde bile.
   */
  it('sozlesme disi alanlar EN YETKILI rolde bile yok', async () => {
    const detail = await build().service.detail('dp-1', 'admin');
    const serialized = JSON.stringify(detail);
    for (const leak of ['internalModelInstruction', 'system prompt fragment', 'rawPromptVersion', 'estimatedRevenue']) {
      assert.equal(serialized.includes(leak), false, leak);
    }
  });

  it('`payload`, `confidence`, `evidence` anahtarlari govdede YOK', async () => {
    const detail = await build().service.detail('dp-1', 'admin');
    const agent = detail.agent as unknown as Record<string, unknown>;
    assert.equal('payload' in agent, false);
    assert.equal('confidence' in agent, false);
    assert.equal('evidence' in agent, false);
  });
});

// ---------------------------------------------------------------------------
// Kiraci sinirinda
// ---------------------------------------------------------------------------

describe('Baska kiracinin onerisi', () => {
  const other = () => build({ tenantId: 'other-tenant' });

  it('detay 404 — 403 DEGIL', async () => {
    await assert.rejects(
      () => other().service.detail('dp-1', 'admin'),
      (error: unknown) => error instanceof NotFoundException,
    );
  });

  it('adaylar 404', async () => {
    await assert.rejects(
      () => other().service.candidates('dp-1', 'admin'),
      (error: unknown) => error instanceof NotFoundException,
    );
  });

  it('beyanlar 404', async () => {
    await assert.rejects(
      () => other().service.overrides('dp-1', 'admin'),
      (error: unknown) => error instanceof NotFoundException,
    );
  });

  it('sonuc turu 404', async () => {
    await assert.rejects(
      () => build({ tenantId: 'other-tenant', resultTourId: 'tour-1' }).service.resultTour('dp-1', 'admin'),
      (error: unknown) => error instanceof NotFoundException,
    );
  });

  it('listede HIC gorunmuyor', async () => {
    const page = await other().service.list({}, 'admin');
    assert.equal(page.total, 0);
    assert.deepEqual(page.rows, []);
  });
});

// ---------------------------------------------------------------------------
// Uygulanmamis sonuc
// ---------------------------------------------------------------------------

describe('Uygulanmamis oneri', () => {
  it('tur ucu 404 doner — bos tur UYDURULMUYOR', async () => {
    await assert.rejects(
      () => build().service.resultTour('dp-1', 'admin'),
      (error: unknown) => error instanceof NotFoundException,
    );
  });
});

// ---------------------------------------------------------------------------
// Sayfalama
// ---------------------------------------------------------------------------

describe('Sayfalama', () => {
  it('varsayilan ve ust sinir uygulaniyor', async () => {
    const harness = build();
    assert.equal((await harness.service.list({}, 'admin')).pageSize, 25);
    assert.equal((await harness.service.list({ pageSize: 500 }, 'admin')).pageSize, 100);
    assert.equal((await harness.service.list({ pageSize: 0 }, 'admin')).pageSize, 1);
    assert.equal((await harness.service.list({ page: 0 }, 'admin')).page, 1);
  });
});
