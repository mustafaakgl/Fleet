/**
 * FULFILLMENT — TURETILIR, SAKLANMAZ (Faz 15) — SAF mantik.
 *
 * Siparisin operasyon durumu `Assignment` gerceklerinden HESAPLANIR; ayri bir
 * sutunda tutulmaz. Saklansaydi, bir gorev tamamlandiginda siparisi guncellemek
 * ayri bir is olurdu ve o is bir gun atlanirdi — sonra da hangisinin dogru
 * oldugunu kimse bilemezdi.
 *
 * TICARI DURUMLA KARISTIRILMAZ: `confirmed` bir siparis `unplanned` olabilir.
 */

export const FULFILLMENT_STATUSES = [
  'unplanned',
  'partially_planned',
  'planned',
  'in_progress',
  'partially_completed',
  'completed',
] as const;
export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];

export interface AssignmentFact {
  id: string;
  status: string;
  consignmentId: string | null;
}

export interface FulfillmentInput {
  /** Siparisteki kalem sayisi. Planlamanin "tamam" sayilmasi buna gore. */
  consignmentCount: number;
  assignments: AssignmentFact[];
}

/**
 * Operasyon durumunu gorevlerden turetir.
 *
 * `partially_planned` ile `planned` ayrimi KALEM KAPSAMINA gore: bir siparisin
 * uc kalemi varsa ve yalnizca ikisi planlandiysa, siparis "planlandi" DEGILDIR.
 * Bu ayrimi kaybetmek, bir kalemin sessizce unutulmasi demektir.
 */
export function deriveFulfillment(input: FulfillmentInput): FulfillmentStatus {
  const live = input.assignments.filter((item) => item.status !== 'cancelled');

  if (live.length === 0) {
    return 'unplanned';
  }

  const completed = live.filter((item) => item.status === 'completed');
  const started = live.filter(
    (item) => item.status === 'in_progress' || item.status === 'completed',
  );

  // Kapsam: kac kalem icin gorev var. Kalemsiz sipariste gorev varligi yeter.
  const coveredConsignments = new Set(
    live.map((item) => item.consignmentId).filter((value): value is string => value !== null),
  );
  const fullyCovered =
    input.consignmentCount === 0 || coveredConsignments.size >= input.consignmentCount;

  if (completed.length === live.length && fullyCovered) {
    return 'completed';
  }
  if (completed.length > 0) {
    return 'partially_completed';
  }
  if (started.length > 0) {
    return 'in_progress';
  }
  return fullyCovered ? 'planned' : 'partially_planned';
}

/**
 * FATURA UYGUNLUGU (Faz 15) — HENUZ HAZIR DEGIL.
 *
 * `verified`: teslimat DOGRULANDI (POD/CMR ile).
 * `not_ready`: gerekli kosullar saglanmadi.
 * `unknown`: OLCEMEDIK. "Sorun yok" DEMEK DEGILDIR.
 *
 * POD/CMR dogrulamasi FAZ 18'de bagalanacak. O gune kadar hicbir siparis
 * "faturaya hazir" GORUNMEZ — bir turun ya da gorevin bitmesi, musteriye
 * teslim edildigi anlamina gelmez. `completed` bir gorevi teslimat kaniti
 * saymak, elinde imzali evrak olmadan fatura kesmektir.
 */
export type BillingReadiness = 'not_ready' | 'unknown';

export interface BillingAssessment {
  readiness: BillingReadiness;
  /** Neden hazir degil — arayuz bunu kullaniciya acikca yaziyor. */
  reason:
    | 'order_not_confirmed'
    | 'order_cancelled'
    | 'delivery_not_verified'
    | 'no_completed_slice';
  /** `per_delivery` modda fatura ADAYI olabilecek dilimler. */
  candidateAssignmentIds: string[];
  /** POD dogrulamasi bagli mi — Faz 18'e kadar DAIMA false. */
  deliveryVerificationAvailable: boolean;
}

export interface BillingInput {
  status: 'draft' | 'confirmed' | 'cancelled';
  billingMode: 'on_order_completion' | 'per_delivery';
  fulfillment: FulfillmentStatus;
  assignments: AssignmentFact[];
}

export function assessBilling(input: BillingInput): BillingAssessment {
  const base = {
    candidateAssignmentIds: [] as string[],
    // FAZ 18'E KADAR DAIMA FALSE. Bu bayrak acilmadan hicbir sey "dogrulandi"
    // sayilamaz ve arayuz bunu gizlemek yerine ACIKCA yaziyor.
    deliveryVerificationAvailable: false,
  };

  if (input.status === 'cancelled') {
    return { ...base, readiness: 'not_ready', reason: 'order_cancelled' };
  }
  if (input.status !== 'confirmed') {
    return { ...base, readiness: 'not_ready', reason: 'order_not_confirmed' };
  }

  const completed = input.assignments.filter((item) => item.status === 'completed');

  if (input.billingMode === 'on_order_completion') {
    if (input.fulfillment !== 'completed') {
      return { ...base, readiness: 'not_ready', reason: 'no_completed_slice' };
    }
    // Butun gorevler bitti — ama TESLIMAT DOGRULANMADI. `unknown`, `verified`
    // DEGILDIR ve fatura burada acilmaz.
    return {
      ...base,
      readiness: 'unknown',
      reason: 'delivery_not_verified',
      candidateAssignmentIds: completed.map((item) => item.id),
    };
  }

  // per_delivery: yalnizca BITMIS dilimler aday olabilir.
  if (completed.length === 0) {
    return { ...base, readiness: 'not_ready', reason: 'no_completed_slice' };
  }
  return {
    ...base,
    readiness: 'unknown',
    reason: 'delivery_not_verified',
    candidateAssignmentIds: completed.map((item) => item.id),
  };
}

/**
 * GELIR TAHSISI — izlenebilir olmali.
 *
 * Siparis geliri `TransportOrder`da, dilime ayrilan pay `Assignment`ta
 * (`expectedDailyRevenue`). Bu fonksiyon ikisini karsilastirip FARKI gorunur
 * kiliyor: toplam tahsis sozlesme tutarini asiyorsa ya da altinda kaliyorsa,
 * bu bir hata olmayabilir (henuz her dilim planlanmamis olabilir) ama
 * GORUNMEZ de olmamali.
 */
export interface RevenueAllocation {
  contracted: number | null;
  allocated: number;
  /** `contracted - allocated`. Sozlesme tutari yoksa `null`. */
  remaining: number | null;
  /** Tahsis sozlesme tutarini ASIYOR mu — arayuz bunu isaretler. */
  overAllocated: boolean;
  assignmentCount: number;
  /** Gelir girilmemis gorev sayisi — "0" ile "bos" ayri seylerdir. */
  assignmentsWithoutRevenue: number;
}

export function allocateRevenue(input: {
  contractedRevenue: number | null;
  assignments: Array<{ status: string; expectedDailyRevenue: number | null }>;
}): RevenueAllocation {
  const live = input.assignments.filter((item) => item.status !== 'cancelled');
  const withRevenue = live.filter((item) => item.expectedDailyRevenue !== null);
  const allocated = withRevenue.reduce(
    (total, item) => total + (item.expectedDailyRevenue ?? 0),
    0,
  );
  const rounded = Number(allocated.toFixed(2));

  return {
    contracted: input.contractedRevenue,
    allocated: rounded,
    remaining:
      input.contractedRevenue === null
        ? null
        : Number((input.contractedRevenue - rounded).toFixed(2)),
    overAllocated: input.contractedRevenue !== null && rounded > input.contractedRevenue + 0.005,
    assignmentCount: live.length,
    assignmentsWithoutRevenue: live.length - withRevenue.length,
  };
}

/**
 * Gorev GUNCEL siparis revizyonundan mi uretildi.
 *
 * `sourceRevision` geride kaldiysa plan eski siparise gore yapilmistir. Bu
 * OTOMATIK DUZELTILMEZ: yola cikmis bir gorevi sessizce degistirmek, sofora
 * haber vermeden isini degistirmektir. Yalnizca ISARETLENIR.
 */
export function isStaleAgainstOrder(
  assignment: { sourceRevision: number | null },
  currentRevision: number,
): boolean {
  if (assignment.sourceRevision === null) {
    // Siparisten uretilmemis gorev "eski" DEGILDIR — hic ondan turememistir.
    return false;
  }
  return assignment.sourceRevision < currentRevision;
}
