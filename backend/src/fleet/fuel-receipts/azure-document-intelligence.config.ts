/**
 * Azure Document Intelligence yapilandirmasi.
 *
 * ANAHTAR BU DOSYADAN DISARI CIKMAZ: `AzureDocumentIntelligenceConfig` yalnizca
 * adaptore verilir; hicbir yanit, log ya da hata mesaji anahtari icermez.
 * `describeForHealth()` bilincli olarak anahtarsiz ve endpoint'siz bir ozet
 * dondurur — health ucu bir kesif araci olmamali.
 */

/** Model kimligi. Yakit fisi icin perakende fis modeli kullaniliyor. */
export const DEFAULT_AZURE_MODEL_ID = 'prebuilt-receipt';

/**
 * API surumu PINLENMIS.
 *
 * "en son" surume yaslanmak, Azure bir alan adini degistirdiginde uygulamanin
 * SESSIZCE bos okuma uretmesi demekti. Surum yukseltmesi bilincli bir karar
 * olmali ve testlerle birlikte gelmeli.
 */
export const DEFAULT_AZURE_API_VERSION = '2024-11-30';

export const DEFAULT_AZURE_TIMEOUT_MS = 25_000;
/** Alt/ust sinir: 0 ms bir istegi dogarken oldururdu, 5 dk ise istegi asardi. */
export const MIN_AZURE_TIMEOUT_MS = 5_000;
export const MAX_AZURE_TIMEOUT_MS = 120_000;

/**
 * Izin verilen AB bolgeleri.
 *
 * DIKKAT — bu deger BIR BEYANDIR, kanit degil. Kaynagin gercekten bu bolgede
 * olusturuldugunu env degiskeninden dogrulayamayiz; endpoint alt alan adi da
 * guvenilir bir kanit degil. Bu yuzden liste yalnizca "yanlislikla ABD bolgesi
 * yazilmasini" engeller; gercek dogrulama pilot checklist'inde MANUEL bir
 * kapidir.
 */
export const ALLOWED_EU_REGIONS = [
  'westeurope',
  'northeurope',
  'germanywestcentral',
  'swedencentral',
  'francecentral',
] as const;

export type AzureRegion = (typeof ALLOWED_EU_REGIONS)[number];

export interface AzureDocumentIntelligenceConfig {
  endpoint: string;
  apiKey: string;
  region: AzureRegion;
  modelId: string;
  apiVersion: string;
  timeoutMs: number;
}

/** Health ucunun gorebilecegi HER SEY. Anahtar ve endpoint YOK. */
export interface OcrProviderHealth {
  provider: string;
  mode: 'live' | 'mock' | 'disabled';
  configured: boolean;
}

function fail(message: string): never {
  // Mesajlar ASLA deger icermez — yalnizca hangi degiskenin sorunlu oldugu.
  throw new Error(`Azure Document Intelligence: ${message}`);
}

function readTimeout(raw: string | undefined): number {
  if (!raw?.trim()) return DEFAULT_AZURE_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    fail('AZURE_DOCUMENT_INTELLIGENCE_TIMEOUT_MS must be an integer (milliseconds).');
  }
  if (parsed < MIN_AZURE_TIMEOUT_MS || parsed > MAX_AZURE_TIMEOUT_MS) {
    fail(
      `AZURE_DOCUMENT_INTELLIGENCE_TIMEOUT_MS must be between ${MIN_AZURE_TIMEOUT_MS} and ${MAX_AZURE_TIMEOUT_MS}.`,
    );
  }
  return parsed;
}

/**
 * Endpoint dogrulamasi.
 *
 * URETIMDE HTTPS ZORUNLU: anahtar her istekte header'da gidiyor; duz HTTP
 * uzerinde bu, anahtari agdaki herkese vermek demek. Testte `http://127.0.0.1`
 * gibi yerel bir sunucuya izin veriliyor — aksi halde adaptorun kendisi
 * sinanamazdi ve bu, guvenlik kontrolunu zayiflatmak degil, uretim disinda
 * yerel bir stub'a izin vermek.
 */
export function normalizeEndpoint(raw: string | undefined, production: boolean): string {
  const value = raw?.trim();
  if (!value) {
    fail('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT is required when the provider is azure_document_intelligence.');
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    fail('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT is not a valid absolute URL.');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    fail('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT must use http or https.');
  }
  if (production && url.protocol !== 'https:') {
    fail('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT must use https in production.');
  }
  // Sorgu ve fragment ATILIYOR: endpoint bir taban adres; icinde anahtar
  // tasiyan bir URL yanlislikla yapistirilirsa sessizce kullanilmasin.
  if (url.search || url.hash) {
    fail('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT must not contain a query string or fragment.');
  }

  // Sondaki egik cizgi normalize ediliyor ki origin karsilastirmasi kararli olsun.
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

function readRegion(raw: string | undefined): AzureRegion {
  const value = raw?.trim().toLowerCase();
  if (!value) {
    fail('AZURE_DOCUMENT_INTELLIGENCE_REGION is required (an EU region).');
  }
  if (!(ALLOWED_EU_REGIONS as readonly string[]).includes(value)) {
    fail(
      `AZURE_DOCUMENT_INTELLIGENCE_REGION must be one of: ${ALLOWED_EU_REGIONS.join(', ')}.`,
    );
  }
  return value as AzureRegion;
}

/**
 * Yapilandirmayi ACILISTA cozer.
 *
 * FAIL-FAST: eksik anahtar ilk surucu istegini bekleyip orada sessizce
 * "okunamadi" uretmemeli. Yanlis yapilandirilmis bir kurulum, surec
 * baslarken duyulur olmali.
 */
export function resolveAzureDocumentIntelligenceConfig(
  env: NodeJS.ProcessEnv = process.env,
  production = (env.NODE_ENV ?? 'development') === 'production',
): AzureDocumentIntelligenceConfig {
  const apiKey = env.AZURE_DOCUMENT_INTELLIGENCE_API_KEY?.trim();
  if (!apiKey) {
    fail('AZURE_DOCUMENT_INTELLIGENCE_API_KEY is required when the provider is azure_document_intelligence.');
  }
  // Uzunluk kontrolu DEGERI SIZDIRMAZ; yalnizca "bos string degil ama
  // belli ki placeholder" durumunu yakalar.
  if (apiKey.length < 16) {
    fail('AZURE_DOCUMENT_INTELLIGENCE_API_KEY looks like a placeholder (too short).');
  }

  return {
    endpoint: normalizeEndpoint(env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT, production),
    apiKey,
    region: readRegion(env.AZURE_DOCUMENT_INTELLIGENCE_REGION),
    modelId: env.AZURE_DOCUMENT_INTELLIGENCE_MODEL_ID?.trim() || DEFAULT_AZURE_MODEL_ID,
    apiVersion: env.AZURE_DOCUMENT_INTELLIGENCE_API_VERSION?.trim() || DEFAULT_AZURE_API_VERSION,
    timeoutMs: readTimeout(env.AZURE_DOCUMENT_INTELLIGENCE_TIMEOUT_MS),
  };
}
