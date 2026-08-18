import type { Tone } from './ordivan-view';
import type {
  FulfillmentStatus,
  OrderBillingAssessment,
  OrderFieldChange,
  OrderRevenueAllocation,
  TransportOrderDetail,
  TransportOrderRow,
  TransportOrderStatus,
} from './types';

/**
 * TICARI SIPARIS — SAF GORUNUM MANTIGI (Faz 15).
 *
 * Bilesenden AYRI: "hangi rozet", "ne zaman uyari", "kullanici neyi
 * onaylayamaz" kararlari test edilebilir olmali. JSX'in icine gomulseydi
 * ancak ekran uzerinden dolayli olarak test edilebilirlerdi.
 */

export const ORDER_STATUSES: TransportOrderStatus[] = ['draft', 'confirmed', 'cancelled'];

export const FULFILLMENT_STATUSES: FulfillmentStatus[] = [
  'unplanned',
  'partially_planned',
  'planned',
  'in_progress',
  'partially_completed',
  'completed',
];

export const CANCELLATION_CATEGORIES = [
  'customer_cancelled',
  'duplicate_order',
  'created_in_error',
  'no_capacity',
  'price_disagreement',
  'other',
] as const;

export function orderStatusLabelKey(status: TransportOrderStatus): string {
  return `transportOrders.status.${status}`;
}

export function fulfillmentLabelKey(status: FulfillmentStatus): string {
  return `transportOrders.fulfillment.${status}`;
}

/** Ticari durum tonu. `cancelled` notr degil, KAPALI bir sonuc. */
export function orderStatusTone(status: TransportOrderStatus): Tone {
  if (status === 'confirmed') return 'positive';
  if (status === 'cancelled') return 'danger';
  return 'neutral';
}

/**
 * Fulfillment tonu.
 *
 * `completed` bile POZITIF DEGIL, notr: gorevlerin bitmesi teslimatin
 * dogrulandigi anlamina gelmez ve yesil bir rozet tam da bunu ima ederdi.
 */
export function fulfillmentTone(status: FulfillmentStatus): Tone {
  if (status === 'in_progress') return 'warning';
  return 'neutral';
}

/**
 * Fatura hazirlik metni.
 *
 * `verified` DIYE BIR DEGER YOK ve olmayacak: POD dogrulamasi Faz 18'de
 * baglanacak. O gune kadar ekran bunu GIZLEMEZ, ACIKCA yazar.
 */
export function billingLabelKey(billing: OrderBillingAssessment): string {
  return `transportOrders.billing.${billing.reason}`;
}

export function billingIsBlocking(billing: OrderBillingAssessment): boolean {
  return !billing.deliveryVerificationAvailable;
}

/** Finansal alan gizlenmis mi — "girilmemis" ile ayni sey DEGIL. */
export function financialsMasked(order: Pick<TransportOrderRow, 'financialFieldsMasked'>): boolean {
  return order.financialFieldsMasked === true;
}

/**
 * Tutar gosterimi.
 *
 * Maskeliyse `null` doner ve arayuz "gorme yetkiniz yok" der; deger gercekten
 * bossa ayri bir metin gosterilir. Ikisini ayni gostermek, muhasebeye "fiyat
 * girilmemis" dedirtirdi.
 */
export function formatOrderAmount(
  amount: string | null,
  currency: string | null,
  masked: boolean,
): { kind: 'masked' } | { kind: 'empty' } | { kind: 'value'; text: string } {
  if (masked) return { kind: 'masked' };
  if (amount === null) return { kind: 'empty' };
  return { kind: 'value', text: currency ? `${amount} ${currency}` : amount };
}

/** Bekleyen degisiklik onerisi var mi. */
export function pendingRevision(order: Pick<TransportOrderDetail, 'revisions'>) {
  return order.revisions.find((item) => item.status === 'pending_review') ?? null;
}

/** Guncel siparisten geride kalmis gorevler. */
export function staleAssignments(order: Pick<TransportOrderDetail, 'assignments'>) {
  return order.assignments.filter((item) => item.staleAgainstOrder);
}

/** Degisiklik satirinin gosterilebilir olup olmadigi. */
export function changeIsMasked(change: OrderFieldChange): boolean {
  return change.masked === true;
}

/** Alan adinin i18n anahtari. `consignments[0].weightKg` → kalem yolu korunur. */
export function changeFieldLabelKey(field: string): string {
  const match = field.match(/^consignments\[(\d+)\](?:\.(.+))?$/);
  if (!match) return `transportOrders.field.${field}`;
  return match[2] ? `transportOrders.field.${match[2]}` : 'transportOrders.field.consignment';
}

export function changeConsignmentIndex(field: string): number | null {
  const match = field.match(/^consignments\[(\d+)\]/);
  return match ? Number(match[1]) + 1 : null;
}

/** Gelir tahsisi uyari veriyor mu. */
export function revenueNeedsAttention(allocation: OrderRevenueAllocation | null): boolean {
  if (!allocation) return false;
  return allocation.overAllocated || allocation.assignmentsWithoutRevenue > 0;
}

/** `unknown` ADR GUVENLI SAYILMAZ — listede ve detayda isaretlenir. */
export function adrNeedsAttention(adrStatus: string): boolean {
  return adrStatus === 'unknown' || adrStatus === 'yes';
}

export function adrLabelKey(adrStatus: string): string {
  return `transportOrders.adr.${adrStatus}`;
}

/** Iptal `other` sebebi ACIKLAMA ister. */
export function cancellationNoteRequired(category: string): boolean {
  return category === 'other';
}

/** Iptal formu gonderilebilir mi. */
export function canSubmitCancellation(input: {
  category: string;
  note: string;
  requiresConfirmation: boolean;
  acknowledged: boolean;
}): boolean {
  if (!input.category) return false;
  if (cancellationNoteRequired(input.category) && input.note.trim().length < 5) return false;
  // ETKILENEN KAYIT VARSA acik onay olmadan gonderilemez.
  if (input.requiresConfirmation && !input.acknowledged) return false;
  return true;
}

/** Onaylanmis sipariste degisiklik ONERI olur — buton metni de degisir. */
export function amendActionKey(status: TransportOrderStatus): string {
  return status === 'confirmed'
    ? 'transportOrders.amend.proposeChange'
    : 'transportOrders.amend.applyChange';
}
