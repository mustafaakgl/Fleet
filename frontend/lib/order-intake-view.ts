import type { OrderIntakeIntent } from './types';

/**
 * SIPARIS GELEN KUTUSU — SAF GORUNUM MANTIGI (Faz 16).
 *
 * Bilesenden AYRI: burada test edilebilir, saf kurallar duruyor. Hicbiri bir
 * guvenlik siniri DEGIL — maskeleme ve eslestirme sunucuda yapiliyor; buradaki
 * tek is, sunucunun soyledigini dogru gostermek.
 */

export const INTENT_FILTERS = ['all', 'new_order', 'amendment', 'cancellation', 'unknown'] as const;
export type IntentFilter = (typeof INTENT_FILTERS)[number];

export function intentLabelKey(intent: string): string {
  return `orderIntake.intent.${INTENT_FILTERS.includes(intent as IntentFilter) ? intent : 'unknown'}`;
}

/**
 * Niyet rozeti tonu.
 *
 * `unknown` NOTR DEGIL, UYARI tonunda: "anlamadim" sonucunun sessiz bir satir
 * gibi gorunmesi, tam da gozden kacmasi gereken yerde gozden kacmasina yol acar.
 */
export function intentTone(
  intent: OrderIntakeIntent | string,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (intent) {
    case 'new_order':
      return 'default';
    case 'amendment':
      return 'secondary';
    case 'cancellation':
      return 'destructive';
    default:
      return 'outline';
  }
}

/**
 * Dusuk guven esigi — sunucudaki `LOW_CONFIDENCE_THRESHOLD` ile AYNI (0.5).
 *
 * Skor YOKSA dusuk SAYILMAZ: alanin hic uretilmemis olmasi ile zayif
 * uretilmis olmasi ayni sey degil; ikisini birlestirmek her bos alani
 * "dusuk guven" diye isaretlerdi.
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.5;

export function isLowConfidence(score: number | undefined): boolean {
  return typeof score === 'number' && score < LOW_CONFIDENCE_THRESHOLD;
}

/** Ekranda gosterilecek alanlar ve sirasi. */
const FIELD_ORDER = [
  'intent',
  'customerName',
  'customerNumber',
  'vatId',
  'contactEmail',
  'externalReference',
  'orderDate',
  'revenueAmount',
  'currency',
  'billingMode',
  'specialInstructions',
] as const;

/**
 * Gosterilecek alanlar.
 *
 * MASKELENMIS ALAN GIZLENMIYOR, `null` olarak GOSTERILIYOR: sunucu finansal
 * alani `null` yaziyor (silmiyor) ve ekran da bunu "gorme yetkiniz yok" diye
 * gosterebilsin diye satiri koruyor. Alani hic cizmeseydik, kullanici degerin
 * GIRILMEMIS oldugunu sanardi.
 */
export function operationalFields(
  payload: Record<string, unknown>,
): Array<{ field: string; value: string | null }> {
  return FIELD_ORDER.filter((field) => field in payload).map((field) => {
    const raw = payload[field];
    return {
      field,
      value: raw === null || raw === undefined ? null : String(raw),
    };
  });
}

export function fieldLabelKey(field: string): string {
  // Kalem alanlari `consignments[0].pickupAddress` bicimindedir.
  const normalized = field.replace(/^consignments\[\d+\]\./, 'consignment.');
  return `orderIntake.field.${normalized}`;
}

/**
 * Kanal etiketi.
 *
 * Anahtar BIRLESTIRME ile degil bu islevle uretiliyor: `t('...' + kanal)`
 * yazimini i18n denetleyicisi eksik anahtar sanip kiriliyor — ve hakli,
 * cunku boyle bir yazim gercekten de var olmayan bir anahtara cozulebilir.
 */
export function channelLabelKey(channel: string): string {
  const known = ['web_eml', 'web_pdf', 'connector_mailbox'];
  return `orderIntake.channel.${known.includes(channel) ? channel : 'web_eml'}`;
}

export function matchLabelKey(kind: 'company' | 'order', status: string | undefined): string {
  return `orderIntake.${kind}Match.${status ?? 'unknown'}`;
}

export function taskLabelKey(sequence: number): string {
  return sequence === 2 ? 'orderIntake.tasks.financial' : 'orderIntake.tasks.operational';
}

/** Faz 14 `intake_file_*` reddi. Bilinmeyen kod GENEL mesaja duser. */
const KNOWN_REJECTIONS = new Set([
  'intake_file_too_large',
  'intake_file_unsupported_type',
  'intake_file_heic_unsupported',
  'intake_file_encrypted',
  'intake_file_corrupt',
  'intake_file_too_many_pages',
  'intake_file_image_too_large',
]);

export function rejectionLabelKey(code: string): string {
  return KNOWN_REJECTIONS.has(code)
    ? `orderIntake.rejection.${code}`
    : 'orderIntake.rejection.generic';
}


// ---------------------------------------------------------------------------
// Kalem duzenleme
// ---------------------------------------------------------------------------

import type { OrderIntakeConsignmentDraft } from './types';

/** Sozlesme siniri — sunucudaki `maxItems: 20` ile AYNI. */
export const MAX_CONSIGNMENTS = 20;

/** Bos bir kalem taslagi. ADR `unknown` — sessizce `no` OLMAZ. */
export function emptyConsignment(): OrderIntakeConsignmentDraft {
  return { pickupAddress: '', deliveryAddress: '', cargoDescription: '', adrStatus: 'unknown' };
}

/**
 * Ajanin onerdigi kalemleri DUZENLENEBILIR taslaga cevirir.
 *
 * ONERI DEGISMEZ: bu bir KOPYA. Kullanicinin duzeltmesi onerinin uzerine
 * yazmaz; onay aninda ayri bir govde olarak gonderilir ve fark
 * `AutomationCorrectionEvent` olarak kaydedilir.
 */
export function toConsignmentDrafts(payload: Record<string, unknown>): OrderIntakeConsignmentDraft[] {
  const raw = payload.consignments;
  if (!Array.isArray(raw)) return [];

  return raw.slice(0, MAX_CONSIGNMENTS).map((item) => {
    const source = (item ?? {}) as Record<string, unknown>;
    const text = (key: string): string => (typeof source[key] === 'string' ? (source[key] as string) : '');
    const num = (key: string): number | null =>
      typeof source[key] === 'number' ? (source[key] as number) : null;

    const adr = source.adr;
    return {
      pickupAddress: text('pickupAddress'),
      deliveryAddress: text('deliveryAddress'),
      cargoDescription: text('cargoDescription'),
      pickupWindowStart: text('pickupWindowStart') || null,
      deliveryWindowStart: text('deliveryWindowStart') || null,
      quantity: num('quantity'),
      unit: text('unit') || null,
      weightKg: num('weightKg'),
      volumeM3: num('volumeM3'),
      palletCount: num('palletCount'),
      // Taninmayan bir deger `unknown`a duser — `no`ya DEGIL.
      adrStatus: adr === 'yes' || adr === 'no' ? adr : 'unknown',
    };
  });
}

export interface ConsignmentValidation {
  valid: boolean;
  /** Eksik zorunlu alani olan kalemlerin indeksleri. */
  incompleteIndexes: number[];
}

/**
 * Kalemleri gondermeden once dogrular.
 *
 * SUNUCU DA DOGRULUYOR: bu kontrol yalnizca kullaniciya erken geri bildirim
 * icin. Bir guvenlik siniri DEGIL — DTO ayni alanlari zorunlu tutuyor.
 */
export function validateConsignments(
  drafts: readonly OrderIntakeConsignmentDraft[],
): ConsignmentValidation {
  const incompleteIndexes = drafts
    .map((draft, index) =>
      draft.pickupAddress.trim() && draft.deliveryAddress.trim() && draft.cargoDescription.trim()
        ? -1
        : index,
    )
    .filter((index) => index >= 0);

  return {
    valid: incompleteIndexes.length === 0 && drafts.length <= MAX_CONSIGNMENTS,
    incompleteIndexes,
  };
}

/** Bos sayisal alanlari `null`a cevirir — `0` ile BOS ayni sey degil. */
export function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}
