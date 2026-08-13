/**
 * Fis dogrulamasinin SAF mantigi.
 *
 * Saf tutuluyor cunku burada verilen karar MUHASEBEYE gidiyor: yanlis bir
 * tolerans ya da isaret, aracin yakit maliyetini sessizce sisirir ya da
 * eksiltir. route-deviation.util ve fueling-intent.util ile ayni disiplin —
 * eksik veri "0" degil `null`, ve reddedilen her deger SEBEBIYLE reddedilir.
 */

/** Litre ust siniri. Kamyon tanki ~1000 L; 1500 kaba ama savunulabilir korkuluk. */
export const MAX_RECEIPT_LITERS = 1500;
export const MIN_RECEIPT_LITERS = 0.1;

/** Tutar ust siniri — 1500 L x ~5 EUR/L'nin uzerinde bir fis veri hatasidir. */
export const MAX_RECEIPT_AMOUNT = 20000;

/**
 * Fisin ne kadar ileri tarihli olabilecegi.
 *
 * Sifir OLAMAZ: surucunun telefonu birkac dakika ileri olabilir ve dogru bir
 * fis reddedilirdi. Bir gun de fazla — gelecege fis giren biri ya saat
 * ayarini bozmus ya da veri uyduruyor.
 */
export const MAX_FUTURE_SKEW_MINUTES = 120;

/** Fisin ne kadar geriye gidebilecegi. Gecmis fisi engellemek istemiyoruz. */
export const MAX_RECEIPT_AGE_DAYS = 400;

/**
 * litre x birim fiyat ile yakit toplami arasindaki tolerans.
 *
 * Sifir olamaz: pompa litreyi 2, fiyati 3 haneye yuvarliyor ve fis toplamini
 * kendi yuvarlamasiyla basiyor. 62,35 L x 1,719 = 107,17... ama fiste 107,18
 * yazar. Katı esitlik ARAMAK, dogru fislerin yarisini reddederdi.
 */
export const AMOUNT_TOLERANCE_ABSOLUTE = 0.05;
export const AMOUNT_TOLERANCE_RELATIVE = 0.01;

/** Desteklenen para birimleri. Repo genelinde EUR; digerleri sinir gecisleri icin. */
export const SUPPORTED_CURRENCIES = ['EUR', 'CHF', 'GBP', 'PLN', 'CZK', 'DKK', 'SEK', 'NOK'];

export type FuelReceiptIssueCode =
  | 'date_missing'
  | 'date_invalid'
  | 'date_in_future'
  | 'date_too_old'
  | 'liters_missing'
  | 'liters_out_of_range'
  | 'fuel_total_missing'
  | 'amount_negative'
  | 'amount_out_of_range'
  | 'currency_unsupported'
  | 'fuel_product_missing'
  | 'unit_price_mismatch'
  | 'vat_breakdown_mismatch'
  | 'receipt_total_below_fuel_total';

export interface FuelReceiptIssue {
  code: FuelReceiptIssueCode;
  /** Hangi alanin sorunlu oldugu — arayuz alani isaretleyebilsin. */
  field: string;
  /** `true` ise kayit gonderilemez; `false` ise yalnizca uyari. */
  blocking: boolean;
}

export interface FuelReceiptDraft {
  purchasedAt: string | null;
  liters: number | null;
  pricePerLiter: number | null;
  /** YAKIT satirinin brut toplami. */
  fuelGrossAmount: number | null;
  /** Fisin GENEL brut toplami. */
  receiptGrossAmount: number | null;
  receiptNetAmount: number | null;
  receiptVatAmount: number | null;
  receiptVatRate: number | null;
  currency: string | null;
  fuelProduct: string | null;
  odometerKm: number | null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Iki tutar tolerans icinde mi. Mutlak VE oransal — kucuk ve buyuk fisler icin. */
export function amountsMatch(left: number, right: number): boolean {
  const diff = Math.abs(left - right);
  if (diff <= AMOUNT_TOLERANCE_ABSOLUTE) {
    return true;
  }
  const scale = Math.max(Math.abs(left), Math.abs(right));
  return scale > 0 && diff / scale <= AMOUNT_TOLERANCE_RELATIVE;
}

/**
 * Surucunun dogruladigi taslagi denetler.
 *
 * `blocking` ayrimi kritik: matematik uyusmazligi kaydi ENGELLEMEZ, cunku
 * gercek fislerde yuvarlama ve indirim satirlari olur ve surucuyu dogru bir
 * fisi gonderemez halde birakmak, onu sistemi hic kullanmamaya iter. Eksik
 * zorunlu alan ise engeller — `submitted` bir kayit muhasebeye gidiyor.
 */
export function validateFuelReceiptDraft(
  draft: FuelReceiptDraft,
  now: Date = new Date(),
): FuelReceiptIssue[] {
  const issues: FuelReceiptIssue[] = [];
  const add = (code: FuelReceiptIssueCode, field: string, blocking: boolean) =>
    issues.push({ code, field, blocking });

  // --- Tarih ---
  if (!draft.purchasedAt) {
    add('date_missing', 'purchasedAt', true);
  } else {
    const parsed = new Date(draft.purchasedAt);
    if (Number.isNaN(parsed.getTime())) {
      add('date_invalid', 'purchasedAt', true);
    } else {
      const skewMs = parsed.getTime() - now.getTime();
      if (skewMs > MAX_FUTURE_SKEW_MINUTES * 60_000) {
        add('date_in_future', 'purchasedAt', true);
      } else if (skewMs < -MAX_RECEIPT_AGE_DAYS * 24 * 60 * 60_000) {
        add('date_too_old', 'purchasedAt', true);
      }
    }
  }

  // --- Litre ---
  if (!isFiniteNumber(draft.liters)) {
    add('liters_missing', 'liters', true);
  } else if (draft.liters < MIN_RECEIPT_LITERS || draft.liters > MAX_RECEIPT_LITERS) {
    add('liters_out_of_range', 'liters', true);
  }

  // --- Yakit urunu ---
  // OCR taninmayan etiketi canonical enum'a TAHMIN EDEREK eslemedigi icin
  // burada bos kalabilir; surucu secmek zorunda.
  if (!draft.fuelProduct) {
    add('fuel_product_missing', 'fuelProduct', true);
  }

  // --- Tutarlar ---
  if (!isFiniteNumber(draft.fuelGrossAmount)) {
    add('fuel_total_missing', 'fuelGrossAmount', true);
  }

  const amountFields: Array<[keyof FuelReceiptDraft, string]> = [
    ['fuelGrossAmount', 'fuelGrossAmount'],
    ['receiptGrossAmount', 'receiptGrossAmount'],
    ['receiptNetAmount', 'receiptNetAmount'],
    ['receiptVatAmount', 'receiptVatAmount'],
    ['pricePerLiter', 'pricePerLiter'],
  ];
  for (const [key, field] of amountFields) {
    const value = draft[key];
    if (value === null || value === undefined) continue;
    if (!isFiniteNumber(value)) continue;
    if (value < 0) {
      add('amount_negative', field, true);
    } else if (value > MAX_RECEIPT_AMOUNT) {
      add('amount_out_of_range', field, true);
    }
  }

  // --- Para birimi ---
  if (!draft.currency || !SUPPORTED_CURRENCIES.includes(draft.currency.toUpperCase())) {
    add('currency_unsupported', 'currency', true);
  }

  // --- Matematik: litre x birim fiyat = yakit toplami ---
  // UYARI, engel degil: pompa yuvarlamasi ve indirim satirlari gercek.
  if (
    isFiniteNumber(draft.liters) &&
    isFiniteNumber(draft.pricePerLiter) &&
    isFiniteNumber(draft.fuelGrossAmount) &&
    draft.pricePerLiter > 0 &&
    !amountsMatch(draft.liters * draft.pricePerLiter, draft.fuelGrossAmount)
  ) {
    add('unit_price_mismatch', 'fuelGrossAmount', false);
  }

  // --- Matematik: net + KDV = brut ---
  if (
    isFiniteNumber(draft.receiptNetAmount) &&
    isFiniteNumber(draft.receiptVatAmount) &&
    isFiniteNumber(draft.receiptGrossAmount) &&
    !amountsMatch(draft.receiptNetAmount + draft.receiptVatAmount, draft.receiptGrossAmount)
  ) {
    add('vat_breakdown_mismatch', 'receiptGrossAmount', false);
  }

  // --- Karma fis: genel toplam yakit toplamindan KUCUK olamaz ---
  // Kucukse ya yakit toplami fisin tamami olarak girilmis ya da alanlar
  // yer degistirmis; ikisi de aracin maliyetini bozar.
  if (
    isFiniteNumber(draft.fuelGrossAmount) &&
    isFiniteNumber(draft.receiptGrossAmount) &&
    draft.receiptGrossAmount + AMOUNT_TOLERANCE_ABSOLUTE < draft.fuelGrossAmount
  ) {
    add('receipt_total_below_fuel_total', 'receiptGrossAmount', false);
  }

  return issues;
}

export function hasBlockingIssue(issues: readonly FuelReceiptIssue[]): boolean {
  return issues.some((issue) => issue.blocking);
}

/**
 * Fiste yakit disi kalem var mi.
 *
 * Genel toplam yakit toplamindan ANLAMLI olcude buyukse karma fistir. Bu ayrim
 * korunmali: `totalCost` (araca yazilan) yakit satiri, `receiptGrossAmount`
 * kasada odenen tutardir.
 */
export function isMixedReceipt(
  fuelGrossAmount: number | null,
  receiptGrossAmount: number | null,
): boolean {
  if (!isFiniteNumber(fuelGrossAmount) || !isFiniteNumber(receiptGrossAmount)) {
    return false;
  }
  return !amountsMatch(fuelGrossAmount, receiptGrossAmount) &&
    receiptGrossAmount > fuelGrossAmount;
}
