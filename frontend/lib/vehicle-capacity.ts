/**
 * ARAC KAPASITE VE KISITLARI — SAF (Faz 17g).
 *
 * SINIRLAR SUNUCU SOZLESMESIYLE AYNI. Backend
 * `update-vehicle.dto.ts` her alan icin bir ust sinir ve pozitiflik sarti
 * tasiyor; buradaki degerler onlarin BIREBIR karsiligi. Arayuz daha gevsek
 * olsaydi kullanici formu doldurup 400 alirdi; daha SIKI olsaydi sunucunun
 * kabul ettigi bir degeri giremezdi. Ikisi birlikte degismeli.
 *
 * `null` = BILINMIYOR, "sinirsiz" ya da "hayir" DEGIL. Bos birakilan alan
 * uygunluk motorunda `unknown` uretir ve `unknown` hicbir zaman "uygun"
 * sayilmaz — arayuz bunu ACIKCA "dogrulanamadi" diye gostermeli.
 */

export type CapacityFieldKey =
  | 'payload_capacity_kg'
  | 'cargo_volume_m3'
  | 'pallet_capacity'
  | 'height_cm'
  | 'length_cm'
  | 'width_cm'
  | 'gross_weight_kg';

export interface CapacityFieldSpec {
  key: CapacityFieldKey;
  /** Ondalik basamak sayisi. 0 = tam sayi (backend `@IsInt()`). */
  decimals: 0 | 2 | 3;
  max: number;
  /** Birim etiketi — cevrilmez, SI/olcu birimi. */
  unit: string;
}

/** Sunucudaki `@Max(...)` ve `@IsInt()`/`@IsNumber({maxDecimalPlaces})` karsiligi. */
export const CAPACITY_FIELDS: readonly CapacityFieldSpec[] = [
  { key: 'payload_capacity_kg', decimals: 2, max: 100_000, unit: 'kg' },
  { key: 'cargo_volume_m3', decimals: 3, max: 1_000, unit: 'm³' },
  { key: 'pallet_capacity', decimals: 0, max: 100, unit: '' },
  { key: 'gross_weight_kg', decimals: 2, max: 100_000, unit: 'kg' },
  { key: 'height_cm', decimals: 0, max: 500, unit: 'cm' },
  { key: 'length_cm', decimals: 0, max: 3_000, unit: 'cm' },
  { key: 'width_cm', decimals: 0, max: 400, unit: 'cm' },
] as const;

/** UC DURUMLU ADR. `null` BILINMIYOR — `false`a indirmek YASAK. */
export type AdrValue = true | false | null;

export const ADR_CHOICES: ReadonlyArray<{ value: AdrValue; labelKey: string }> = [
  { value: true, labelKey: 'vehicleDetail.capacity.adr.yes' },
  { value: false, labelKey: 'vehicleDetail.capacity.adr.no' },
  { value: null, labelKey: 'vehicleDetail.capacity.adr.unknown' },
] as const;

export type CapacityValues = Record<CapacityFieldKey, number | null> & { adr_certified: AdrValue };

/** Form girdisi: kullanici metin yazar, bos metin `null` demektir. */
export type CapacityDraft = Record<CapacityFieldKey, string> & { adr_certified: AdrValue };

export type CapacityErrorCode = 'not_a_number' | 'not_positive' | 'too_large' | 'too_many_decimals';

export function fieldLabelKey(key: CapacityFieldKey): string {
  return `vehicleDetail.capacity.field.${key}`;
}

export function errorLabelKey(code: CapacityErrorCode): string {
  return `vehicleDetail.capacity.error.${code}`;
}

export function specFor(key: CapacityFieldKey): CapacityFieldSpec {
  const spec = CAPACITY_FIELDS.find((item) => item.key === key);
  if (!spec) throw new Error(`unknown capacity field ${key}`);
  return spec;
}

export function toDraft(values: Partial<CapacityValues>): CapacityDraft {
  const draft = { adr_certified: values.adr_certified ?? null } as CapacityDraft;
  for (const spec of CAPACITY_FIELDS) {
    const value = values[spec.key];
    draft[spec.key] = value === null || value === undefined ? '' : String(value);
  }
  return draft;
}

/**
 * Tek alani dogrular.
 *
 * BOS METIN HATA DEGIL: bos birakmak "bu degeri bilmiyorum" demenin mesru
 * yolu ve `null` olarak kaydediliyor. Bos alani zorunlu kilsaydik kullanici
 * uydurma bir sayi girmeye zorlanirdi — tam da bu fazda kacinilan sey.
 */
export function validateField(
  key: CapacityFieldKey,
  raw: string,
): { value: number | null; error: CapacityErrorCode | null } {
  const trimmed = raw.trim();
  if (trimmed === '') return { value: null, error: null };

  // Virgul da kabul ediliyor: Almanca klavyede ondalik ayraci virguldur ve
  // "1,5" yazan kullaniciya "gecersiz sayi" demek gereksiz bir engel olurdu.
  const normalized = trimmed.replace(',', '.');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return { value: null, error: 'not_a_number' };

  const spec = specFor(key);
  // Sunucuda `@IsPositive()`: sifir da REDDEDILIYOR. Kapasitesi sifir olan bir
  // arac "arac degil"dir; bilinmiyorsa alan BOS birakilmali.
  if (parsed <= 0) return { value: null, error: 'not_positive' };
  if (parsed > spec.max) return { value: null, error: 'too_large' };

  if (spec.decimals === 0 && !Number.isInteger(parsed)) {
    return { value: null, error: 'too_many_decimals' };
  }
  const decimalPart = normalized.split('.')[1] ?? '';
  if (spec.decimals > 0 && decimalPart.length > spec.decimals) {
    return { value: null, error: 'too_many_decimals' };
  }

  return { value: parsed, error: null };
}

export function validateDraft(draft: CapacityDraft): Partial<Record<CapacityFieldKey, CapacityErrorCode>> {
  const errors: Partial<Record<CapacityFieldKey, CapacityErrorCode>> = {};
  for (const spec of CAPACITY_FIELDS) {
    const { error } = validateField(spec.key, draft[spec.key]);
    if (error) errors[spec.key] = error;
  }
  return errors;
}

/**
 * Kaydedilecek govdeyi kurar.
 *
 * BOS ALAN `null` GONDERIYOR, ATLANMIYOR: sunucuda `undefined` "dokunma",
 * `null` "temizle" demek. Kullanici bir degeri SILDIYSE bu bir niyettir ve
 * sessizce yok sayilmamali.
 */
export function buildCapacityPayload(draft: CapacityDraft): Record<string, number | boolean | null> {
  const payload: Record<string, number | boolean | null> = {
    adr_certified: draft.adr_certified,
  };
  for (const spec of CAPACITY_FIELDS) {
    payload[spec.key] = validateField(spec.key, draft[spec.key]).value;
  }
  return payload;
}

export function isDirty(draft: CapacityDraft, saved: CapacityDraft): boolean {
  if (draft.adr_certified !== saved.adr_certified) return true;
  return CAPACITY_FIELDS.some((spec) => draft[spec.key].trim() !== saved[spec.key].trim());
}

/** Kac alanin dogrulanamadigi — kart basliginda ozet olarak gosteriliyor. */
export function unverifiedCount(values: Partial<CapacityValues>): number {
  const missingNumbers = CAPACITY_FIELDS.filter(
    (spec) => values[spec.key] === null || values[spec.key] === undefined,
  ).length;
  const missingAdr = values.adr_certified === null || values.adr_certified === undefined ? 1 : 0;
  return missingNumbers + missingAdr;
}

/** Toplam alan sayisi — 7 sayisal + uc durumlu ADR. */
export const CAPACITY_FIELD_COUNT = CAPACITY_FIELDS.length + 1;
