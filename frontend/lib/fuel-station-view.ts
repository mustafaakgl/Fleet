import type {
  FuelProductType,
  FuelStationAddress,
  NearbyFuelStation,
} from './types';

/**
 * Surucu istasyon ekraninin saf mantigi.
 *
 * Bilesenden ayri: siralama, "en ucuz"/"en yakin" etiketleri ve fiyat
 * bicimlendirmesi bir gorunum susu degil, surucunun nereye gidecegine dair
 * karar verdigi bilgi. Yanlis "en ucuz" etiketi somut para kaybi demek.
 */

export const FUEL_STATION_RADIUS_OPTIONS = [5, 10, 15, 25] as const;
export const DEFAULT_FUEL_STATION_RADIUS_KM = 10;

export type FuelStationSortMode = 'distance' | 'price';

/** Bir istasyonun secili yakit turu icin fiyati; yoksa null. */
export function priceFor(
  station: NearbyFuelStation,
  product: FuelProductType | null,
): number | null {
  if (!product) return null;
  const offering = station.offerings.find((entry) => entry.productType === product);
  return offering?.pricePerUnit ?? null;
}

/**
 * Siralama.
 *
 * Fiyata gore siralamada fiyati OLMAYAN istasyonlar en sona gider; null'i
 * kucuk sayan bir karsilastirma onlari "en ucuz" diye basa tasirdi.
 *
 * Esitlik DETERMINISTIK cozulur: once ikincil olcu (fiyatta mesafe, mesafede
 * fiyat), sonra istasyon kimligi. Kimlige kadar inmek sart — aksi halde ayni
 * veri iki renderda farkli siralanip listenin altindaki "en ucuz" etiketi
 * zipliyor.
 */
export function sortStations(
  stations: readonly NearbyFuelStation[],
  mode: FuelStationSortMode,
  selectedProduct: FuelProductType | null,
): NearbyFuelStation[] {
  const byDistance = (a: NearbyFuelStation, b: NearbyFuelStation) => {
    const left = a.distanceKm;
    const right = b.distanceKm;
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    return left - right;
  };

  const byPrice = (a: NearbyFuelStation, b: NearbyFuelStation) => {
    const left = priceFor(a, selectedProduct);
    const right = priceFor(b, selectedProduct);
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    return left - right;
  };

  const primary = mode === 'price' ? byPrice : byDistance;
  const secondary = mode === 'price' ? byDistance : byPrice;

  return [...stations].sort((a, b) => {
    const first = primary(a, b);
    if (first !== 0) return first;
    const second = secondary(a, b);
    if (second !== 0) return second;
    return a.id.localeCompare(b.id);
  });
}

/**
 * "En yakin" istasyonun kimligi.
 *
 * Yalnizca MEVCUT sonuclar icinde; mesafesi bilinmeyen istasyon adaya girmez.
 * Beraberlikte kimlik sirasi kazanir, boylece etiket sabit kalir.
 */
export function nearestStationId(stations: readonly NearbyFuelStation[]): string | null {
  let best: NearbyFuelStation | null = null;
  for (const station of stations) {
    if (station.distanceKm === null) continue;
    if (
      !best ||
      station.distanceKm < best.distanceKm! ||
      (station.distanceKm === best.distanceKm && station.id.localeCompare(best.id) < 0)
    ) {
      best = station;
    }
  }
  return best?.id ?? null;
}

/**
 * "En ucuz" istasyonun kimligi — SECILI yakit turu icin.
 *
 * Fiyati olmayan istasyon aday DEGIL. Yakit turu secilmemisse etiket hic
 * verilmez: "en ucuz" hangi urun icin oldugu belirsizken anlamsizdir.
 */
export function cheapestStationId(
  stations: readonly NearbyFuelStation[],
  product: FuelProductType | null,
): string | null {
  if (!product) return null;

  let best: NearbyFuelStation | null = null;
  let bestPrice = Number.POSITIVE_INFINITY;

  for (const station of stations) {
    const price = priceFor(station, product);
    if (price === null) continue;
    if (price < bestPrice || (price === bestPrice && best && station.id.localeCompare(best.id) < 0)) {
      best = station;
      bestPrice = price;
    }
  }

  return best?.id ?? null;
}

/**
 * Litre fiyati, kullanicinin diline gore.
 *
 * Almanca'da `1,759 €/l`. Ham float ("1.7589999999") gosterilmiyor; yakit
 * fiyati Almanya'da UC ondalikla ilan edilir (onda birlik sent), bu yuzden
 * 2 haneye yuvarlamak gercek fiyati yanlis gosterir.
 */
export function formatPricePerLiter(price: number | null, locale: string): string | null {
  if (price === null || !Number.isFinite(price)) {
    return null;
  }
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(price);
  return `${formatted} €/l`;
}

/** Mesafe: 1 km altinda metre, ustunde bir ondalik km. */
export function formatDistance(distanceKm: number | null, locale: string): string | null {
  if (distanceKm === null || !Number.isFinite(distanceKm)) {
    return null;
  }
  if (distanceKm < 1) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(distanceKm * 1000)} m`;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(distanceKm)} km`;
}

/**
 * Verinin CEKILDIGI saat.
 *
 * "Fiyat su saatte guncellendi" DEGIL: saglayici fiyat zaman damgasi vermiyor
 * ve oyle sunmak uydurma olurdu. Cagiran taraf bunu
 * `driverPortal.fuelStations.retrievedAt` metniyle birlestiriyor
 * ("Bilgiler 14:32'de alindi").
 */
export function formatRetrievedAt(value: string, locale: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date);
}

/** Tek satirlik adres; eksik parcalar sessizce atlanir. */
export function formatStationAddress(address: FuelStationAddress): string | null {
  const line = [address.street, address.houseNumber].filter(Boolean).join(' ').trim();
  const city = [address.postalCode, address.city].filter(Boolean).join(' ').trim();
  const parts = [line, city].filter((part) => part.length > 0);
  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * Yakit secim chip'lerinde gosterilecek urunler.
 *
 * Aracin kabul ettikleri ILE saglayicinin fiyatlayabildiklerinin KESISIMI.
 * Kesisim disindaki bir urunu secilebilir yapmak, surucuye hicbir zaman
 * dolmayacak bir filtre sunmak olurdu.
 */
export function selectableProducts(
  compatibleProducts: readonly FuelProductType[],
  providerSupportedProducts: readonly FuelProductType[],
): FuelProductType[] {
  const supported = new Set(providerSupportedProducts);
  return compatibleProducts.filter((product) => supported.has(product));
}

/** Yalnizca secili urunun teklifi (ya da urun secilmemisse hepsi). */
export function visibleOfferings(
  station: NearbyFuelStation,
  product: FuelProductType | null,
): NearbyFuelStation['offerings'] {
  if (!product) return station.offerings;
  return station.offerings.filter((entry) => entry.productType === product);
}

/**
 * Backend makine kodlarini ceviri anahtarina cevirir.
 *
 * Ham kod ya da Ingilizce backend metni surucuye GOSTERILMEZ. Tanimadigimiz
 * kodda null doner ve cagiran genel hata metnine duser.
 */
const PROVIDER_ERROR_KEYS: Record<string, string> = {
  vehicle_fuel_compatibility_missing:
    'driverPortal.fuelStations.errors.compatibilityMissing',
  driver_vehicle_not_resolved: 'driverPortal.fuelStations.errors.noVehicle',
  driver_profile_not_found: 'driverPortal.fuelStations.errors.noDriverProfile',
  fuel_station_provider_unavailable: 'driverPortal.fuelStations.errors.providerUnavailable',
  // Yapilandirma sorunu: SURUCUYE teknik ayrinti gosterilmiyor, ayni
  // "su anda alinamiyor" metni kullaniliyor. Gelistirici bilgisi loglarda ve
  // sunucu tarafinda kaliyor.
  fuel_station_provider_not_configured:
    'driverPortal.fuelStations.errors.providerNotConfigured',
  // --- Faz 5: yakit duragi secimi ---
  // Baglamin suresi dolmus VEYA baglam bu surucuye/araca ait degil. Backend
  // ikisini tek kodla bildiriyor (kehanet olmasin diye) ve kullanici acisindan
  // dogru davranis ayni: yeniden arama.
  fueling_selection_context_expired:
    'driverPortal.fuelStations.errors.selectionExpired',
  fueling_station_not_in_context: 'driverPortal.fuelStations.errors.selectionExpired',
  fuel_product_not_compatible: 'driverPortal.fuelStations.errors.fuelNotCompatible',
  fuel_product_not_offered: 'driverPortal.fuelStations.errors.fuelNotOffered',
  active_fueling_intent_not_found: 'driverPortal.fuelStations.errors.noActiveIntent',
  fueling_intent_conflict: 'driverPortal.fuelStations.errors.intentConflict',
};

export const FUEL_STATION_ERROR_CODES = Object.keys(PROVIDER_ERROR_KEYS);

/** Uretimde ust seviye `code`, gelistirmede ayrica `details.code`. */
export function extractApiErrorCode(error: unknown): string | null {
  const data = (error as { response?: { data?: unknown } } | undefined)?.response?.data;
  if (!data || typeof data !== 'object') return null;

  const top = (data as { code?: unknown }).code;
  if (typeof top === 'string' && top.trim()) return top;

  const details = (data as { details?: unknown }).details;
  if (details && typeof details === 'object') {
    const nested = (details as { code?: unknown }).code;
    if (typeof nested === 'string' && nested.trim()) return nested;
  }
  return null;
}

export function fuelStationErrorKey(error: unknown): string | null {
  const code = extractApiErrorCode(error);
  if (!code) return null;
  return PROVIDER_ERROR_KEYS[code] ?? null;
}

/** Tarayici Geolocation hata kodlarinin ceviri anahtarlari. */
export type GeolocationFailureReason = 'denied' | 'unavailable' | 'timeout' | 'unsupported';

export function geolocationErrorKey(reason: GeolocationFailureReason): string {
  switch (reason) {
    case 'denied':
      return 'driverPortal.fuelStations.errors.locationDenied';
    case 'timeout':
      return 'driverPortal.fuelStations.errors.locationTimeout';
    case 'unsupported':
      return 'driverPortal.fuelStations.errors.locationUnsupported';
    default:
      return 'driverPortal.fuelStations.errors.locationUnavailable';
  }
}
