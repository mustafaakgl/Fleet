export type FuelReceiptOcrProviderKind = 'mock' | 'disabled' | 'azure_document_intelligence';

/** Kabul edilen degerler — hata mesaji ve dogrulama TEK kaynaktan. */
export const FUEL_RECEIPT_OCR_PROVIDER_KINDS: readonly FuelReceiptOcrProviderKind[] = [
  'disabled',
  'mock',
  'azure_document_intelligence',
];

/**
 * Varsayilan: KAPALI.
 *
 * Faz 3'teki istasyon saglayicisindan farkli bir varsayilan, bilincli:
 * Tankerkonig'de onaylanmis ve yapilandirilmis gercek bir saglayici VARDI.
 * OCR icin repoda hicbir saglayici yok (ne kod ne bagimlilik — dogrulandi).
 * Rastgele bir ucretli servis secip varsayilan yapmak, kimsenin sozlesme
 * imzalamadigi bir saticiya bagimlilik uretirdi. Bu yuzden varsayilan
 * `disabled`: OCR calismaz, fis yine yuklenir ve form ELLE doldurulur.
 *
 * FAZ 10 NOTU: gercek bir saglayici (Azure) eklendi ama VARSAYILAN
 * DEGISMEDI. Ucretli bir dis servisi varsayilan yapmak, yapilandirmayi hic
 * gormemis bir kurulumu sessizce faturaya baglardi. Acikca secilmeli.
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

  if (value === 'azure_document_intelligence') {
    // Uretimde IZINLI: gercek saglayici. Yapilandirma eksikse adaptor
    // kurulumu acilista firlatir (bkz. resolveAzureDocumentIntelligenceConfig).
    return 'azure_document_intelligence';
  }

  throw new Error(
    `FUEL_RECEIPT_OCR_PROVIDER must be one of ${FUEL_RECEIPT_OCR_PROVIDER_KINDS.join(
      ', ',
    )} (received "${raw}").`,
  );
}

/**
 * Health ucu icin HASSAS OLMAYAN OCR ozeti.
 *
 * Endpoint, anahtar, model kimligi ve operasyon kimligi BILINCLI olarak yok:
 * health ucu cogu kurulumda kimlik dogrulamasiz erisilebilir ve bir kesif
 * araci olmamali. Doner deger yalnizca "hangi saglayici, canli mi, ayarli mi"
 * sorusunu cevaplar.
 *
 * Yapilandirma HATALIYSA firlatmaz: health ucunun kendisi, yanlis
 * yapilandirma yuzunden 500 vermemeli — `configured: false` doner ve bu zaten
 * aranan sinyaldir.
 */
export function describeFuelReceiptOcr(env: NodeJS.ProcessEnv = process.env): {
  provider: FuelReceiptOcrProviderKind;
  mode: 'live' | 'mock' | 'disabled';
  configured: boolean;
} {
  let kind: FuelReceiptOcrProviderKind;
  try {
    kind = resolveFuelReceiptOcrProviderKind(env.FUEL_RECEIPT_OCR_PROVIDER);
  } catch {
    return { provider: 'disabled', mode: 'disabled', configured: false };
  }

  if (kind === 'mock') {
    return { provider: 'mock', mode: 'mock', configured: true };
  }
  if (kind === 'disabled') {
    return { provider: 'disabled', mode: 'disabled', configured: false };
  }

  // Azure: yalnizca "gerekli degiskenler dolu mu" — degerler okunmuyor.
  const configured = Boolean(
    env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT?.trim() &&
      env.AZURE_DOCUMENT_INTELLIGENCE_API_KEY?.trim() &&
      env.AZURE_DOCUMENT_INTELLIGENCE_REGION?.trim(),
  );
  return { provider: 'azure_document_intelligence', mode: 'live', configured };
}

/**
 * Iki OCR denemesi arasindaki en kisa sure.
 *
 * Her deneme UCRETLI bir dis cagri; dugmeye arka arkaya basmak faturayi
 * katlamamali. 20 saniye, gercek bir "yeniden dene" niyetini engellemeyecek
 * kadar kisa, tekrar tiklamayi durduracak kadar uzun.
 */
export const OCR_RETRY_COOLDOWN_MS = 20_000;
