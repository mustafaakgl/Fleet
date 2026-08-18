import type { Tone } from './ordivan-view';
import type {
  DocumentTypeKey,
  IntakeDocumentRow,
  IntakeDocumentStatus,
  IntakeRoutingPlan,
} from './types';

/**
 * BELGE GELEN KUTUSU — SAF GORUNUM MANTIGI (Faz 14).
 *
 * Bilesenden AYRI tutuluyor cunku buradaki kurallar test edilebilir olmali:
 * hangi belge dusuk guvenli sayilir, ekranda ne yazacagiz, kullanici neyi
 * duzeltmeden onaylayamaz. Bunlar JSX'in icine gomulseydi, ancak ekran
 * uzerinden dolayli olarak test edilebilirlerdi.
 */

/** Bu esigin altindaki guven "dusuk" sayilir — Faz 12/13 ile AYNI esik. */
export const LOW_CONFIDENCE = 0.7;

export const DOCUMENT_TYPE_KEYS: DocumentTypeKey[] = [
  'service_invoice@v1',
  'vehicle_inspection@v1',
  'vehicle_insurance@v1',
  'traffic_fine@v1',
  'fuel_receipt@v1',
  'unknown@v1',
];

/** Surumsuz aile adi — i18n anahtari icin. `service_invoice@v1` → `service_invoice`. */
export function typeFamily(typeKey: string): string {
  return typeKey.split('@')[0] ?? typeKey;
}

export function documentTypeLabelKey(typeKey: string): string {
  return `documentInbox.type.${typeFamily(typeKey)}`;
}

export function statusLabelKey(status: IntakeDocumentStatus): string {
  return `documentInbox.status.${status}`;
}

export function statusTone(status: IntakeDocumentStatus): Tone {
  switch (status) {
    case 'routed':
      return 'positive';
    case 'rejected':
    case 'failed':
      return 'danger';
    case 'needs_domain_review':
      return 'warning';
    default:
      return 'neutral';
  }
}

export function sourceLabelKey(source: string): string {
  return `documentInbox.source.${source}`;
}

/** Guven dusuk mu — `null` da DUSUK sayilir: bilmiyorsak guvenmiyoruz. */
export function isLowConfidence(confidence: number | null | undefined): boolean {
  return confidence === null || confidence === undefined || confidence < LOW_CONFIDENCE;
}

/** `unknown` tur DAIMA vurgulanir: hedefi yok, kullanici secmeli. */
export function needsAttention(row: Pick<IntakeDocumentRow, 'typeKey' | 'confidence' | 'status'>): boolean {
  if (row.status === 'needs_domain_review' || row.status === 'failed') return true;
  if (typeFamily(row.typeKey) === 'unknown') return true;
  return isLowConfidence(row.confidence);
}

/**
 * "Onaylandiginda ne olacak?" ozetinin i18n anahtari.
 *
 * Hedefin KENDI incelemesi varsa BASKA bir cumle donuyor: kullanicinin
 * "onayladim, gider olustu" sanmasi, muhasebe onayinin varligini gorunmez
 * kilardi.
 */
export function planSummaryKey(plan: IntakeRoutingPlan): string {
  if (!plan.destination) {
    return 'documentInbox.plan.none';
  }
  return plan.entersOwnReviewQueue
    ? `documentInbox.plan.review.${plan.destination}`
    : `documentInbox.plan.direct.${plan.destination}`;
}

/** Engelin kullaniciya gosterilecek sebebi. */
export function blockReasonKey(reason: IntakeRoutingPlan['blockedBy'][number]): string {
  return `documentInbox.blocked.${reason}`;
}

export interface SegmentDraft {
  pageFrom: number;
  pageTo: number;
  typeKey?: string;
}

export type SegmentErrorCode =
  | 'page_range_empty'
  | 'page_range_reversed'
  | 'page_range_out_of_bounds'
  | 'page_range_overlap';

/**
 * Bolumlemenin ISTEMCI tarafi dogrulamasi.
 *
 * SUNUCU SON MERCI: ayni kural `document-pages.ts`te de var ve istek oradan
 * gecmek zorunda. Buradaki kopya yalnizca kullaniciya ANINDA geri bildirim
 * icin — arayuzun "kaydet"e basana kadar susmasi kotu bir deneyim olurdu.
 */
export function validateSegments(
  segments: SegmentDraft[],
  pageCount: number,
): SegmentErrorCode | null {
  if (segments.length === 0) return 'page_range_empty';

  for (const segment of segments) {
    if (!Number.isInteger(segment.pageFrom) || !Number.isInteger(segment.pageTo)) {
      return 'page_range_reversed';
    }
    if (segment.pageFrom > segment.pageTo) return 'page_range_reversed';
    if (segment.pageFrom < 1 || segment.pageTo > pageCount) return 'page_range_out_of_bounds';
  }

  const sorted = [...segments].sort((left, right) => left.pageFrom - right.pageFrom);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index]!.pageFrom <= sorted[index - 1]!.pageTo) return 'page_range_overlap';
  }

  return null;
}

/** Tek sayfada kisa etiket: `4`; aralikta `1-3`. */
export function formatPageRange(pageFrom: number, pageTo: number): string {
  return pageFrom === pageTo ? String(pageFrom) : `${pageFrom}-${pageTo}`;
}

/** Bir belgeyi ikiye bolen taslak — arayuzun "bol" dugmesi bunu kullanir. */
export function splitAt(segment: SegmentDraft, page: number): SegmentDraft[] | null {
  if (page <= segment.pageFrom || page > segment.pageTo) return null;
  return [
    { pageFrom: segment.pageFrom, pageTo: page - 1, typeKey: segment.typeKey },
    { pageFrom: page, pageTo: segment.pageTo, typeKey: segment.typeKey },
  ];
}

/** Ardisik iki parcayi birlestirir. Ardisik degillerse `null`. */
export function mergeSegments(left: SegmentDraft, right: SegmentDraft): SegmentDraft | null {
  const [first, second] = left.pageFrom <= right.pageFrom ? [left, right] : [right, left];
  if (second.pageFrom !== first.pageTo + 1) return null;
  return { pageFrom: first.pageFrom, pageTo: second.pageTo, typeKey: first.typeKey };
}

/** Muayene alt turu secilebilir mi — yalnizca muayenede. */
export function supportsSubtype(typeKey: string): boolean {
  return typeFamily(typeKey) === 'vehicle_inspection';
}

/** Yakit fisi surucu ZORUNLU kilar; digerleri kilmaz. */
export function requiresDriver(typeKey: string): boolean {
  return typeFamily(typeKey) === 'fuel_receipt';
}
