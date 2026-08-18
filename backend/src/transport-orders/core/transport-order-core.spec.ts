import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assessCancellationImpact,
  canCancel,
  canTransition,
  cancellationNoteRequired,
  isDirectlyEditable,
  isKnownCancellationCategory,
  requiresAmendment,
} from './order-lifecycle';
import {
  allocateRevenue,
  assessBilling,
  deriveFulfillment,
  isStaleAgainstOrder,
  type AssignmentFact,
} from './order-fulfillment';
import {
  assertAgentCannotApplyDirectly,
  diffSnapshots,
  hasMeaningfulChange,
  nextRevisionNumber,
  revisionStatusFor,
  type ConsignmentSnapshot,
  type OrderSnapshot,
} from './order-revision';

// ---------------------------------------------------------------------------
// Yasam dongusu
// ---------------------------------------------------------------------------

describe('Ticari yasam dongusu', () => {
  it('draft onaylanabilir ve iptal edilebilir', () => {
    assert.equal(canTransition('draft', 'confirmed'), true);
    assert.equal(canTransition('draft', 'cancelled'), true);
  });

  it('onaylanmis siparis DRAFT\'A DONMEZ', () => {
    assert.equal(canTransition('confirmed', 'draft'), false);
  });

  it('iptal TERMINALDIR — yeniden acilmaz', () => {
    assert.equal(canTransition('cancelled', 'draft'), false);
    assert.equal(canTransition('cancelled', 'confirmed'), false);
  });

  it('yalnizca draft DOGRUDAN duzenlenebilir', () => {
    assert.equal(isDirectlyEditable('draft'), true);
    assert.equal(isDirectlyEditable('confirmed'), false);
  });

  it('onaylanmis sipariste degisiklik AMENDMENT gerektirir', () => {
    assert.equal(requiresAmendment('confirmed'), true);
    assert.equal(requiresAmendment('draft'), false);
  });

  it('TAMAMLANMIS siparis geriye donuk IPTAL EDILEMEZ', () => {
    const result = canCancel('confirmed', 'completed');
    assert.equal(result.allowed, false);
    assert.equal(
      result.allowed === false ? result.code : null,
      'order_completed_cannot_cancel',
    );
  });

  it('iptal edilmis siparis TEKRAR iptal edilemez', () => {
    assert.equal(canCancel('cancelled', 'unplanned').allowed, false);
  });

  it('planlanmis siparis iptal edilebilir', () => {
    assert.equal(canCancel('confirmed', 'planned').allowed, true);
  });

  it('sebep kategorisi registry disi olamaz; `other` aciklama ister', () => {
    assert.equal(isKnownCancellationCategory('customer_cancelled'), true);
    assert.equal(isKnownCancellationCategory('musteri_vazgecti'), false);
    assert.equal(cancellationNoteRequired('other'), true);
    assert.equal(cancellationNoteRequired('duplicate_order'), false);
  });
});

describe('Iptalin operasyon etkisi', () => {
  it('HENUZ PLANLANMAMIS siparis onay ISTEMEZ', () => {
    const impact = assessCancellationImpact({ assignments: [], tours: [] });
    assert.equal(impact.requiresConfirmation, false);
    assert.equal(impact.assignmentCount, 0);
  });

  it('bagli gorev varsa ACIK ONAY ister ve kayitlari GOSTERIR', () => {
    const impact = assessCancellationImpact({
      assignments: [
        { id: 'asg-1', status: 'planned' },
        { id: 'asg-2', status: 'in_progress' },
      ],
      tours: [],
    });
    assert.equal(impact.requiresConfirmation, true);
    assert.equal(impact.activeAssignmentCount, 1);
    assert.equal(impact.plannedAssignmentCount, 1);
    assert.deepEqual(impact.assignmentIds, ['asg-1', 'asg-2']);
  });

  it('yayinlanmis tur ACIK ONAY ister', () => {
    const impact = assessCancellationImpact({
      assignments: [],
      tours: [
        { id: 'tour-1', status: 'released' },
        { id: 'tour-2', status: 'draft' },
      ],
    });
    assert.equal(impact.releasedTourCount, 1);
    assert.equal(impact.requiresConfirmation, true);
    // Taslak tur sofore ACILMAMISTIR; listede yok.
    assert.deepEqual(impact.tourIds, ['tour-1']);
  });

  it('iptal edilmis gorevler etkiye SAYILMAZ', () => {
    const impact = assessCancellationImpact({
      assignments: [{ id: 'asg-1', status: 'cancelled' }],
      tours: [],
    });
    assert.equal(impact.requiresConfirmation, false);
  });
});

// ---------------------------------------------------------------------------
// Fulfillment
// ---------------------------------------------------------------------------

function fact(status: string, consignmentId: string | null = 'con-1'): AssignmentFact {
  return { id: `asg-${status}-${consignmentId}`, status, consignmentId };
}

describe('Fulfillment TURETILIR', () => {
  it('gorev yoksa `unplanned`', () => {
    assert.equal(deriveFulfillment({ consignmentCount: 1, assignments: [] }), 'unplanned');
  });

  it('kalemlerin BIR KISMI planliysa `partially_planned`', () => {
    const status = deriveFulfillment({
      consignmentCount: 3,
      assignments: [fact('planned', 'con-1'), fact('planned', 'con-2')],
    });
    assert.equal(status, 'partially_planned');
  });

  it('butun kalemler planliysa `planned`', () => {
    const status = deriveFulfillment({
      consignmentCount: 2,
      assignments: [fact('planned', 'con-1'), fact('planned', 'con-2')],
    });
    assert.equal(status, 'planned');
  });

  it('bir gorev basladiysa `in_progress`', () => {
    assert.equal(
      deriveFulfillment({ consignmentCount: 1, assignments: [fact('in_progress')] }),
      'in_progress',
    );
  });

  it('bir kisim bittiyse `partially_completed`', () => {
    const status = deriveFulfillment({
      consignmentCount: 2,
      assignments: [fact('completed', 'con-1'), fact('planned', 'con-2')],
    });
    assert.equal(status, 'partially_completed');
  });

  it('hepsi bittiyse `completed`', () => {
    const status = deriveFulfillment({
      consignmentCount: 2,
      assignments: [fact('completed', 'con-1'), fact('completed', 'con-2')],
    });
    assert.equal(status, 'completed');
  });

  it('EKSIK KALEM kapsamiyla `completed` DENMEZ', () => {
    // Uc kalem var, yalnizca ikisi icin gorev bitmis.
    const status = deriveFulfillment({
      consignmentCount: 3,
      assignments: [fact('completed', 'con-1'), fact('completed', 'con-2')],
    });
    assert.equal(status, 'partially_completed');
  });

  it('iptal edilmis gorevler sayilmaz', () => {
    const status = deriveFulfillment({
      consignmentCount: 1,
      assignments: [fact('cancelled', 'con-1')],
    });
    assert.equal(status, 'unplanned');
  });

  it('ticari durumdan BAGIMSIZ — `confirmed` siparis `unplanned` olabilir', () => {
    assert.equal(deriveFulfillment({ consignmentCount: 1, assignments: [] }), 'unplanned');
  });
});

// ---------------------------------------------------------------------------
// Fatura hazirligi
// ---------------------------------------------------------------------------

describe('Fatura uygunlugu — POD YOKKEN HAZIR DEGIL', () => {
  it('teslimat dogrulamasi FAZ 18\'e kadar BAGLI DEGIL', () => {
    const result = assessBilling({
      status: 'confirmed',
      billingMode: 'on_order_completion',
      fulfillment: 'completed',
      assignments: [fact('completed')],
    });
    assert.equal(result.deliveryVerificationAvailable, false);
  });

  it('butun gorevler bitse bile `verified` DEMIYORUZ', () => {
    const result = assessBilling({
      status: 'confirmed',
      billingMode: 'on_order_completion',
      fulfillment: 'completed',
      assignments: [fact('completed')],
    });
    // `unknown` bir "sorun yok" DEGILDIR.
    assert.equal(result.readiness, 'unknown');
    assert.equal(result.reason, 'delivery_not_verified');
    assert.notEqual(result.readiness as string, 'verified');
  });

  it('`on_order_completion`: butun teslimatlar bitmeden hazir degil', () => {
    const result = assessBilling({
      status: 'confirmed',
      billingMode: 'on_order_completion',
      fulfillment: 'partially_completed',
      assignments: [fact('completed', 'con-1'), fact('planned', 'con-2')],
    });
    assert.equal(result.readiness, 'not_ready');
    assert.equal(result.reason, 'no_completed_slice');
    assert.deepEqual(result.candidateAssignmentIds, []);
  });

  it('`per_delivery`: yalnizca BITMIS dilim aday olur', () => {
    const done = fact('completed', 'con-1');
    const result = assessBilling({
      status: 'confirmed',
      billingMode: 'per_delivery',
      fulfillment: 'partially_completed',
      assignments: [done, fact('planned', 'con-2')],
    });
    assert.equal(result.readiness, 'unknown');
    assert.deepEqual(result.candidateAssignmentIds, [done.id]);
  });

  it('onaylanmamis ve iptal edilmis siparis fatura adayi DEGIL', () => {
    assert.equal(
      assessBilling({
        status: 'draft',
        billingMode: 'per_delivery',
        fulfillment: 'completed',
        assignments: [fact('completed')],
      }).reason,
      'order_not_confirmed',
    );
    assert.equal(
      assessBilling({
        status: 'cancelled',
        billingMode: 'per_delivery',
        fulfillment: 'completed',
        assignments: [fact('completed')],
      }).reason,
      'order_cancelled',
    );
  });
});

// ---------------------------------------------------------------------------
// Gelir tahsisi
// ---------------------------------------------------------------------------

describe('Gelir tahsisi IZLENEBILIR', () => {
  it('tahsis toplami ve kalan hesaplanir', () => {
    const result = allocateRevenue({
      contractedRevenue: 1000,
      assignments: [
        { status: 'planned', expectedDailyRevenue: 400 },
        { status: 'planned', expectedDailyRevenue: 350 },
      ],
    });
    assert.equal(result.allocated, 750);
    assert.equal(result.remaining, 250);
    assert.equal(result.overAllocated, false);
  });

  it('ASIM isaretlenir', () => {
    const result = allocateRevenue({
      contractedRevenue: 500,
      assignments: [{ status: 'planned', expectedDailyRevenue: 600 }],
    });
    assert.equal(result.overAllocated, true);
    assert.equal(result.remaining, -100);
  });

  it('gelir GIRILMEMIS gorevler ayrica sayilir — 0 ile bos ayni sey degil', () => {
    const result = allocateRevenue({
      contractedRevenue: 1000,
      assignments: [
        { status: 'planned', expectedDailyRevenue: null },
        { status: 'planned', expectedDailyRevenue: 0 },
      ],
    });
    assert.equal(result.assignmentsWithoutRevenue, 1);
    assert.equal(result.allocated, 0);
  });

  it('sozlesme tutari yoksa kalan `null` — uydurulmaz', () => {
    const result = allocateRevenue({
      contractedRevenue: null,
      assignments: [{ status: 'planned', expectedDailyRevenue: 100 }],
    });
    assert.equal(result.remaining, null);
    assert.equal(result.overAllocated, false);
  });

  it('iptal edilmis gorevler tahsise girmez', () => {
    const result = allocateRevenue({
      contractedRevenue: 1000,
      assignments: [{ status: 'cancelled', expectedDailyRevenue: 900 }],
    });
    assert.equal(result.allocated, 0);
    assert.equal(result.assignmentCount, 0);
  });
});

describe('Eski revizyondan uretilmis gorev', () => {
  it('geride kalan gorev ISARETLENIR', () => {
    assert.equal(isStaleAgainstOrder({ sourceRevision: 1 }, 3), true);
  });

  it('guncel gorev isaretlenmez', () => {
    assert.equal(isStaleAgainstOrder({ sourceRevision: 3 }, 3), false);
  });

  it('siparisten URETILMEMIS gorev "eski" degildir', () => {
    assert.equal(isStaleAgainstOrder({ sourceRevision: null }, 5), false);
  });
});

// ---------------------------------------------------------------------------
// Revizyonlar
// ---------------------------------------------------------------------------

function consignment(overrides: Partial<ConsignmentSnapshot> = {}): ConsignmentSnapshot {
  return {
    sequence: 1,
    pickupAddress: 'Duisburg',
    pickupWindowStart: null,
    pickupWindowEnd: null,
    deliveryAddress: 'Hamburg',
    deliveryWindowStart: null,
    deliveryWindowEnd: null,
    cargoDescription: 'Paletten',
    quantity: '12.000',
    unit: 'pallet',
    weightKg: '8000.00',
    volumeM3: null,
    palletCount: 12,
    adrStatus: 'unknown',
    temperatureMinC: null,
    temperatureMaxC: null,
    shipperReference: null,
    consigneeReference: null,
    ...overrides,
  };
}

function snapshot(overrides: Partial<OrderSnapshot> = {}): OrderSnapshot {
  return {
    companyId: 'company-1',
    orderNumber: 'TO-2026-0001',
    externalReference: 'KD-4471',
    orderDate: '2026-08-19',
    currency: 'EUR',
    contractedRevenue: '2400.00',
    billingMode: 'on_order_completion',
    notes: null,
    consignments: [consignment()],
    ...overrides,
  };
}

describe('Revizyon numarasi ve durumu', () => {
  it('deterministik artar', () => {
    assert.equal(nextRevisionNumber(1), 2);
    assert.equal(nextRevisionNumber(7), 8);
  });

  it('draft degisikligi DOGRUDAN uygulanir', () => {
    assert.equal(revisionStatusFor('draft'), 'applied');
  });

  it('onaylanmis siparis degisikligi `pending_review` olur', () => {
    assert.equal(revisionStatusFor('confirmed'), 'pending_review');
  });

  it('AJAN CIKTISI dogrudan uygulanamaz', () => {
    assert.throws(
      () => assertAgentCannotApplyDirectly('email_agent', 'applied'),
      /non_manual_revision_must_be_pending_review/,
    );
    // Oneri olarak acilmasi serbest.
    assert.doesNotThrow(() => assertAgentCannotApplyDirectly('email_agent', 'pending_review'));
    // Manuel giris dogrudan uygulanabilir.
    assert.doesNotThrow(() => assertAgentCannotApplyDirectly('manual', 'applied'));
  });
});

describe('Eski/yeni karsilastirma', () => {
  it('degismeyen siparis BOS fark uretir', () => {
    assert.deepEqual(diffSnapshots(snapshot(), snapshot()), []);
    assert.equal(hasMeaningfulChange([]), false);
  });

  it('siparis alani degisikligi eski VE yeni degeri tasir', () => {
    const changes = diffSnapshots(
      snapshot(),
      snapshot({ contractedRevenue: '2900.00' }),
    );
    assert.equal(changes.length, 1);
    assert.deepEqual(changes[0], {
      field: 'contractedRevenue',
      before: '2400.00',
      after: '2900.00',
    });
  });

  it('kalem alani degisikligi YOLUYLA gorunur', () => {
    const changes = diffSnapshots(
      snapshot(),
      snapshot({ consignments: [consignment({ weightKg: '9500.00' })] }),
    );
    assert.deepEqual(changes, [
      { field: 'consignments[0].weightKg', before: '8000.00', after: '9500.00' },
    ]);
  });

  it('kalem EKLENMESI gorunur', () => {
    const changes = diffSnapshots(
      snapshot(),
      snapshot({ consignments: [consignment(), consignment({ sequence: 2 })] }),
    );
    assert.deepEqual(changes, [{ field: 'consignments[1]', before: null, after: 'added' }]);
  });

  it('kalem SILINMESI gorunur — sessizce kaybolmaz', () => {
    const changes = diffSnapshots(snapshot(), snapshot({ consignments: [] }));
    assert.deepEqual(changes, [{ field: 'consignments[0]', before: 'present', after: null }]);
  });

  it('birden fazla alan ayri ayri listelenir', () => {
    const changes = diffSnapshots(
      snapshot(),
      snapshot({ currency: 'CHF', externalReference: 'KD-9999' }),
    );
    assert.equal(changes.length, 2);
    assert.ok(changes.some((item) => item.field === 'currency'));
    assert.ok(changes.some((item) => item.field === 'externalReference'));
  });

  it('ADR degisikligi gorunur — `unknown` sessizce `no` olmaz', () => {
    const changes = diffSnapshots(
      snapshot(),
      snapshot({ consignments: [consignment({ adrStatus: 'no' })] }),
    );
    assert.deepEqual(changes, [
      { field: 'consignments[0].adrStatus', before: 'unknown', after: 'no' },
    ]);
  });
});
