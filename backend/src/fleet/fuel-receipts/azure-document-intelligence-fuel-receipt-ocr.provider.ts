import { Injectable, Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import type { AzureDocumentIntelligenceConfig } from './azure-document-intelligence.config';
import {
  emptyExtraction,
  type FuelReceiptOcrErrorClass,
  type FuelReceiptOcrInput,
  type FuelReceiptOcrProvider,
  type FuelReceiptOcrResult,
  type NormalizedFuelReceiptExtraction,
  type OcrField,
} from './fuel-receipt-ocr.types';
import {
  checkFuelLineConsistency,
  detectCurrency,
  hasNonFuelDifference,
  matchFuelLabel,
  parseReceiptDecimal,
  selectFuelLine,
  type ReceiptLineItem,
} from './core/receipt-normalization.util';

/**
 * Azure Document Intelligence (`prebuilt-receipt`) adaptoru.
 *
 * SORUMLULUGU YALNIZCA OKUMA: kimin fisi, hangi arac, hangi is akisi —
 * adaptor bunlarin hicbirini bilmez ve bilmemeli.
 *
 * MODEL BEKLENTISI: `prebuilt-receipt` perakende fisi icin egitilmis genel bir
 * model; yakit fisi icin OZEL degil. Alman fislerinde litre genelde
 * `Quantity`, EUR/L `Price` alanina duser ama bu istasyondan istasyona
 * degisir. Bu yuzden adaptor HICBIR ALANI ZORUNLU SAYMAZ: okunamayan alan
 * bos kalir, surucu elle doldurur. Alan duzeyinde dogruluk iddiasi
 * TASINMIYOR; olcumu pilot veri setinin isi.
 */
@Injectable()
export class AzureDocumentIntelligenceFuelReceiptOcrProvider implements FuelReceiptOcrProvider {
  readonly name = 'azure_document_intelligence';
  readonly dataMode = 'live' as const;

  private readonly logger = new Logger(AzureDocumentIntelligenceFuelReceiptOcrProvider.name);

  constructor(private readonly config: AzureDocumentIntelligenceConfig) {}

  get version(): string {
    return `${this.config.modelId}@${this.config.apiVersion}`;
  }

  isConfigured(): boolean {
    return Boolean(this.config.endpoint && this.config.apiKey);
  }

  async analyze(input: FuelReceiptOcrInput): Promise<FuelReceiptOcrResult> {
    if (!this.isConfigured()) {
      return { ok: false, errorClass: 'not_configured' };
    }

    // Tum islem icin TEK butce: analyze + butun poll'lar. Her adima ayri
    // timeout vermek, toplamda dakikalarca suren bir istek uretebilirdi.
    const deadline = Date.now() + this.config.timeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const bytes = await readFile(input.absolutePath);
      const started = await this.startAnalysis(bytes, input.mimeType, controller.signal);
      if (!started.ok) {
        return { ok: false, errorClass: started.errorClass };
      }

      const polled = await this.pollForResult(started.operationUrl, controller.signal, deadline);
      if (!polled.ok) {
        return { ok: false, errorClass: polled.errorClass };
      }

      return { ok: true, extraction: this.toExtraction(polled.body) };
    } catch (error) {
      // HATA MESAJI DISARI CIKMAZ: yalnizca sinif. Azure'un metni anahtar
      // parcasi ya da fis icerigi tasiyabilir.
      const aborted = controller.signal.aborted;
      this.logger.warn(
        `Fuel receipt OCR failed (${aborted ? 'timeout' : 'transport'}); falling back to manual entry.`,
      );
      return { ok: false, errorClass: 'provider_unavailable' };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Analiz baslatma.
   *
   * TEKRAR DENEME YOK: belirsiz bir ag hatasindan sonra korlemesine ikinci POST
   * atmak, ilk istek Azure'a ULASMIS olabilecegi icin AYNI SAYFAYI IKI KEZ
   * faturalandirir. Analiz bir kez denenir; basarisizsa surucu manuel girise
   * dusuyor ve isterse acikca yeniden dener.
   *
   * Tek istisna: acik bir `429`. O durumda istegin ISLENMEDIGI kesin.
   */
  private async startAnalysis(
    bytes: Buffer,
    mimeType: string,
    signal: AbortSignal,
  ): Promise<StartResult> {
    const url = new URL(
      `${this.config.endpoint}/documentintelligence/documentModels/${encodeURIComponent(
        this.config.modelId,
      )}:analyze`,
    );
    url.searchParams.set('api-version', this.config.apiVersion);
    // SAYFA SINIRI: Azure SAYFA BASINA ucretlendiriyor. Yakit fisi tek
    // sayfadir; 30 sayfalik bir PDF yuklendiginde 30 sayfa odemeyelim.
    url.searchParams.set('pages', '1');

    let response = await this.send(url, bytes, mimeType, signal);

    if (response.status === 429) {
      const wait = retryAfterMs(response.headers.get('retry-after'));
      if (wait !== null) {
        await delay(wait, signal);
        // TEK kontrollu tekrar: 429 istegin islenmedigini soyler, cift
        // ucret riski yok.
        response = await this.send(url, bytes, mimeType, signal);
      }
    }

    if (response.status === 401 || response.status === 403) {
      return fail_('provider_rejected');
    }
    if (response.status === 429) {
      return fail_('provider_rejected');
    }
    if (response.status === 400 || response.status === 415) {
      // Azure belgeyi isleyemedi: bozuk/desteklenmeyen icerik.
      return fail_('unreadable');
    }
    if (!response.ok) {
      return fail_('provider_unavailable');
    }

    const operationLocation = response.headers.get('operation-location');
    if (!operationLocation) {
      return fail_('provider_unavailable');
    }

    // GUVENLIK: anahtar YALNIZCA yapilandirilmis origin'e gonderilir.
    // Saglayicinin dondurdugu keyfi bir URL'ye credential tasimak,
    // ele gecirilmis bir yanitin anahtari disari sizdirmasi demekti.
    if (!this.isTrustedOperationUrl(operationLocation)) {
      this.logger.error(
        'Fuel receipt OCR: Operation-Location pointed to an untrusted origin; request aborted.',
      );
      return fail_('provider_unavailable');
    }

    return { ok: true, operationUrl: operationLocation };
  }

  private send(
    url: URL,
    bytes: Buffer,
    mimeType: string,
    signal: AbortSignal,
  ): Promise<Response> {
    return fetch(url, {
      method: 'POST',
      headers: {
        // Anahtar YALNIZCA header'da; URL'ye asla konmaz (URL'ler loglanir).
        'Ocp-Apim-Subscription-Key': this.config.apiKey,
        'Content-Type': mimeType,
      },
      body: new Uint8Array(bytes),
      // Yonlendirme TAKIP EDILMEZ: baska bir origin'e 30x ile gidilirse
      // credential onunla birlikte tasinirdi.
      redirect: 'error',
      signal,
    });
  }

  /** `Operation-Location` yapilandirilmis endpoint ile AYNI origin'de mi. */
  private isTrustedOperationUrl(raw: string): boolean {
    try {
      const operation = new URL(raw);
      const configured = new URL(this.config.endpoint);
      return operation.origin === configured.origin;
    } catch {
      return false;
    }
  }

  /**
   * Sonuc bekleme.
   *
   * SINIRLI: butce bitince durur. Sonsuz polling, bir Azure arizasinda
   * istegi ve sunucu kaynagini süresiz tutardi. Aralik ustel olarak buyuyor
   * ve uzerine jitter ekleniyor — es zamanli yuklemeler ayni saniyede
   * hep birlikte poll etmesin.
   */
  private async pollForResult(
    operationUrl: string,
    signal: AbortSignal,
    deadline: number,
  ): Promise<PollResult> {
    let waitMs = 700;

    while (Date.now() < deadline) {
      await delay(Math.min(waitMs, Math.max(0, deadline - Date.now())), signal);
      if (Date.now() >= deadline) break;

      const response = await fetch(operationUrl, {
        headers: { 'Ocp-Apim-Subscription-Key': this.config.apiKey },
        redirect: 'error',
        signal,
      });

      if (response.status === 429 || response.status >= 500) {
        // Gecici: butce bitene kadar geri cekilerek tekrar dene.
        waitMs = Math.min(waitMs * 2, 4_000);
        continue;
      }
      if (response.status === 401 || response.status === 403) {
        return fail_('provider_rejected');
      }
      if (!response.ok) {
        return fail_('provider_unavailable');
      }

      const body: unknown = await response.json().catch(() => null);
      const status = readString(body, 'status');

      if (status === 'succeeded') {
        return { ok: true, body };
      }
      if (status === 'failed') {
        return fail_('unreadable');
      }
      if (status !== 'running' && status !== 'notStarted') {
        // Beklenmeyen govde: sema sozlesmesi tutmuyor.
        return fail_('provider_unavailable');
      }

      waitMs = Math.min(waitMs * 1.6, 4_000);
    }

    return fail_('provider_unavailable');
  }

  /**
   * Azure govdesini normalize modele cevirir.
   *
   * HAM GOVDE BU FONKSIYONUN OTESINE GECMEZ. `unknown` olarak aliniyor ve
   * tip korumalariyla okunuyor — `any` yok, dolayisiyla Azure bir alani
   * yeniden adlandirdiginda sessizce `undefined` okuyup devam etmiyoruz.
   */
  private toExtraction(body: unknown): NormalizedFuelReceiptExtraction {
    const extraction = emptyExtraction();
    const fields = readObject(readObject(readArray(readObject(body, 'analyzeResult'), 'documents')?.[0], 'fields'));
    if (!fields) return extraction;

    const merchant = readField(fields, 'MerchantName');
    const address = readField(fields, 'MerchantAddress');
    const date = readField(fields, 'TransactionDate');
    const time = readField(fields, 'TransactionTime');
    const total = readField(fields, 'Total');
    const subtotal = readField(fields, 'Subtotal');
    const tax = readField(fields, 'TotalTax');

    extraction.stationName = text(merchant);
    extraction.stationAddress = text(address);

    // Tarih ve saat AYRI alanlar; saat yoksa yalnizca tarih doner.
    const dateValue = fieldString(date);
    const timeValue = fieldString(time);
    if (dateValue) {
      extraction.purchasedAt = {
        value: timeValue ? `${dateValue}T${timeValue}` : dateValue,
        confidence: date?.confidence ?? null,
      };
    }

    const receiptTotal = fieldNumber(total);
    extraction.receiptGrossAmount = { value: receiptTotal, confidence: total?.confidence ?? null };
    extraction.receiptNetAmount = { value: fieldNumber(subtotal), confidence: subtotal?.confidence ?? null };
    extraction.receiptVatAmount = { value: fieldNumber(tax), confidence: tax?.confidence ?? null };

    // Para birimi: yalnizca ACIK kanittan. Azure'un para birimi kodu varsa
    // o da bir kanittir, ama yoksa metinden cikariliyor; hicbiri yoksa null.
    const currencyCode = fieldCurrencyCode(total) ?? fieldCurrencyCode(subtotal);
    extraction.currency = {
      value:
        currencyCode ??
        detectCurrency(fieldContent(total), fieldContent(subtotal), fieldContent(merchant)),
      confidence: currencyCode ? (total?.confidence ?? null) : null,
    };

    const items = readItems(fields);
    const selection = selectFuelLine(items);
    extraction.hasNonFuelItems = selection.hasNonFuelItems;

    if (selection.selected) {
      const item = selection.selected;
      extraction.liters = { value: item.quantity, confidence: item.confidence };
      extraction.pricePerLiter = { value: item.unitPrice, confidence: item.confidence };
      // MALIYETE YALNIZCA YAKIT SATIRI: fis genel toplami degil.
      extraction.fuelGrossAmount = { value: item.totalPrice, confidence: item.confidence };

      const match = selection.match;
      if (match?.product) {
        extraction.fuelProduct = { value: match.product, confidence: item.confidence };
      }
      // Belirsiz ya da eslenemeyen etiket surucuye HAM haliyle gosterilir.
      if (match && (match.product === null || match.ambiguous)) {
        extraction.rawFuelLabel = match.rawLabel || null;
      }

      // Litre x fiyat toplami tutmuyorsa DEGER DUZELTILMEZ; guven dusurulur
      // ve arayuz uyarir.
      const consistency = checkFuelLineConsistency(item.quantity, item.unitPrice, item.totalPrice);
      if (consistency.checked && !consistency.consistent) {
        extraction.liters.confidence = null;
        extraction.pricePerLiter.confidence = null;
        extraction.fuelGrossAmount.confidence = null;
      }
    } else if (selection.candidates.length > 1) {
      // Birden fazla aday: hicbiri kesinlestirilmiyor, ham etiketler
      // surucunun secmesi icin birlestiriliyor.
      extraction.rawFuelLabel = selection.candidates
        .map((item) => item.description?.trim())
        .filter(Boolean)
        .join(' / ');
    }

    // Fis toplami yakit toplamindan anlamli olcude buyukse karma fistir.
    if (hasNonFuelDifference(receiptTotal, extraction.fuelGrossAmount.value)) {
      extraction.hasNonFuelItems = true;
    }

    return extraction;
  }
}

// ---------------------------------------------------------------------------
// Sema korumalari — `unknown` girer, tipli deger cikar.
// ---------------------------------------------------------------------------

/**
 * AYIRICI BIRLESIM.
 *
 * Once hem operasyon URL'si hem hata sinifi duz `string` olarak donuyordu;
 * ikisi de string oldugu icin tip korumasi ayirt edemedi ve bir hata sinifi
 * URL sanilip poll edilmeye calisildi. Testler bunu yakaladi.
 */
type StartResult =
  | { ok: true; operationUrl: string }
  | { ok: false; errorClass: FuelReceiptOcrErrorClass };

type PollResult =
  | { ok: true; body: unknown }
  | { ok: false; errorClass: FuelReceiptOcrErrorClass };

function fail_(errorClass: FuelReceiptOcrErrorClass): { ok: false; errorClass: FuelReceiptOcrErrorClass } {
  return { ok: false, errorClass };
}

interface AzureField {
  confidence: number | null;
  content: string | null;
  valueString: string | null;
  valueNumber: number | null;
  valueDate: string | null;
  valueTime: string | null;
  currencyCode: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readObject(value: unknown, key?: string): Record<string, unknown> | null {
  if (key === undefined) return isRecord(value) ? value : null;
  if (!isRecord(value)) return null;
  const nested = value[key];
  return isRecord(nested) ? nested : null;
}

function readArray(value: unknown, key: string): unknown[] | null {
  if (!isRecord(value)) return null;
  const nested = value[key];
  return Array.isArray(nested) ? nested : null;
}

function readString(value: unknown, key: string): string | null {
  if (!isRecord(value)) return null;
  const nested = value[key];
  return typeof nested === 'string' ? nested : null;
}

function readNumber(value: unknown, key: string): number | null {
  if (!isRecord(value)) return null;
  const nested = value[key];
  return typeof nested === 'number' && Number.isFinite(nested) ? nested : null;
}

function readField(fields: Record<string, unknown>, key: string): AzureField | null {
  const raw = fields[key];
  if (!isRecord(raw)) return null;

  // Azure `valueCurrency` icinde { amount, currencyCode } dondurur.
  const currency = readObject(raw, 'valueCurrency');

  return {
    confidence: readNumber(raw, 'confidence'),
    content: readString(raw, 'content'),
    valueString: readString(raw, 'valueString'),
    valueNumber: readNumber(raw, 'valueNumber') ?? (currency ? readNumber(currency, 'amount') : null),
    valueDate: readString(raw, 'valueDate'),
    valueTime: readString(raw, 'valueTime'),
    currencyCode: currency ? readString(currency, 'currencyCode') : null,
  };
}

function text(field: AzureField | null): OcrField<string> {
  return { value: field?.valueString ?? field?.content ?? null, confidence: field?.confidence ?? null };
}

function fieldString(field: AzureField | null): string | null {
  return field?.valueDate ?? field?.valueTime ?? field?.valueString ?? null;
}

function fieldContent(field: AzureField | null): string | null {
  return field?.content ?? null;
}

function fieldCurrencyCode(field: AzureField | null): string | null {
  const code = field?.currencyCode?.trim().toUpperCase();
  return code && /^[A-Z]{3}$/.test(code) ? code : null;
}

/**
 * Sayisal alan.
 *
 * `valueNumber` yoksa HAM METINDEN okunuyor: Azure bazi fislerde tutari
 * ayristiramayip yalnizca `content` dondurur ve orada "79,72 €" yazar.
 * Locale'e gore degil, ayirici konumuna gore cozuluyor.
 */
function fieldNumber(field: AzureField | null): number | null {
  if (field?.valueNumber !== null && field?.valueNumber !== undefined) return field.valueNumber;
  return parseReceiptDecimal(field?.content ?? null);
}

/** `Items` dizisini normalize satirlara cevirir. */
function readItems(fields: Record<string, unknown>): ReceiptLineItem[] {
  const items = readObject(fields, 'Items');
  const array = items ? readArray(items, 'valueArray') : null;
  if (!array) return [];

  const rows: ReceiptLineItem[] = [];
  for (const entry of array) {
    const itemFields = readObject(readObject(entry), 'valueObject');
    if (!itemFields) continue;

    const description = readField(itemFields, 'Description');
    const quantity = readField(itemFields, 'Quantity');
    const price = readField(itemFields, 'Price');
    const totalPrice = readField(itemFields, 'TotalPrice');

    rows.push({
      description: description?.valueString ?? description?.content ?? null,
      quantity: fieldNumber(quantity),
      unitPrice: fieldNumber(price),
      totalPrice: fieldNumber(totalPrice),
      confidence: description?.confidence ?? null,
    });
  }
  return rows;
}

function retryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  // UST SINIR: Azure "300 saniye sonra dene" derse istegi bes dakika
  // bekletmeyiz — surucu manuel girise duser.
  return Math.min(seconds, 5) * 1000;
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('aborted'));
      },
      { once: true },
    );
  });
}
