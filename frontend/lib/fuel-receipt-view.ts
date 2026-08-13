import type {
  ConfirmFuelReceiptPayload,
  FuelProductType,
  FuelReceipt,
  FuelReceiptExtraction,
} from '@/lib/types';

/**
 * Yakit fisi ekraninin SAF mantigi.
 *
 * Ayri dosya cunku burada verilen kararlar jsdom olmadan da sinanabilmeli ve
 * "hangi alan dusuk guvenli", "OCR taslagi forma nasil dusuyor" sorularinin
 * cevabi TEK yerde durmali.
 */

/**
 * Bu esigin ALTI "kontrol et" demektir.
 *
 * 0,7 keyfi degil: mock fixture'larda yuksek guvenli alanlar 0,84–0,99,
 * burusuk fis alanlari 0,29–0,44 araliginda. Esik ikisinin arasinda ve gercek
 * saglayicilarin tipik "emin degilim" bandiyla ortusuyor.
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Alan dusuk guvenli mi.
 *
 * `confidence === null` DUSUK SAYILMAZ: saglayici guven bildirmiyorsa bu
 * "emin degilim" demek degil, "olcmedim" demektir. Hepsini kirmiziya boyamak
 * uyariyi anlamsizlastirir ve surucu bir sure sonra hicbirine bakmaz.
 */
export function isLowConfidence(confidence: number | null | undefined): boolean {
  return typeof confidence === 'number' && confidence < LOW_CONFIDENCE_THRESHOLD;
}

/** Formda gosterilecek taslak degerler. */
export interface FuelReceiptFormValues {
  stationName: string;
  stationAddress: string;
  receiptNumber: string;
  purchasedAt: string;
  fuelProduct: FuelProductType | '';
  liters: string;
  pricePerLiter: string;
  fuelGrossAmount: string;
  receiptGrossAmount: string;
  receiptNetAmount: string;
  receiptVatAmount: string;
  currency: string;
  paymentMethod: string;
  odometerKm: string;
}

function text(field: { value: string | null } | undefined): string {
  return field?.value ?? '';
}

function numeric(field: { value: number | null } | undefined): string {
  return field?.value === null || field?.value === undefined ? '' : String(field.value);
}

/** `datetime-local` girdisinin bekledigi bicim (saniye ve zaman dilimi yok). */
export function toDateTimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(
    parsed.getHours(),
  )}:${pad(parsed.getMinutes())}`;
}

export const EMPTY_FORM: FuelReceiptFormValues = {
  stationName: '',
  stationAddress: '',
  receiptNumber: '',
  purchasedAt: '',
  fuelProduct: '',
  liters: '',
  pricePerLiter: '',
  fuelGrossAmount: '',
  receiptGrossAmount: '',
  receiptNetAmount: '',
  receiptVatAmount: '',
  currency: 'EUR',
  paymentMethod: '',
  odometerKm: '',
};

/**
 * OCR taslagini forma dokerbir.
 *
 * TASLAK, canonical degil: buradan cikan degerler yalnizca EKRANDA duruyor ve
 * surucu confirm'e basana kadar hicbiri kaydedilmiyor.
 *
 * Eslenemeyen yakit turu BOS birakiliyor — `rawFuelLabel` ayrica gosterilip
 * surucuye sectiriliyor. "SUPER" yazan bir fisi E5 mi E10 mu diye tahmin
 * etmek yanlis yakit kaydi uretir.
 */
export function formFromExtraction(
  extraction: FuelReceiptExtraction | null,
): FuelReceiptFormValues {
  if (!extraction) return { ...EMPTY_FORM };

  return {
    stationName: text(extraction.stationName),
    stationAddress: text(extraction.stationAddress),
    receiptNumber: text(extraction.receiptNumber),
    purchasedAt: toDateTimeLocal(extraction.purchasedAt.value),
    fuelProduct: extraction.fuelProduct.value ?? '',
    liters: numeric(extraction.liters),
    pricePerLiter: numeric(extraction.pricePerLiter),
    fuelGrossAmount: numeric(extraction.fuelGrossAmount),
    // Karma fiste genel toplam yakit toplamindan FARKLI; ikisi ayri sorulur.
    receiptGrossAmount: numeric(extraction.receiptGrossAmount),
    receiptNetAmount: numeric(extraction.receiptNetAmount),
    receiptVatAmount: numeric(extraction.receiptVatAmount),
    currency: text(extraction.currency) || 'EUR',
    paymentMethod: text(extraction.paymentMethod),
    odometerKm: numeric(extraction.odometerKm),
  };
}

/** Kaydedilmis bir fisten forma (gonderilmis kaydi goruntulemek icin). */
export function formFromReceipt(receipt: FuelReceipt): FuelReceiptFormValues {
  return {
    stationName: receipt.stationName ?? '',
    stationAddress: receipt.stationAddress ?? '',
    receiptNumber: receipt.receiptNumber ?? '',
    purchasedAt: toDateTimeLocal(receipt.purchasedAt ?? receipt.enteredAt),
    fuelProduct: receipt.fuelProduct ?? '',
    liters: receipt.liters === null ? '' : String(receipt.liters),
    pricePerLiter: receipt.pricePerLiter === null ? '' : String(receipt.pricePerLiter),
    fuelGrossAmount: receipt.fuelGrossAmount === null ? '' : String(receipt.fuelGrossAmount),
    receiptGrossAmount:
      receipt.receiptGrossAmount === null ? '' : String(receipt.receiptGrossAmount),
    receiptNetAmount: receipt.receiptNetAmount === null ? '' : String(receipt.receiptNetAmount),
    receiptVatAmount: receipt.receiptVatAmount === null ? '' : String(receipt.receiptVatAmount),
    currency: receipt.currency,
    paymentMethod: receipt.paymentMethod ?? '',
    odometerKm: receipt.odometerKm === null ? '' : String(receipt.odometerKm),
  };
}

/**
 * Locale duyarli sayi okuma.
 *
 * Almanca klavyede surucu "62,35" yazar; `Number('62,35')` NaN verir ve tutar
 * sessizce kaybolurdu.
 */
export function parseDecimal(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\s/g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export type FormWarningCode =
  | 'unit_price_mismatch'
  | 'vat_breakdown_mismatch'
  | 'receipt_total_below_fuel_total';

/** Tolerans backend ile AYNI — iki tarafta farkli esik kafa karistirir. */
const ABSOLUTE_TOLERANCE = 0.05;
const RELATIVE_TOLERANCE = 0.01;

function matchesAmount(left: number, right: number): boolean {
  const diff = Math.abs(left - right);
  if (diff <= ABSOLUTE_TOLERANCE) return true;
  const scale = Math.max(Math.abs(left), Math.abs(right));
  return scale > 0 && diff / scale <= RELATIVE_TOLERANCE;
}

/**
 * Ekranda gosterilecek matematik uyarilari.
 *
 * UYARI, ENGEL DEGIL: gercek fislerde yuvarlama ve indirim satirlari olur.
 * Surucuyu dogru bir fisi gonderemez halde birakmak, onu sistemi hic
 * kullanmamaya iter. Backend de ayni sekilde bunlari `blocking: false` sayiyor.
 */
export function formWarnings(values: FuelReceiptFormValues): FormWarningCode[] {
  const warnings: FormWarningCode[] = [];
  const liters = parseDecimal(values.liters);
  const price = parseDecimal(values.pricePerLiter);
  const fuelTotal = parseDecimal(values.fuelGrossAmount);
  const receiptTotal = parseDecimal(values.receiptGrossAmount);
  const net = parseDecimal(values.receiptNetAmount);
  const vat = parseDecimal(values.receiptVatAmount);

  if (liters !== null && price !== null && fuelTotal !== null && price > 0) {
    if (!matchesAmount(liters * price, fuelTotal)) warnings.push('unit_price_mismatch');
  }
  if (net !== null && vat !== null && receiptTotal !== null) {
    if (!matchesAmount(net + vat, receiptTotal)) warnings.push('vat_breakdown_mismatch');
  }
  if (fuelTotal !== null && receiptTotal !== null && receiptTotal + ABSOLUTE_TOLERANCE < fuelTotal) {
    warnings.push('receipt_total_below_fuel_total');
  }

  return warnings;
}

/** Gonderilebilmesi icin gereken en az alanlar dolu mu. */
export function canSubmit(values: FuelReceiptFormValues): boolean {
  return (
    Boolean(values.purchasedAt) &&
    Boolean(values.fuelProduct) &&
    (parseDecimal(values.liters) ?? 0) > 0 &&
    parseDecimal(values.fuelGrossAmount) !== null &&
    Boolean(values.currency)
  );
}

/** Fisteki yakit araca uymuyor mu — acik ek onay gerekir. */
export function isFuelMismatch(
  fuelProduct: FuelProductType | '',
  compatibleProducts: readonly FuelProductType[] | null,
): boolean {
  if (!fuelProduct || !compatibleProducts || compatibleProducts.length === 0) return false;
  return !compatibleProducts.includes(fuelProduct);
}

/** Formu istek govdesine cevirir. Bos alanlar GONDERILMEZ. */
export function toConfirmPayload(
  values: FuelReceiptFormValues,
  options: { acknowledgeFuelMismatch?: boolean } = {},
): ConfirmFuelReceiptPayload {
  const optionalNumber = (raw: string) => {
    const parsed = parseDecimal(raw);
    return parsed === null ? undefined : parsed;
  };
  const optionalText = (raw: string) => (raw.trim() ? raw.trim() : undefined);

  return {
    purchasedAt: new Date(values.purchasedAt).toISOString(),
    fuelProduct: values.fuelProduct as FuelProductType,
    liters: parseDecimal(values.liters) ?? 0,
    fuelGrossAmount: parseDecimal(values.fuelGrossAmount) ?? 0,
    currency: values.currency.toUpperCase(),
    pricePerLiter: optionalNumber(values.pricePerLiter),
    receiptGrossAmount: optionalNumber(values.receiptGrossAmount),
    receiptNetAmount: optionalNumber(values.receiptNetAmount),
    receiptVatAmount: optionalNumber(values.receiptVatAmount),
    stationName: optionalText(values.stationName),
    stationAddress: optionalText(values.stationAddress),
    receiptNumber: optionalText(values.receiptNumber),
    paymentMethod: optionalText(values.paymentMethod),
    odometerKm: optionalNumber(values.odometerKm),
    ...(options.acknowledgeFuelMismatch ? { acknowledgeFuelMismatch: true } : {}),
  };
}

/** Backend hata kodlarini ceviri anahtarina cevirir. HAM KOD GOSTERILMEZ. */
const RECEIPT_ERROR_KEYS: Record<string, string> = {
  receipt_file_missing: 'driverPortal.fuelReceipts.errors.fileMissing',
  receipt_file_too_large: 'driverPortal.fuelReceipts.errors.fileTooLarge',
  receipt_file_type_unsupported: 'driverPortal.fuelReceipts.errors.fileType',
  driver_vehicle_not_resolved: 'driverPortal.fuelStations.errors.noVehicle',
  fueling_intent_not_found: 'driverPortal.fuelReceipts.errors.intentNotFound',
  fueling_intent_vehicle_mismatch: 'driverPortal.fuelReceipts.errors.intentNotLinkable',
  fueling_intent_not_linkable: 'driverPortal.fuelReceipts.errors.intentNotLinkable',
  fueling_intent_already_settled: 'driverPortal.fuelReceipts.errors.intentAlreadySettled',
  fuel_receipt_not_found: 'driverPortal.fuelReceipts.errors.notFound',
  fuel_receipt_not_editable: 'driverPortal.fuelReceipts.errors.notEditable',
  fuel_receipt_invalid: 'driverPortal.fuelReceipts.errors.invalid',
  fuel_product_not_compatible: 'driverPortal.fuelReceipts.errors.fuelMismatch',
};

export function fuelReceiptErrorKey(code: string | null | undefined): string | null {
  if (!code) return null;
  return RECEIPT_ERROR_KEYS[code] ?? null;
}

/** OCR hata sinifini kullanici metnine cevirir. Teknik ayrinti GOSTERILMEZ. */
export function ocrErrorKey(errorClass: string | null | undefined): string {
  switch (errorClass) {
    case 'not_configured':
      return 'driverPortal.fuelReceipts.ocr.notConfigured';
    case 'unreadable':
      return 'driverPortal.fuelReceipts.ocr.unreadable';
    case 'not_a_fuel_receipt':
      return 'driverPortal.fuelReceipts.ocr.notAReceipt';
    default:
      return 'driverPortal.fuelReceipts.ocr.failedGeneric';
  }
}
