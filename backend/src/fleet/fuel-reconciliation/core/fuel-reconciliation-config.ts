/**
 * Faz 11 — yakit fisi / telematik mutabakatinin TEK esik dosyasi.
 *
 * NEDEN TEK YERDE: bu sayilar bir filoda "kac fis insana gider"i belirliyor.
 * Servise ve arayuze dagilmis sabitler, esik degistiginde birbirini tutmayan
 * iki gercek uretirdi — ekran "500 m" yazarken motor 800 m'ye bakardi.
 *
 * DEGISTIRIRKEN: `FUEL_RECONCILIATION_ALGORITHM_VERSION` artirilmali. Eski
 * satirlar hangi kurallarla uretildigini boylece tasimaya devam eder.
 */

/** Kural setinin surumu — her esik degisikliginde artar. */
export const FUEL_RECONCILIATION_ALGORITHM_VERSION = 1;

/**
 * Telemetriden yakit seviyesi ornegi SAKLAMA politikasi.
 *
 * Her cerceveyi saklamak cihaz basina gunde on binlerce satir demekti. Iki
 * kapiyi da acik tutuyoruz: duzenli araliklarla bir taban serisi, VE seviye
 * anlamli sicradiginda (yakit alimi) aninda bir satir. Ikincisi olmasaydi
 * seyreltme tam da olcmek istedigimiz olayi kacirabilirdi.
 */
export const FUEL_LEVEL_SAMPLE_CAPTURE = {
  /** Degisim yoksa iki ornek arasindaki en kisa sure. */
  minIntervalMs: 5 * 60_000,
  /** Bu kadar puanlik degisim, araligi beklemeden ornek yazdirir. */
  minDeltaPct: 1,
  /**
   * Saklama suresi. Yakit fisleri gunler icinde onaylaniyor; aylarca geriye
   * donuk seviye serisi tutmanin mutabakata katkisi yok, kisisel veri
   * ekonomisine zarari var.
   */
  retentionDays: 120,
  /**
   * Cihaz saati ileri kaymis kayitlar. Bu kadar ilerideki bir damga saat
   * hatasidir; olcum olarak kullanilmaz.
   */
  maxClockSkewMs: 10 * 60_000,
} as const;

export const FUEL_RECONCILIATION_THRESHOLDS = {
  /** --- Yakit seviyesi penceresi --- */
  /** Fis zamanindan ONCE bakilan sure: pompa, fisin basildigi andan oncedir. */
  levelWindowBeforeMinutes: 90,
  /** Fis zamanindan SONRA bakilan sure: seviye kontak acilinca guncellenebilir. */
  levelWindowAfterMinutes: 180,
  /**
   * Sensor cozunurlugu (puan). Bunun altindaki bir "artis" olcum degil
   * gurultudur ve kullaniciya fark olarak sunulmaz.
   */
  sensorResolutionPct: 1,
  /**
   * Beklenen artis bu kadar cozunurluk adimindan kucukse seviye kurallari HIC
   * calismaz: 800 litrelik bir depoya 15 litre eklemek sensorde gorunmez ve
   * "artis yok" demek yanlis alarm olurdu.
   */
  minExpectedRiseResolutionSteps: 2,

  /** --- Litre farki --- */
  /** Bu litrenin altindaki fark her zaman normal sayilir. */
  levelDiffAbsoluteToleranceLiters: 8,
  /** Orta sinyal esigi: fis litresinin yuzdesi olarak fark. */
  levelDiffModerateRatio: 0.15,
  /** Guclu sinyal esigi. */
  levelDiffStrongRatio: 0.4,

  /** --- Depo kapasitesi --- */
  /**
   * Kapasitenin uzerine bu oran kadar musaade: uretici hacmi ile gercek
   * doldurulabilir hacim birebir ayni degil.
   */
  capacityToleranceRatio: 0.05,

  /** --- Konum --- */
  /** Bu yaricapin icinde arac istasyondadir. */
  stationNearMeters: 500,
  /** Bu mesafenin otesi GUCLU sinyal. */
  stationFarMeters: 2_000,
  /**
   * Konum kiyaslamasi icin fis zamani etrafindaki pencere. Seviye
   * penceresinden DAR: "o sirada oradaydi" sorusu, "depo ne zaman doldu"
   * sorusundan daha keskin bir zaman istiyor.
   */
  positionWindowMinutes: 30,

  /** --- Zaman --- */
  /** Fis zamani ile seviye artisinin gozlendigi an arasindaki orta sinyal esigi. */
  receiptToRiseModerateMinutes: 45,

  /** --- Fiyat --- */
  /**
   * Fiyat snapshot'i fis zamanina bu kadar yakinsa karsilastirilabilir.
   * DAHA ESKISI KULLANILMAZ: gunun fiyatiyla dunun fisini karsilastirmak
   * gercek bir sapma degil, takvim farkidir.
   */
  priceSnapshotMaxAgeMinutes: 240,
  /** Birim fiyat sapmasi orta sinyal esigi. */
  priceDeviationRatio: 0.15,

  /** --- Olasi tekrar --- */
  duplicateWindowMinutes: 180,
  /** Tutar farki bu oranin altindaysa "ayni tutar" sayilir. */
  duplicateAmountRatio: 0.02,

  /** --- Mesafe / tuketim --- */
  /** Ortalama tuketimden sapma orta sinyal esigi. */
  consumptionDeviationRatio: 0.35,
  /** Bu mesafenin altinda ortalama tuketim anlamli degil. */
  consumptionMinDistanceKm: 50,

  /** --- Gec gelen telematik icin yeniden hesaplama --- */
  /**
   * Fis onayindan sonra analizin taze veriyle guncellenebilecegi sure.
   * Sonrasinda kapanir: aylar sonra degisen bir risk seviyesi, muhasebenin
   * uzerinde calistigi kuyrugu surekli yeniden karistirirdi.
   */
  recalculationWindowHours: 48,
  /** Iki yeniden hesaplama arasindaki en kisa sure. */
  recalculationMinIntervalMinutes: 60,
  /** Basarisiz hesabin en fazla kac kez denenecegi. */
  maxCalculationAttempts: 5,

  /** --- Puanlama --- */
  weights: {
    strong: 50,
    moderate: 20,
  },
} as const;

/**
 * Sinyallerin BAGIMSIZLIK gruplari.
 *
 * "Birden fazla bagimsiz orta sinyal" kurali sinyal SAYISINI degil grup
 * sayisini sayiyor: ayni yakit seviyesi olcumunden dogan iki kusur, iki ayri
 * kanit degildir.
 */
export type FuelReconciliationSignalGroup =
  | 'quantity'
  | 'location'
  | 'time'
  | 'price'
  | 'duplicate'
  | 'product'
  | 'consumption';
