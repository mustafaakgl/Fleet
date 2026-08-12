import type { FuelProductType } from '@prisma/client';

/**
 * Saglayicidan bagimsiz istasyon modeli.
 *
 * Ham saglayici cevabi ASLA bu tipin otesine gecmez: controller bunu dondurur,
 * boylece Tankerkonig'in alan adlari (ve api anahtari tasiyan istek detaylari)
 * istemciye sizmaz. Ikinci bir saglayici eklendiginde degisen tek sey adaptor.
 */
export interface FuelStationOffering {
  productType: FuelProductType;
  /** Litre basina fiyat. Saglayici fiyat vermediyse null — "bilinmiyor". */
  pricePerUnit: number | null;
  unit: 'liter';
  currency: 'EUR';
  /**
   * Fiyatin saglayiciya gore son degisim ani.
   *
   * Tankerkonig list.php boyle bir alan DONDURMUYOR (dogrulandi: yanitta
   * fiyat zaman damgasi yok), bu yuzden o adaptorde null kalir. Cekim anini
   * buraya yazmak, saglayicinin soylemedigi bir tazeligi uydurmak olurdu —
   * tazelik icin `retrievedAt` var.
   */
  updatedAt: string | null;
}

/** Kamyon erisimi. Saglayici soylemiyorsa 'unknown' — tahmin yok. */
export type FuelStationHgvAccess = 'unknown' | 'yes' | 'no';

/**
 * Istasyon adresi.
 *
 * Faz 1'de bu alanlar normalize modelde YOKTU — Tankerkonig list.php street,
 * houseNumber, postCode ve place donduruyor ama adaptor onlari atiyordu.
 * Surucu ekraninin istasyonu tanimasi icin gerekli: koordinat surucuye
 * "hangi benzinlik" sorusunu cevaplamiyor.
 *
 * Her alan ayri ayri nullable: saglayici bazi istasyonlarda ev numarasi
 * vermiyor ve eksik parcayi uydurmak yerine bos birakiyoruz.
 */
export interface FuelStationAddress {
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  city: string | null;
}

/**
 * Verinin gercek mi demo mu oldugu.
 *
 * Istemci bunu ENV degiskeninden DEGIL bu alandan okumali: frontend'in kendi
 * ortam degiskeni backend'in hangi saglayiciyla calistigini bilmez ve yanlis
 * tarafta "demo" uyarisi gosterip gercek fiyati sahte gibi (ya da tersi)
 * isaretleyebilir.
 */
export type FuelStationDataMode = 'live' | 'mock';

/**
 * Veri kaynagi atfi.
 *
 * Tankerkonig/MTS-K verisi CC BY 4.0 ile geliyor ve atfi GOSTERMEK zorunlu.
 * Mock modda kullaniciya teknik saglayici adi degil "demo verisi" bilgisi
 * gosterilir — bkz. FuelStationProvider.attribution.
 */
export interface FuelStationAttribution {
  label: string;
  url: string | null;
}

export interface NormalizedFuelStation {
  /** Saglayicinin kendi kimligi. Bizim tarafta kalici kayit yok. */
  id: string;
  provider: string;
  name: string;
  brand: string | null;
  /** Surucunun istasyonu tanimasi icin; parcalari ayri ayri eksik olabilir. */
  address: FuelStationAddress;
  latitude: number;
  longitude: number;
  distanceKm: number | null;
  isOpen: boolean | null;
  /**
   * Istasyonun fiyatlarinin saglayiciya gore guncellenme ani. Tankerkonig
   * bunu vermiyor -> null. Bkz. FuelStationOffering.updatedAt.
   */
  pricesUpdatedAt: string | null;
  /** Bu yaniti saglayicidan (ya da onbellekten yazildigi anda) aldigimiz an. */
  retrievedAt: string;
  /** Kamyon erisimi bilgisi saglayicidan gelmiyor; uydurulmuyor. */
  hgvAccess: FuelStationHgvAccess;
  /** Kabul edilen yakit kartlari saglayicidan gelmiyor; uydurulmuyor. */
  acceptedFuelCards: string[] | null;
  offerings: FuelStationOffering[];
}

export interface FuelStationSearchQuery {
  latitude: number;
  longitude: number;
  radiusKm: number;
}

export type FuelStationErrorCode =
  /** Anahtar/URL yok — uc bunu 503 olarak bildirir, cokmez */
  | 'provider_not_configured'
  /** Zaman asimi, ag hatasi ya da 5xx */
  | 'provider_unavailable'
  /** Saglayici istegi reddetti (gecersiz anahtar, kota, hatali parametre) */
  | 'provider_rejected'
  /** Cevap beklenen sekilde degil */
  | 'provider_unreadable';

/**
 * Basari/hata ayrimi istisna yerine tip uzerinde.
 *
 * RoutingResult ile ayni desen (bkz. routing/core/routing.types.ts): harici
 * saglayicinin gecici arizasi cagiran akisi cokertmemeli, kontrollu bir sonuca
 * donusmeli.
 */
export type FuelStationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: FuelStationErrorCode; message: string };

/**
 * Saglayici sozlesmesi.
 *
 * Sorumlulugu yalnizca arama + normalizasyon. Arac uyumlulugu, filtreleme ve
 * yetki BU KATMANDA DEGIL (bkz. FuelStationService) — adaptor hangi aracin ne
 * kabul ettigini bilmez.
 */
export interface FuelStationProvider {
  /** Yanit ve loglarda gorunen ad. Anahtar ICERMEZ. */
  readonly name: string;
  /**
   * Bu saglayicinin urettigi verinin gercek mi demo mu oldugu.
   *
   * Saglayicinin KENDISI bildiriyor, cagiran taraf env okuyup tahmin etmiyor:
   * boylece yeni bir saglayici eklendiginde isaretleme yeri tek.
   */
  readonly dataMode: FuelStationDataMode;
  /** Kullaniciya gosterilecek kaynak atfi. */
  readonly attribution: FuelStationAttribution;
  /** Anahtar/URL yapilandirildi mi. */
  isConfigured(): boolean;
  /**
   * Bu saglayicinin gercekten fiyat DONDURDUGU urunler.
   *
   * Tankerkonig icin yalnizca DIESEL/SUPER_E5/SUPER_E10. Listeye SUPER_PLUS,
   * HVO100 ya da ADBLUE eklenmesi, saglayicinin vermedigi veriyi var saymak
   * olur; arac o urunu kabul ediyorsa bile burada yoksa fiyat uretilmez.
   */
  supportedProducts(): readonly FuelProductType[];
  search(query: FuelStationSearchQuery): Promise<FuelStationResult<NormalizedFuelStation[]>>;
}

/** Nest DI token'i — somut adaptor yerine sozlesme enjekte edilir. */
export const FUEL_STATION_PROVIDER = 'FUEL_STATION_PROVIDER';
