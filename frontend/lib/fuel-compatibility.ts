import type {
  FuelCompatibilitySource,
  FuelProductType,
  FuelProductUsage,
  VehicleFuelCompatibilityEntry,
  VehicleFuelCompatibilityWriteEntry,
} from './types';

/**
 * Arac yakit uyumlulugu arayuzunun saf mantigi.
 *
 * Bilesenden AYRI tutuluyor: hangi urunun ana yakit, hangisinin katki oldugu
 * ve backend hata kodlarinin nasil metne cevrildigi bir gorunum detayi degil,
 * yanlis yakit hasarini onleyen kural. Bu yuzden kendi testleri var.
 */

/** Sema sirasi korunuyor: kullaniciya rastgele degil, beklenen sirada gosterilir. */
export const FUEL_PRODUCT_TYPES: readonly FuelProductType[] = [
  'DIESEL',
  'SUPER_E5',
  'SUPER_E10',
  'SUPER_PLUS',
  'HVO100',
  'CNG',
  'LNG',
  'ELECTRICITY',
  'HYDROGEN',
  'ADBLUE',
];

/**
 * Katki maddeleri. Bugun yalnizca AdBlue.
 *
 * Backend bunu ZORLUYOR (adblue_must_be_additive /
 * additive_usage_only_for_adblue): AdBlue ana yakit olarak kaydedilemez, baska
 * bir urun de ADDITIVE olarak kaydedilemez. Arayuz ayni kurali onden uygular ki
 * kullanici kaydete basip hata almasin.
 */
export const ADDITIVE_PRODUCTS: readonly FuelProductType[] = ['ADBLUE'];

/** Ana yakit olarak secilebilenler: AdBlue HARIC her sey. */
export const PRIMARY_PRODUCTS: readonly FuelProductType[] = FUEL_PRODUCT_TYPES.filter(
  (product) => !ADDITIVE_PRODUCTS.includes(product),
);

/** Ana yakit kaydinin alabilecegi kullanim turleri. */
export const PRIMARY_USAGES: readonly FuelProductUsage[] = ['PRIMARY', 'ALTERNATIVE'];

/**
 * Arayuzden eklenen yeni kaydin kaynagi.
 *
 * ADMIN, cunku bu ekrandan gelen bilgi ureticinin teknik belgesi ya da VIN
 * cozumlemesi degil, ofisin elle isaretlemesidir. Mevcut kayitlarin kaynagi
 * KORUNUR — ureticiden gelen bir onayi arayuzden kaydete basmak ADMIN'e
 * dusurmemeli, denetim izini bozar.
 */
export const UI_COMPATIBILITY_SOURCE: FuelCompatibilitySource = 'ADMIN';

export function isAdditiveProduct(product: FuelProductType): boolean {
  return ADDITIVE_PRODUCTS.includes(product);
}

/** Bilesenin duzenleme durumu: urun -> secim. */
export interface FuelCompatibilitySelection {
  productType: FuelProductType;
  usageType: FuelProductUsage;
  approved: boolean;
  source: FuelCompatibilitySource;
  /** Mevcut kayittan geliyorsa korunur; yeni kayitta undefined. */
  verifiedAt?: string;
}

/**
 * Sunucudan gelen kayitlari duzenleme durumuna cevirir.
 *
 * Sessiz kayip YOK: backend'de tanimadigimiz bir urun ya da kullanim turu
 * varsa da listeye alinir (bilesen onu "bilinmeyen" etiketiyle gosterir).
 * Filtrelemek, kaydete basildiginda o kaydin SESSIZCE SILINMESI olurdu.
 */
export function selectionFromEntries(
  entries: readonly VehicleFuelCompatibilityEntry[],
): FuelCompatibilitySelection[] {
  return entries.map((entry) => ({
    productType: entry.productType,
    usageType: entry.usageType,
    approved: entry.approved,
    source: entry.source,
    verifiedAt: entry.verifiedAt ?? undefined,
  }));
}

/**
 * PUT govdesini kurar.
 *
 * Ayni urun/kullanim ucusu bir kez yazilir: backend'de benzersiz kisit var
 * (tenantId+vehicleId+productType+usageType) ve tekrar duplicate_
 * fuel_compatibility_entry ile 400 doner.
 */
export function buildCompatibilityPayload(
  selections: readonly FuelCompatibilitySelection[],
): VehicleFuelCompatibilityWriteEntry[] {
  const seen = new Set<string>();
  const payload: VehicleFuelCompatibilityWriteEntry[] = [];

  for (const selection of selections) {
    const key = `${selection.productType}:${selection.usageType}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    payload.push({
      productType: selection.productType,
      usageType: selection.usageType,
      approved: selection.approved,
      source: selection.source,
      ...(selection.verifiedAt ? { verifiedAt: selection.verifiedAt } : {}),
    });
  }

  return payload;
}

/**
 * Kaydetmeden once arayuz tarafi dogrulama.
 *
 * Backend'in reddettigi durumlari onden yakalar; backend'in KABUL ettigi bir
 * durumu uydurma kuralla reddetmez. Ozellikle "en az bir ana yakit" ZORUNLU
 * DEGIL: backend bos diziyi acikca gecerli sayiyor ("uyumluluk tanimsiz"a geri
 * donusun yolu). Bunu burada zorunlu kilmak, ofisin yanlis girilmis bir seti
 * temizlemesini imkansiz hale getirirdi — yerine uyari gosteriliyor.
 */
export type FuelCompatibilityValidationCode =
  | 'adblue_must_be_additive'
  | 'additive_usage_only_for_adblue'
  | 'duplicate_fuel_compatibility_entry';

export function validateSelections(
  selections: readonly FuelCompatibilitySelection[],
): FuelCompatibilityValidationCode | null {
  const seen = new Set<string>();

  for (const selection of selections) {
    if (isAdditiveProduct(selection.productType) && selection.usageType !== 'ADDITIVE') {
      return 'adblue_must_be_additive';
    }
    if (selection.usageType === 'ADDITIVE' && !isAdditiveProduct(selection.productType)) {
      return 'additive_usage_only_for_adblue';
    }

    const key = `${selection.productType}:${selection.usageType}`;
    if (seen.has(key)) {
      return 'duplicate_fuel_compatibility_entry';
    }
    seen.add(key);
  }

  return null;
}

/**
 * Istasyon filtresine girecek urunler.
 *
 * Backend'deki compatibleProductsForStationFilter ile ayni kural: approved +
 * PRIMARY/ALTERNATIVE. Arayuz bunu kaydetmeden ONCE gostermek icin hesapliyor
 * (sunucu yanitindaki compatibleProducts kaydettikten sonra geliyor).
 */
export function previewCompatibleProducts(
  selections: readonly FuelCompatibilitySelection[],
): FuelProductType[] {
  const products: FuelProductType[] = [];
  for (const selection of selections) {
    if (!selection.approved) continue;
    if (selection.usageType === 'ADDITIVE') continue;
    if (!products.includes(selection.productType)) {
      products.push(selection.productType);
    }
  }
  return products;
}

/** Urun etiketinin ceviri anahtari. */
export function fuelProductLabelKey(product: string): string {
  return `vehicleDetail.fuelCompatibility.products.${product}`;
}

export function fuelUsageLabelKey(usage: string): string {
  return `vehicleDetail.fuelCompatibility.usages.${usage}`;
}

export function fuelSourceLabelKey(source: string): string {
  return `vehicleDetail.fuelCompatibility.sources.${source}`;
}

/** Arayuzun tanidigi urun mu? Tanimiyorsa "bilinmeyen" etiketi kullanilir. */
export function isKnownFuelProduct(product: string): product is FuelProductType {
  return (FUEL_PRODUCT_TYPES as readonly string[]).includes(product);
}

/**
 * Backend'in dondurdugu makine kodlarini ceviri anahtarina cevirir.
 *
 * HAM KOD ya da Ingilizce backend metni kullaniciya GOSTERILMEZ. Tanimadigimiz
 * bir kod gelirse mevcut genel hata yaklasimina duseriz — yeni bir kod
 * eklendiginde kullanici anlasilmaz bir slug gormez.
 */
const ERROR_CODE_KEYS: Record<string, string> = {
  adblue_must_be_additive: 'vehicleDetail.fuelCompatibility.errors.adblueMustBeAdditive',
  additive_usage_only_for_adblue:
    'vehicleDetail.fuelCompatibility.errors.additiveUsageOnlyForAdblue',
  duplicate_fuel_compatibility_entry:
    'vehicleDetail.fuelCompatibility.errors.duplicateEntry',
  vehicle_not_found: 'vehicleDetail.fuelCompatibility.errors.vehicleNotFound',
};

export const FUEL_COMPATIBILITY_ERROR_CODES = Object.keys(ERROR_CODE_KEYS);

/**
 * Hata govdesinden makine kodunu cikarir.
 *
 * Iki yere de bakiyor: uretimde ust seviye `code` (bkz. backend
 * HttpExceptionFilter), gelistirmede ayrica `details.code`. Boylece arayuz iki
 * ortamda ayni metni gosterir.
 */
export function extractErrorCode(error: unknown): string | null {
  const data = (error as { response?: { data?: unknown } } | undefined)?.response?.data;
  if (!data || typeof data !== 'object') {
    return null;
  }

  const topLevel = (data as { code?: unknown }).code;
  if (typeof topLevel === 'string' && topLevel.trim()) {
    return topLevel;
  }

  const details = (data as { details?: unknown }).details;
  if (details && typeof details === 'object') {
    const nested = (details as { code?: unknown }).code;
    if (typeof nested === 'string' && nested.trim()) {
      return nested;
    }
  }

  return null;
}

/** Bilinen kod icin ceviri anahtari, aksi halde null (genel hataya dusulur). */
export function fuelCompatibilityErrorKey(error: unknown): string | null {
  const code = extractErrorCode(error);
  if (!code) {
    return null;
  }
  return ERROR_CODE_KEYS[code] ?? null;
}

export function validationErrorKey(code: FuelCompatibilityValidationCode): string {
  return ERROR_CODE_KEYS[code];
}
