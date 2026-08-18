/**
 * SIPARIS YASAM DONGUSU (Faz 15) — SAF mantik.
 *
 * TICARI DURUM ILE OPERASYON DURUMU AYRI. Bir siparis `confirmed` iken hic
 * planlanmamis olabilir; `draft` iken de bir plan taslagi hazirlanmis olabilir.
 * Ikisini tek alanda birlestirmek, "musteri onayladi mi" ile "arac yola cikti
 * mi" sorularini ayirt edilemez hale getirirdi.
 */

export type OrderStatus = 'draft' | 'confirmed' | 'cancelled';

export type LifecycleErrorCode =
  | 'order_not_draft'
  | 'order_already_confirmed'
  | 'order_cancelled'
  | 'order_completed_cannot_cancel'
  | 'order_not_amendable';

/**
 * Ticari gecisler.
 *
 * `cancelled` TERMINALDIR: iptal edilen siparis yeniden acilmaz. Yeniden
 * siparis, YENI bir kayittir — iptali geri almak, iptalin gercekten yasandigi
 * bir olay oldugunu inkar etmek olurdu.
 */
const ALLOWED: Record<OrderStatus, readonly OrderStatus[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['cancelled'],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED[from].includes(to);
}

/** Draft dogrudan duzenlenebilir; onaylanmis siparis YALNIZ amendment ile. */
export function isDirectlyEditable(status: OrderStatus): boolean {
  return status === 'draft';
}

/**
 * Degisiklik `pending_review` amendment gerektiriyor mu.
 *
 * Onaylanmis bir siparisi yerinde duzenlemek, musterinin onayladigi seyi
 * sessizce degistirmektir. Degisiklik once bir ONERI olur.
 */
export function requiresAmendment(status: OrderStatus): boolean {
  return status === 'confirmed';
}

/**
 * TAMAMLANMIS siparis geriye donuk IPTAL EDILEMEZ.
 *
 * Is yapildi, arac gitti, yakit yandi. Bunu "hic olmamis" saymak muhasebeyi
 * bozar. Duzeltme yolu credit-note'tur ve FAZ 19 kapsamindadir — bu fazda
 * bilincli olarak YOK.
 */
export function canCancel(
  status: OrderStatus,
  fulfillment: string,
): { allowed: true } | { allowed: false; code: LifecycleErrorCode } {
  if (status === 'cancelled') {
    return { allowed: false, code: 'order_cancelled' };
  }
  if (fulfillment === 'completed') {
    return { allowed: false, code: 'order_completed_cannot_cancel' };
  }
  return { allowed: true };
}

/** Iptal sebebi kategorisi ZORUNLU — serbest metinden degil. */
export const CANCELLATION_CATEGORIES = [
  'customer_cancelled',
  'duplicate_order',
  'created_in_error',
  'no_capacity',
  'price_disagreement',
  'other',
] as const;
export type CancellationCategory = (typeof CANCELLATION_CATEGORIES)[number];

export function isKnownCancellationCategory(value: unknown): value is CancellationCategory {
  return typeof value === 'string' && (CANCELLATION_CATEGORIES as readonly string[]).includes(value);
}

/** `other` secildiginde aciklama ZORUNLU: "diger" tek basina hicbir sey anlatmaz. */
export function cancellationNoteRequired(category: CancellationCategory): boolean {
  return category === 'other';
}

/**
 * IPTALIN OPERASYONA ETKISI.
 *
 * Iptal HICBIR `Assignment`, `Tour` ya da `TourStop` kaydini SILMEZ. Silseydi,
 * yola cikmis bir aracin gorevini sistemden yok etmis olurduk ve sofor ekraninda
 * is bir anda kaybolurdu.
 *
 * Etkilenen kayit varsa kullanici bunlari GORUR ve acikca onaylar.
 */
export interface CancellationImpact {
  assignmentCount: number;
  /** Planlanmis ama henuz baslamamis gorevler. */
  plannedAssignmentCount: number;
  /** Baslamis ya da bitmis gorevler — bunlar sessizce degistirilemez. */
  activeAssignmentCount: number;
  /** Yayinlanmis ya da yurumekte olan turlar. */
  releasedTourCount: number;
  /** Acik onay gerekiyor mu. */
  requiresConfirmation: boolean;
  /** Etkilenen kayitlarin kimlikleri — arayuz bunlari listeler. */
  assignmentIds: string[];
  tourIds: string[];
}

export interface ImpactInput {
  assignments: Array<{ id: string; status: string }>;
  tours: Array<{ id: string; status: string }>;
}

/** Baslamis sayilan gorev durumlari. */
const ACTIVE_ASSIGNMENT = new Set(['in_progress', 'completed']);
/** Sofore ACILMIS sayilan tur durumlari. */
const LIVE_TOUR = new Set(['released', 'in_progress']);

export function assessCancellationImpact(input: ImpactInput): CancellationImpact {
  const assignments = input.assignments.filter((item) => item.status !== 'cancelled');
  const active = assignments.filter((item) => ACTIVE_ASSIGNMENT.has(item.status));
  const planned = assignments.filter((item) => !ACTIVE_ASSIGNMENT.has(item.status));
  const liveTours = input.tours.filter((item) => LIVE_TOUR.has(item.status));

  return {
    assignmentCount: assignments.length,
    plannedAssignmentCount: planned.length,
    activeAssignmentCount: active.length,
    releasedTourCount: liveTours.length,
    // HENUZ PLANLANMAMIS siparis guvenle iptal edilir; digerleri onay ister.
    requiresConfirmation: assignments.length > 0 || liveTours.length > 0,
    assignmentIds: assignments.map((item) => item.id),
    tourIds: liveTours.map((item) => item.id),
  };
}
