import { describe, expect, it } from 'vitest';
import {
  adrNeedsAttention,
  amendActionKey,
  billingIsBlocking,
  billingLabelKey,
  canSubmitCancellation,
  cancellationNoteRequired,
  changeConsignmentIndex,
  changeFieldLabelKey,
  changeIsMasked,
  financialsMasked,
  formatOrderAmount,
  fulfillmentTone,
  orderStatusTone,
  pendingRevision,
  revenueNeedsAttention,
  staleAssignments,
} from './transport-order-view';
import type { OrderBillingAssessment, TransportOrderRevision } from './types';

/** Ekranin kurallari — bilesenden AYRI test ediliyor. */

describe('durum tonlari', () => {
  it('ticari ve operasyon tonlari AYRI hesaplanir', () => {
    expect(orderStatusTone('confirmed')).toBe('positive');
    expect(orderStatusTone('cancelled')).toBe('danger');
    expect(orderStatusTone('draft')).toBe('neutral');
  });

  it('`completed` fulfillment YESIL DEGIL — teslimat dogrulanmadi', () => {
    // Yesil rozet "her sey tamam" der; POD baglanmadan bu iddia edilemez.
    expect(fulfillmentTone('completed')).toBe('neutral');
    expect(fulfillmentTone('in_progress')).toBe('warning');
  });
});

describe('fatura hazirligi', () => {
  const billing = (overrides: Partial<OrderBillingAssessment> = {}): OrderBillingAssessment => ({
    readiness: 'unknown',
    reason: 'delivery_not_verified',
    candidateAssignmentIds: [],
    deliveryVerificationAvailable: false,
    ...overrides,
  });

  it('POD baglanmadikca DAIMA engelleyici', () => {
    expect(billingIsBlocking(billing())).toBe(true);
    expect(billingIsBlocking(billing({ reason: 'no_completed_slice' }))).toBe(true);
  });

  it('sebep i18n anahtarina cevrilir', () => {
    expect(billingLabelKey(billing())).toBe('transportOrders.billing.delivery_not_verified');
  });
});

describe('finansal maskeleme', () => {
  it('maskeli ile BOS ayri gosterilir', () => {
    expect(formatOrderAmount('2400.00', 'EUR', true)).toEqual({ kind: 'masked' });
    expect(formatOrderAmount(null, 'EUR', false)).toEqual({ kind: 'empty' });
    expect(formatOrderAmount('2400.00', 'EUR', false)).toEqual({
      kind: 'value',
      text: '2400.00 EUR',
    });
  });

  it('para birimi yoksa yalnizca tutar gosterilir', () => {
    expect(formatOrderAmount('2400.00', null, false)).toEqual({ kind: 'value', text: '2400.00' });
  });

  it('maskeleme bayragi okunur', () => {
    expect(financialsMasked({ financialFieldsMasked: true })).toBe(true);
    expect(financialsMasked({})).toBe(false);
  });

  it('maskeli degisiklik satiri isaretlenir', () => {
    expect(changeIsMasked({ field: 'contractedRevenue', before: null, after: null, masked: true })).toBe(
      true,
    );
    expect(changeIsMasked({ field: 'notes', before: null, after: 'x' })).toBe(false);
  });
});

describe('degisiklik alan yollari', () => {
  it('kalem yolu numaraya cevrilir', () => {
    expect(changeConsignmentIndex('consignments[0].weightKg')).toBe(1);
    expect(changeConsignmentIndex('contractedRevenue')).toBeNull();
  });

  it('alan anahtari kalem yolundan cikarilir', () => {
    expect(changeFieldLabelKey('consignments[1].weightKg')).toBe('transportOrders.field.weightKg');
    expect(changeFieldLabelKey('consignments[1]')).toBe('transportOrders.field.consignment');
    expect(changeFieldLabelKey('currency')).toBe('transportOrders.field.currency');
  });
});

describe('gelir tahsisi uyarisi', () => {
  it('ASIM ve GELIRSIZ gorev uyari verir', () => {
    expect(
      revenueNeedsAttention({
        contracted: 100,
        allocated: 150,
        remaining: -50,
        overAllocated: true,
        assignmentCount: 1,
        assignmentsWithoutRevenue: 0,
      }),
    ).toBe(true);
    expect(
      revenueNeedsAttention({
        contracted: 100,
        allocated: 50,
        remaining: 50,
        overAllocated: false,
        assignmentCount: 2,
        assignmentsWithoutRevenue: 1,
      }),
    ).toBe(true);
  });

  it('dengeli tahsis uyari vermez', () => {
    expect(
      revenueNeedsAttention({
        contracted: 100,
        allocated: 100,
        remaining: 0,
        overAllocated: false,
        assignmentCount: 1,
        assignmentsWithoutRevenue: 0,
      }),
    ).toBe(false);
  });

  it('maskeliyse (null) uyari yok', () => {
    expect(revenueNeedsAttention(null)).toBe(false);
  });
});

describe('ADR', () => {
  it('`unknown` GUVENLI SAYILMAZ — isaretlenir', () => {
    expect(adrNeedsAttention('unknown')).toBe(true);
    expect(adrNeedsAttention('yes')).toBe(true);
    expect(adrNeedsAttention('no')).toBe(false);
  });
});

describe('revizyon yardimcilari', () => {
  const revision = (overrides: Partial<TransportOrderRevision>): TransportOrderRevision => ({
    id: 'rev-1',
    revisionNumber: 1,
    status: 'applied',
    changedFields: [],
    source: 'manual',
    createdAt: '2026-08-19T09:00:00.000Z',
    decidedAt: null,
    rejectionReason: null,
    ...overrides,
  });

  it('bekleyen oneri bulunur', () => {
    const found = pendingRevision({
      revisions: [revision({}), revision({ id: 'rev-2', revisionNumber: 2, status: 'pending_review' })],
    });
    expect(found?.id).toBe('rev-2');
  });

  it('bekleyen yoksa null', () => {
    expect(pendingRevision({ revisions: [revision({ status: 'rejected' })] })).toBeNull();
  });

  it('eski revizyondan uretilmis gorevler suzulur', () => {
    const stale = staleAssignments({
      assignments: [
        { id: 'a', staleAgainstOrder: true } as never,
        { id: 'b', staleAgainstOrder: false } as never,
      ],
    });
    expect(stale).toHaveLength(1);
  });

  it('buton metni ticari duruma gore degisir', () => {
    expect(amendActionKey('draft')).toBe('transportOrders.amend.applyChange');
    expect(amendActionKey('confirmed')).toBe('transportOrders.amend.proposeChange');
  });
});

describe('iptal formu', () => {
  it('sebep secilmeden gonderilemez', () => {
    expect(
      canSubmitCancellation({ category: '', note: '', requiresConfirmation: false, acknowledged: false }),
    ).toBe(false);
  });

  it('`other` ACIKLAMA ister', () => {
    expect(cancellationNoteRequired('other')).toBe(true);
    expect(
      canSubmitCancellation({
        category: 'other',
        note: 'kisa',
        requiresConfirmation: false,
        acknowledged: false,
      }),
    ).toBe(false);
    expect(
      canSubmitCancellation({
        category: 'other',
        note: 'Musteri vazgecti',
        requiresConfirmation: false,
        acknowledged: false,
      }),
    ).toBe(true);
  });

  it('ETKILENEN KAYIT VARSA acik onay olmadan gonderilemez', () => {
    expect(
      canSubmitCancellation({
        category: 'customer_cancelled',
        note: '',
        requiresConfirmation: true,
        acknowledged: false,
      }),
    ).toBe(false);
    expect(
      canSubmitCancellation({
        category: 'customer_cancelled',
        note: '',
        requiresConfirmation: true,
        acknowledged: true,
      }),
    ).toBe(true);
  });
});
