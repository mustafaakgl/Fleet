export type FuelReceiptOcrProviderKind = 'mock' | 'disabled';

/**
 * Varsayilan: KAPALI.
 *
 * Faz 3'teki istasyon saglayicisindan farkli bir varsayilan, bilincli:
 * Tankerkonig'de onaylanmis ve yapilandirilmis gercek bir saglayici VARDI.
 * OCR icin repoda hicbir saglayici yok (ne kod ne bagimlilik — dogrulandi).
 * Rastgele bir ucretli servis secip varsayilan yapmak, kimsenin sozlesme
 * imzalamadigi bir saticiya bagimlilik uretirdi. Bu yuzden varsayilan
 * `disabled`: OCR calismaz, fis yine yuklenir ve form ELLE doldurulur.
 */
export const DEFAULT_FUEL_RECEIPT_OCR_PROVIDER: FuelReceiptOcrProviderKind = 'disabled';

export const MOCK_OCR_PROVIDER_IN_PRODUCTION_MESSAGE =
  'FUEL_RECEIPT_OCR_PROVIDER=mock is not allowed when NODE_ENV=production — ' +
  'demo receipt data must never become a booked fuel cost. Set ' +
  'FUEL_RECEIPT_OCR_PROVIDER=disabled (drivers fill the form manually) or ' +
  'wire a real provider adapter.';

/** env.validation dairesel import uretmesin diye kendi ortam kontrolu. */
function isProduction(): boolean {
  return (process.env.NODE_ENV ?? 'development') === 'production';
}

/**
 * Hangi OCR saglayicisinin kullanilacagi.
 *
 * URETIM KORUMASI: `mock` yalnizca development/test'te gecerli. Uretimde
 * secilmisse SESSIZCE disabled'a dusmuyoruz — yapilandirmayi yanlis bilen bir
 * operatore "calisiyor" izlenimi verirdi ve uydurma fis tutarlari muhasebeye
 * gercek maliyet gibi girerdi. Acilista hata firlatiliyor.
 *
 * Taninmayan deger de reddediliyor: yazim hatasi (`=moc`) sessizce varsayilana
 * dusup fark edilmesin.
 */
export function resolveFuelReceiptOcrProviderKind(
  raw = process.env.FUEL_RECEIPT_OCR_PROVIDER,
  production = isProduction(),
): FuelReceiptOcrProviderKind {
  const value = raw?.trim().toLowerCase();

  if (!value) {
    return DEFAULT_FUEL_RECEIPT_OCR_PROVIDER;
  }

  if (value === 'mock') {
    if (production) {
      throw new Error(MOCK_OCR_PROVIDER_IN_PRODUCTION_MESSAGE);
    }
    return 'mock';
  }

  if (value === 'disabled') {
    return 'disabled';
  }

  throw new Error(
    `FUEL_RECEIPT_OCR_PROVIDER must be "mock" or "disabled" (received "${raw}").`,
  );
}
