import type { FuelProductType } from '@prisma/client';

/**
 * Saglayicidan bagimsiz fis okuma modeli.
 *
 * Ham saglayici cevabi ASLA bu tipin otesine gecmez: ne servise, ne
 * veritabanina, ne de loglara. Ikinci bir saglayici eklendiginde degisen tek
 * sey adaptor (bkz. FuelStationProvider ile ayni disiplin).
 */

/**
 * Tek bir okunmus alan.
 *
 * `confidence` AYRI tutuluyor cunku arayuz dusuk guvenli alani isaretlemek
 * zorunda: OCR'in "1,719" mu "1719" mu okudugunu surucu gormeden onaylarsa
 * yanlis tutar canonical kayda gecer. Saglayici guven vermiyorsa null —
 * uydurma bir yuzde YAZILMAZ.
 */
export interface OcrField<T> {
  value: T | null;
  /** 0..1 arasi. Saglayici bildirmiyorsa null; "bilinmiyor" demektir. */
  confidence: number | null;
}

/**
 * Normalize edilmis fis okumasi.
 *
 * DIKKAT — bu bir TASLAKTIR, canonical kayit degil. Surucu onaylamadan hicbir
 * degeri FleetFuelEntry'nin canonical alanlarina yazilmaz.
 */
export interface NormalizedFuelReceiptExtraction {
  stationName: OcrField<string>;
  stationAddress: OcrField<string>;
  receiptNumber: OcrField<string>;
  /** ISO 8601. Saglayici saat vermiyorsa yalnizca tarih olabilir. */
  purchasedAt: OcrField<string>;
  /**
   * Yakit urunu.
   *
   * TAHMIN YOK: saglayicinin metnini canonical enum'a guvenle esleyemiyorsak
   * `value: null` doner ve ham metin `rawFuelLabel`'da kalir. "Super" yazan bir
   * fisi E5 mi E10 mu diye tahmin etmek yanlis yakit kaydi uretir.
   */
  fuelProduct: OcrField<FuelProductType>;
  /** Eslenemeyen yakit metni — surucuye gosterilir, canonical alana yazilmaz. */
  rawFuelLabel: string | null;
  liters: OcrField<number>;
  pricePerLiter: OcrField<number>;
  /** YAKIT satirinin brut toplami. */
  fuelGrossAmount: OcrField<number>;
  /** Fisin GENEL brut toplami (yakit + market + hizmet). */
  receiptGrossAmount: OcrField<number>;
  receiptNetAmount: OcrField<number>;
  receiptVatAmount: OcrField<number>;
  receiptVatRate: OcrField<number>;
  currency: OcrField<string>;
  paymentMethod: OcrField<string>;
  odometerKm: OcrField<number>;
  plateNumber: OcrField<string>;
  /**
   * Fiste yakit disi kalem var mi (kahve, market, arac yikama).
   *
   * true ise arayuz yakit toplami ile fis genel toplamini AYRI sorar; genel
   * toplami arac yakit maliyeti olarak yazmak maliyeti sisirir.
   */
  hasNonFuelItems: boolean;
}

/** Verinin gercek mi demo mu oldugu — istemci kendi env'inden tahmin etmez. */
export type FuelReceiptOcrDataMode = 'live' | 'mock';

/**
 * Teknik olmayan hata SINIFI.
 *
 * Saglayici mesaji ve yigin izi buraya GIRMEZ: bu deger veritabanina yaziliyor
 * ve arayuzde kullanici metnine cevriliyor.
 */
export type FuelReceiptOcrErrorClass =
  /** Saglayici yapilandirilmamis (anahtar/URL yok). */
  | 'not_configured'
  /** Goruntu okunamadi (bulanik, kirpik, bos sayfa). */
  | 'unreadable'
  /** Belge bir yakit fisine benzemiyor. */
  | 'not_a_fuel_receipt'
  /** Zaman asimi, ag hatasi ya da saglayici 5xx. */
  | 'provider_unavailable'
  /** Saglayici istegi reddetti (kota, gecersiz anahtar). */
  | 'provider_rejected';

export type FuelReceiptOcrResult =
  | { ok: true; extraction: NormalizedFuelReceiptExtraction }
  | { ok: false; errorClass: FuelReceiptOcrErrorClass };

/** Adaptore verilen girdi. Dosyanin KENDISI degil, nereden okunacagi. */
export interface FuelReceiptOcrInput {
  absolutePath: string;
  /**
   * Surucunun yukledigi TEMIZLENMIS dosya adi.
   *
   * Gercek saglayicilar bunu tanilama icin kullanir; mock saglayici ayrica
   * hangi fixture'in donecegine karar vermek icin okur (dosya adinda "mixed"
   * gecen bir yukleme karma fis senaryosunu kurar). Depolanan ad rastgele
   * uretildigi icin ipucu ORADAN okunamaz.
   */
  originalName: string;
  mimeType: string;
  /** Yalnizca tanilama icin; saglayiciya gonderilmez. */
  sizeBytes: number;
}

/**
 * Saglayici sozlesmesi.
 *
 * Sorumlulugu YALNIZCA okuma + normalizasyon. Sahiplik, arac cozumlemesi, yakit
 * uyumlulugu ve is akisi BU KATMANDA DEGIL — adaptor kimin fisini okudugunu
 * bilmez ve bilmemeli.
 */
export interface FuelReceiptOcrProvider {
  /** Yanit ve loglarda gorunen ad. Anahtar ICERMEZ. */
  readonly name: string;
  readonly version: string;
  readonly dataMode: FuelReceiptOcrDataMode;
  isConfigured(): boolean;
  analyze(input: FuelReceiptOcrInput): Promise<FuelReceiptOcrResult>;
}

/** Nest DI token'i — somut adaptor yerine sozlesme enjekte edilir. */
export const FUEL_RECEIPT_OCR_PROVIDER = 'FUEL_RECEIPT_OCR_PROVIDER';

/** Bos bir okuma iskeleti — adaptorler bunun uzerine yazar. */
export function emptyExtraction(): NormalizedFuelReceiptExtraction {
  const blank = <T>(): OcrField<T> => ({ value: null, confidence: null });
  return {
    stationName: blank<string>(),
    stationAddress: blank<string>(),
    receiptNumber: blank<string>(),
    purchasedAt: blank<string>(),
    fuelProduct: blank<FuelProductType>(),
    rawFuelLabel: null,
    liters: blank<number>(),
    pricePerLiter: blank<number>(),
    fuelGrossAmount: blank<number>(),
    receiptGrossAmount: blank<number>(),
    receiptNetAmount: blank<number>(),
    receiptVatAmount: blank<number>(),
    receiptVatRate: blank<number>(),
    currency: blank<string>(),
    paymentMethod: blank<string>(),
    odometerKm: blank<number>(),
    plateNumber: blank<string>(),
    hasNonFuelItems: false,
  };
}
