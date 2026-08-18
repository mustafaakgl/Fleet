import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FINANCIAL_ORDER_FIELDS,
  FinancialFieldForbiddenError,
  assertCanWriteFinancials,
  canSeeOrderFinancials,
  maskOrderFinancials,
  maskOrderList,
} from './order-field-security';

/**
 * ALAN BAZLI FINANS KORUMASI (Faz 15).
 *
 * Roller REPODAN turetildi: `canViewFinancialFields` → `FINANCIAL_ROLES`
 * (admin, boss, accounting). OFFICE bilincli olarak DISARIDA — bu grup ayni
 * zamanda maas ve abonelik verisini koruyor.
 */

function order(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'order-1',
    orderNumber: 'TO-2026-0001',
    currency: 'EUR',
    contractedRevenue: '2400.00',
    billingMode: 'on_order_completion',
    revenueAllocation: { contracted: 2400, allocated: 900, remaining: 1500 },
    fulfillment: 'planned',
    assignments: [
      { id: 'asg-1', status: 'planned', expectedDailyRevenue: '900.00' },
    ],
    revisions: [
      {
        id: 'rev-2',
        revisionNumber: 2,
        changedFields: [
          { field: 'contractedRevenue', before: '2400.00', after: '2900.00' },
          { field: 'notes', before: null, after: 'Eilig' },
        ],
      },
    ],
    ...overrides,
  };
}

describe('Finansal gorunurluk rollerden TURETILIR', () => {
  it('admin, boss ve accounting gorur', () => {
    for (const role of ['admin', 'boss', 'accounting']) {
      assert.equal(canSeeOrderFinancials(role), true, role);
    }
  });

  it('OFFICE gormez', () => {
    assert.equal(canSeeOrderFinancials('office'), false);
  });

  it('rolsuz ve bilinmeyen rol gormez', () => {
    assert.equal(canSeeOrderFinancials(null), false);
    assert.equal(canSeeOrderFinancials(undefined), false);
    assert.equal(canSeeOrderFinancials('driver'), false);
  });
});

describe('Yanit maskeleme — SUNUCUDA', () => {
  it('finansal roller icin yanit DEGISMEZ', () => {
    const payload = order();
    assert.deepEqual(maskOrderFinancials(payload, 'accounting'), payload);
  });

  it('office icin butun finansal alanlar `null`', () => {
    const masked = maskOrderFinancials(order(), 'office');
    for (const field of FINANCIAL_ORDER_FIELDS) {
      assert.equal(masked[field], null, `${field} sizdi`);
    }
  });

  it('alan SILINMEZ, `null` yazilir — "yetki yok" ile "bos" ayri seyler', () => {
    const masked = maskOrderFinancials(order(), 'office');
    assert.ok('contractedRevenue' in masked);
    assert.equal(masked.financialFieldsMasked, true);
  });

  it('operasyon alanlari DOKUNULMAZ', () => {
    const masked = maskOrderFinancials(order(), 'office');
    assert.equal(masked.fulfillment, 'planned');
    assert.equal(masked.orderNumber, 'TO-2026-0001');
  });

  it('GOREV duzeyindeki gelir de maskelenir', () => {
    const masked = maskOrderFinancials(order(), 'office');
    const assignments = masked.assignments as Array<Record<string, unknown>>;
    assert.equal(assignments[0]!.expectedDailyRevenue, null);
    // Operasyon alani yerinde.
    assert.equal(assignments[0]!.status, 'planned');
  });

  it('REVIZYON GECMISI de sizdirmaz — eski/yeni tutar maskelenir', () => {
    const masked = maskOrderFinancials(order(), 'office');
    const revisions = masked.revisions as Array<Record<string, unknown>>;
    const changes = revisions[0]!.changedFields as Array<Record<string, unknown>>;

    const financial = changes.find((item) => item.field === 'contractedRevenue');
    assert.equal(financial!.before, null);
    assert.equal(financial!.after, null);
    assert.equal(financial!.masked, true);

    // Finansal OLMAYAN degisiklik gorunur kalir.
    const note = changes.find((item) => item.field === 'notes');
    assert.equal(note!.after, 'Eilig');
  });

  it('office yanitinda hicbir yerde tutar KALMAZ', () => {
    const serialized = JSON.stringify(maskOrderFinancials(order(), 'office'));
    assert.ok(!serialized.includes('2400'), 'sozlesme tutari sizdi');
    assert.ok(!serialized.includes('2900'), 'revizyon tutari sizdi');
    assert.ok(!serialized.includes('900.00'), 'gorev geliri sizdi');
  });

  it('liste de maskelenir', () => {
    const masked = maskOrderList([order(), order({ id: 'order-2' })], 'office');
    assert.equal(masked.length, 2);
    for (const row of masked) {
      assert.equal(row.contractedRevenue, null);
    }
  });
});

describe('Yazma korumasi — SESSIZCE DUSURULMEZ, REDDEDILIR', () => {
  it('office finansal alan YAZAMAZ', () => {
    assert.throws(
      () => assertCanWriteFinancials('office', { contractedRevenue: 5000 }),
      FinancialFieldForbiddenError,
    );
    assert.throws(
      () => assertCanWriteFinancials('office', { currency: 'CHF' }),
      FinancialFieldForbiddenError,
    );
    assert.throws(
      () => assertCanWriteFinancials('office', { billingMode: 'per_delivery' }),
      FinancialFieldForbiddenError,
    );
  });

  it('hata HANGI alanlarin reddedildigini soyler', () => {
    try {
      assertCanWriteFinancials('office', { contractedRevenue: 1, currency: 'EUR' });
      assert.fail('reddedilmedi');
    } catch (error) {
      assert.ok(error instanceof FinancialFieldForbiddenError);
      assert.deepEqual([...error.fields].sort(), ['contractedRevenue', 'currency']);
    }
  });

  it('office OPERASYON alani yazabilir', () => {
    assert.doesNotThrow(() =>
      assertCanWriteFinancials('office', { orderNumber: 'TO-1', notes: 'Eilig' }),
    );
  });

  it('finansal rol serbestce yazar', () => {
    assert.doesNotThrow(() =>
      assertCanWriteFinancials('accounting', { contractedRevenue: 5000, currency: 'CHF' }),
    );
  });

  it('alan GONDERILMEMISSE engel yok', () => {
    assert.doesNotThrow(() => assertCanWriteFinancials('office', {}));
    assert.doesNotThrow(() =>
      assertCanWriteFinancials('office', { contractedRevenue: undefined }),
    );
  });
});
