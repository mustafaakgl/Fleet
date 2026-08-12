export type FuelStationProviderKind = 'tankerkoenig' | 'mock';

export const DEFAULT_FUEL_STATION_PROVIDER: FuelStationProviderKind = 'tankerkoenig';

/**
 * Uretimde mock secilirse atilan hata. Tek yerde duruyor ki boot dogrulamasi
 * ve modul fabrikasi ayni metni bildirsin.
 */
export const MOCK_PROVIDER_IN_PRODUCTION_MESSAGE =
  'FUEL_STATION_PROVIDER=mock is not allowed when NODE_ENV=production — ' +
  'demo fuel prices must never reach drivers. Set FUEL_STATION_PROVIDER=tankerkoenig ' +
  'and provide TANKERKOENIG_API_KEY.';

/**
 * Hangi yakit istasyonu saglayicisinin kullanilacagi.
 *
 * URETIM KORUMASI: `mock` yalnizca development/test ortamlarinda gecerli.
 * Uretimde secilmisse SESSIZCE live'a dusmuyoruz — bu, yapilandirmayi yanlis
 * bilen bir operatore "calisiyor" izlenimi verirdi. Hata firlatiliyor ki uygulama
 * ACILISTA dursun; sahte fiyatla yola cikan bir surucu, hic fiyat gormeyen
 * surucuden daha kotu durumda.
 *
 * Tanimlanmayan bir deger de reddediliyor: yazim hatasi (`FUEL_STATION_PROVIDER=moc`)
 * varsayilana dusup fark edilmemesin.
 */
/**
 * Kendi ortam kontrolu — env.validation'dan ICE ALMIYOR bilincli olarak:
 * env.validation bu dosyadan hata metnini aliyor, ters yonde bir import
 * dairesel bagimlilik uretirdi.
 */
function isProduction(): boolean {
  return (process.env.NODE_ENV ?? 'development') === 'production';
}

export function resolveFuelStationProviderKind(
  raw = process.env.FUEL_STATION_PROVIDER,
  production = isProduction(),
): FuelStationProviderKind {
  const value = raw?.trim().toLowerCase();

  if (!value) {
    return DEFAULT_FUEL_STATION_PROVIDER;
  }

  if (value === 'mock') {
    if (production) {
      throw new Error(MOCK_PROVIDER_IN_PRODUCTION_MESSAGE);
    }
    return 'mock';
  }

  if (value === 'tankerkoenig') {
    return 'tankerkoenig';
  }

  throw new Error(
    `FUEL_STATION_PROVIDER must be "tankerkoenig" or "mock" (received "${raw}").`,
  );
}
