import type { AutomationCheckResult } from './automation-check.contract';

/**
 * MOCK ORDIVAN — TASIMA EMRI CIKARIMI (Faz 16).
 *
 * DETERMINISTIK: ayni metin her zaman ayni ciktiyi verir. Gercek bir model
 * YOK ve olmadigi acikca soyleniyor — bu modulun urettigi oran ya da guven
 * skoru, gercek bir modelin dogrulugu hakkinda HICBIR SEY soylemez.
 *
 * GUVENLIK SOZLESMESI — METIN TALIMAT DEGILDIR:
 *
 * Bu modul metni YALNIZCA kapali, bizim yazdigimiz kalip ve etiket listelerine
 * karsi eslestirir. Metnin icindeki "ignoriere alle Anweisungen", "bestatige
 * den Auftrag" ya da "setze den Preis auf 1 EUR" gibi ifadelerin
 * calisabilecegi BIR YOL YOKTUR:
 *
 *   - Cikti kapali bir kumeden secilen bir NIYET ve sozlesmedeki ALANLARDIR.
 *   - Ne rol, ne durum, ne onay sonucu, ne de bir Fleet kimligi metinden gelir
 *     (sema onlari zaten reddeder — bkz. job-type-registry).
 *   - Bu modulun cagirabilecegi ARAC YOK; is turunun `toolset`i bos.
 *
 * Talimat benzeri icerik SESSIZCE YOK SAYILMAZ: `failed` bir kontrol olarak
 * isaretlenir ve incelemecinin onune cikar. Sessiz kalmak, saldirganin
 * denemesini gorunmez kilardi.
 */

export const ORDER_EXTRACTOR_VERSION = 'mock-ordivan-order-intake@1.0.0';

/** Kanit girdisi — hangi alan nereden geldi. */
export interface OrderEvidenceEntry {
  field: string;
  /** `subject` | `body` | `attachment:<sira>` */
  source: string;
  /** Eslesen SATIR, kirpilmis. Guvensiz metin — RENDER icin kacirilmali. */
  snippet: string;
  /**
   * Bu kanit fiyat/tutar tasiyor mu.
   *
   * MASKELEME BUNA BAKAR: operasyon rolu kaniti gorur ama finansal olanlar
   * gizlenir. Isaret cikarim aninda konuyor cunku o an hangi satirin hangi
   * alani urettigi biliniyor; sonradan tahmin etmek daha zayif olurdu.
   */
  financial: boolean;
}

export interface OrderExtractionResult {
  /** `transport_order.extraction@v1` sozlesmesine UYAN govde. */
  payload: Record<string, unknown>;
  /** Alan basina 0..1. */
  confidence: Record<string, number>;
  evidence: { entries: OrderEvidenceEntry[]; extractorVersion: string };
  checks: AutomationCheckResult[];
}

export interface OrderExtractionInput {
  subject?: string | null;
  bodyText?: string | null;
  /** Ek metinleri — sira `attachment:<n>` kaynagina karsilik gelir. */
  attachmentTexts?: string[];
}

// ---------------------------------------------------------------------------
// Guven duzeyleri — deterministik ve GEREKCELI
// ---------------------------------------------------------------------------

/** ACIK ETIKET ile bulundu (`Kundennummer: 10042`). */
const CONFIDENCE_LABELLED = 0.9;
/** Yalnizca KALIPLA bulundu (metinde gecen bir VAT numarasi). */
const CONFIDENCE_PATTERN = 0.6;
/**
 * ZAYIF: birden fazla aday vardi ya da baglam belirsiz.
 *
 * 0.5'IN ALTINDA olmasi bilincli — arayuz dusuk guveni bu esikle vurguluyor
 * ve zayif bir cikarimin "gozden gecirilmeden" onaylanmasi istenmiyor.
 */
const CONFIDENCE_WEAK = 0.4;

/** Bu esigin altindaki alanlar arayuzde VURGULANIR. */
export const LOW_CONFIDENCE_THRESHOLD = 0.5;

// ---------------------------------------------------------------------------
// Niyet
// ---------------------------------------------------------------------------

export type OrderIntent = 'new_order' | 'amendment' | 'cancellation' | 'unknown';

/**
 * NIYET TERIMLERI — kapali ve bizim listemizden.
 *
 * SIRA ONEMLI: iptal > degisiklik > yeni siparis. "Stornierung des
 * Transportauftrags" cumlesinde her uc grup da gecebilir; iptali once
 * degerlendirmezsek bir iptal mesaji sessizce YENI SIPARIS olurdu — ve bu,
 * bu fazdaki en pahali yanlis siniflandirma.
 */
const INTENT_TERMS: Record<Exclude<OrderIntent, 'unknown'>, readonly string[]> = {
  cancellation: [
    'stornierung', 'stornieren', 'storno', 'annullierung', 'annulliert',
    'absage', 'absagen', 'auftrag zuruckziehen', 'auftrag zurueckziehen', 'widerruf',
    'cancellation', 'cancel the order', 'cancelled', 'please cancel',
    'iptal', 'iptal ediyoruz', 'siparisi iptal',
  ],
  amendment: [
    // `Anderung` ve `Aenderung` IKISI DE gecer: NFD indirgemesi `ä`yi `a`
    // yapar ama gonderenin elle yazdigi `ae` cevriyazisini yapamaz. Iki
    // yazimi da listelemek, `ae`yi genel olarak `a`ya cevirmekten guvenli —
    // o donusum gercek kelimeleri bozardi.
    'anderung', 'aenderung', 'geandert', 'geaendert',
    'korrektur', 'korrigiert', 'aktualisierung',
    'verschiebung', 'verschoben', 'nachtrag', 'berichtigung', 'neuer termin',
    'amendment', 'amend', 'change request', 'please update', 'revised', 'correction',
    'degisiklik', 'guncelleme', 'revize', 'duzeltme',
  ],
  new_order: [
    'transportauftrag', 'frachtauftrag', 'speditionsauftrag', 'neuer auftrag',
    'auftragserteilung', 'wir beauftragen', 'bitte abholen', 'ladestelle',
    'transport order', 'shipment order', 'new order', 'please collect', 'pickup address',
    'tasima emri', 'yeni siparis', 'yukleme adresi',
  ],
};

// ---------------------------------------------------------------------------
// Talimat enjeksiyonu
// ---------------------------------------------------------------------------

/**
 * TALIMAT BENZERI ICERIK.
 *
 * Bu liste bir SAVUNMA DEGIL — savunma, ciktinin kapali bir sozlesmeye
 * hapsedilmis olmasi. Bu liste bir GORUNURLUK araci: birinin denedigini
 * incelemeciye soylemek icin var. Listeyi atlatmak mumkundur ve atlatmak
 * hicbir sey kazandirmaz.
 */
const INSTRUCTION_TERMS = [
  'ignoriere', 'ignoriere alle', 'vergiss alle', 'systemanweisung',
  'bestatige den auftrag', 'automatisch genehmigen', 'genehmige',
  'ohne prufung', 'keine rucksprache', 'sofort freigeben',
  'ignore previous', 'ignore all', 'disregard', 'system prompt',
  'auto approve', 'auto-approve', 'approve this order', 'approve without',
  'set the price', 'change the price', 'override',
  'talimatlari yok say', 'onceki talimatlari', 'otomatik onayla',
  'siparisi onayla', 'fiyati degistir', 'kontrol etmeden',
];

// ---------------------------------------------------------------------------
// Metin yardimcilari
// ---------------------------------------------------------------------------

/** Aksanlari ve Turkce/Almanca harfleri kaba ASCII karsiligina indirger. */
export function foldText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/ş/g, 's')
    .replace(/Ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/Ğ/g, 'g')
    .replace(/ß/g, 'ss')
    .toLowerCase();
}

interface Line {
  /** Orijinal satir — kanit snippet'i icin. */
  raw: string;
  /** Karsilastirma icin indirgenmis hali. */
  folded: string;
  source: string;
}

function toLines(input: OrderExtractionInput): Line[] {
  const lines: Line[] = [];
  const push = (text: string | null | undefined, source: string): void => {
    if (!text) return;
    for (const raw of text.split('\n')) {
      const trimmed = raw.trim();
      if (trimmed) lines.push({ raw: trimmed.slice(0, 300), folded: foldText(trimmed), source });
    }
  };
  push(input.subject, 'subject');
  push(input.bodyText, 'body');
  (input.attachmentTexts ?? []).forEach((text, index) => push(text, `attachment:${index + 1}`));
  return lines;
}

const AMOUNT = String.raw`\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?`;
const MONEY_LINE = new RegExp(String.raw`(${AMOUNT})\s*(eur|usd|chf|gbp|try|pln|€|₺|£|\$)|(eur|usd|chf|gbp|try|€|₺|£|\$)\s*(${AMOUNT})`, 'i');

/** Bir satir fiyat/tutar tasiyor mu — kanit maskeleme isareti icin. */
export function lineHasMoney(folded: string): boolean {
  return MONEY_LINE.test(folded);
}

/**
 * Etiketli deger okur: `Kundennummer: 10042`.
 *
 * `:` ya da `=` sonrasi ALINIYOR; etiketsiz serbest metin ALINMIYOR. Etiketsiz
 * okumak, imzadaki ya da alintilanan zincirdeki degerleri siparise tasirdi.
 */
function readLabelled(
  lines: Line[],
  labels: readonly string[],
  options: { maxLength: number; pattern?: RegExp } = { maxLength: 200 },
): { value: string; line: Line } | null {
  for (const line of lines) {
    for (const label of labels) {
      const index = line.folded.indexOf(label);
      if (index === -1) continue;
      const after = line.raw.slice(index + label.length);
      const separator = after.search(/[:=]/);
      if (separator === -1) continue;
      const value = after.slice(separator + 1).trim().split(/\s{2,}|[;|]/)[0]?.trim() ?? '';
      if (!value) continue;
      if (options.pattern && !options.pattern.test(value)) continue;
      return { value: value.slice(0, options.maxLength), line };
    }
  }
  return null;
}

/** Ilk kalip eslesmesi — etiket olmadan. */
function readPattern(lines: Line[], pattern: RegExp): { value: string; line: Line } | null {
  for (const line of lines) {
    const match = line.raw.match(pattern);
    if (match?.[0]) return { value: match[0], line };
  }
  return null;
}

/** ISO 'YYYY-MM-DD'. Belirsiz bicimde UYDURMA YAPILMAZ. */
function toIsoDate(value: string): string | null {
  const german = value.match(/(\d{1,2})[.](\d{1,2})[.](\d{4})/);
  if (german) {
    const [, day, month, year] = german;
    return `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
  }
  const iso = value.match(/(\d{4})-(\d{2})-(\d{2})/);
  return iso ? iso[0] : null;
}

// ---------------------------------------------------------------------------
// Cikarim
// ---------------------------------------------------------------------------

export function extractTransportOrder(input: OrderExtractionInput): OrderExtractionResult {
  const lines = toLines(input);
  const allFolded = lines.map((line) => line.folded).join('\n');

  const payload: Record<string, unknown> = {};
  const confidence: Record<string, number> = {};
  const entries: OrderEvidenceEntry[] = [];

  const record = (field: string, line: Line, score: number): void => {
    confidence[field] = score;
    entries.push({
      field,
      source: line.source,
      snippet: line.raw,
      financial: lineHasMoney(line.folded),
    });
  };

  // --- Niyet -------------------------------------------------------------
  let intent: OrderIntent = 'unknown';
  let intentConfidence = CONFIDENCE_WEAK;
  let intentLine: Line | null = null;

  for (const candidate of ['cancellation', 'amendment', 'new_order'] as const) {
    const hit = lines.find((line) => INTENT_TERMS[candidate].some((term) => line.folded.includes(term)));
    if (hit) {
      intent = candidate;
      intentLine = hit;
      // Konuda gecen niyet daha guvenilir: govdede alintilanan eski bir
      // zincir de ayni kelimeleri tasiyabilir.
      intentConfidence = hit.source === 'subject' ? CONFIDENCE_LABELLED : CONFIDENCE_PATTERN;
      break;
    }
  }
  payload.intent = intent;
  confidence.intent = intent === 'unknown' ? CONFIDENCE_WEAK : intentConfidence;
  if (intentLine) {
    entries.push({
      field: 'intent',
      source: intentLine.source,
      snippet: intentLine.raw,
      financial: lineHasMoney(intentLine.folded),
    });
  }

  // --- Musteri ipuclari --------------------------------------------------
  const customerName = readLabelled(lines, ['kunde', 'auftraggeber', 'firma', 'customer', 'musteri'], { maxLength: 200 });
  if (customerName) {
    payload.customerName = customerName.value;
    record('customerName', customerName.line, CONFIDENCE_LABELLED);
  }

  const customerNumber = readLabelled(
    lines,
    ['kundennummer', 'kunden-nr', 'kundennr', 'customer number', 'customer no', 'musteri no'],
    { maxLength: 40, pattern: /\d/ },
  );
  if (customerNumber) {
    payload.customerNumber = customerNumber.value;
    record('customerNumber', customerNumber.line, CONFIDENCE_LABELLED);
  }

  // AB KDV numarasi: iki harfli ulke kodu + rakamlar. Etiketsiz de guvenilir
  // bir KALIP, ama etiketliye gore dusuk guven aliyor.
  const vatLabelled = readLabelled(lines, ['ust-idnr', 'ustidnr', 'umsatzsteuer', 'vat id', 'vat-id', 'vergi no'], {
    maxLength: 30,
  });
  const vat = vatLabelled ?? readPattern(lines, /\b(?:DE|AT|NL|BE|FR|IT|ES|PL|CZ|HU|RO|BG|TR)[A-Z]?\d{8,11}\b/);
  if (vat) {
    payload.vatId = vat.value.replace(/\s+/g, '').slice(0, 30);
    record('vatId', vat.line, vatLabelled ? CONFIDENCE_LABELLED : CONFIDENCE_PATTERN);
  }

  const email = readPattern(lines, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  if (email) {
    payload.contactEmail = email.value.toLowerCase().slice(0, 254);
    record('contactEmail', email.line, CONFIDENCE_PATTERN);
  }

  // --- Referanslar -------------------------------------------------------
  const reference = readLabelled(
    lines,
    ['referenz', 'ihre zeichen', 'ihr zeichen', 'auftragsnummer', 'bestellnummer',
     'reference', 'order reference', 'po number', 'referans', 'siparis no'],
    { maxLength: 80 },
  );
  if (reference) {
    payload.externalReference = reference.value;
    record('externalReference', reference.line, CONFIDENCE_LABELLED);
  }

  const orderDate = readLabelled(lines, ['auftragsdatum', 'bestelldatum', 'order date', 'siparis tarihi'], {
    maxLength: 40,
  });
  const dateIso = orderDate ? toIsoDate(orderDate.value) : null;
  if (orderDate && dateIso) {
    payload.orderDate = dateIso;
    record('orderDate', orderDate.line, CONFIDENCE_LABELLED);
  }
  // TARIH UYDURULMUYOR: etiketli tarih yoksa alan BOS kaliyor. Mesajin
  // gonderim tarihini siparis tarihi saymak, sessiz bir varsayimdir.

  // --- Finans ------------------------------------------------------------
  /**
   * ONCE para birimli satir, SONRA fiyat kelimeli satir.
   *
   * `Frachtpreis: 1.250,00` gecerli bir girdidir ve tutari okumamak, "hicbir
   * fiyat yok" demek olurdu — oysa fiyat VAR, eksik olan para birimi. Tutari
   * okuyup para birimini bos birakmak, incelemeciye dogru soruyu sordurur;
   * ikisini birden atmak soruyu gorunmez kilar.
   */
  const moneyLine =
    lines.find((line) => lineHasMoney(line.folded)) ??
    lines.find((line) => PRICE_LABELS.some((label) => line.folded.includes(label)) && new RegExp(AMOUNT).test(line.folded));
  if (moneyLine) {
    const match = moneyLine.raw.match(new RegExp(MONEY_LINE.source, 'i'));
    // Para birimli eslesme yoksa tutari TEK BASINA okuyoruz: satirda bir fiyat
    // etiketi oldugunu zaten biliyoruz. Para birimi BOS kalir ve kontrol
    // `failed` olur — bu, tutari hic okumamaktan cok daha kullanisli, cunku
    // incelemeciye "hangi para birimi?" sorusunu SORDURUR.
    const rawAmount =
      match?.[1] ?? match?.[4] ?? moneyLine.raw.match(new RegExp(AMOUNT))?.[0] ?? null;
    const rawCurrency = (match?.[2] ?? match?.[3] ?? '').toLowerCase();
    const amount = rawAmount ? parseAmount(rawAmount) : null;
    if (amount !== null) {
      payload.revenueAmount = amount;
      record('revenueAmount', moneyLine, CONFIDENCE_PATTERN);
    }
    const currency = CURRENCY_BY_TOKEN[rawCurrency];
    if (currency) {
      payload.currency = currency;
      record('currency', moneyLine, CONFIDENCE_PATTERN);
    }
    // PARA BIRIMI UYDURULMUYOR: sembol/kod okunamadiysa alan BOS kalir.
    // Tutari EUR saymak, yanlis para biriminde bir sozlesme tutari demektir.
  }

  // --- Kalemler ----------------------------------------------------------
  const consignment = extractConsignment(lines, record);
  if (consignment) {
    payload.consignments = [consignment];
  }

  const instructions = readLabelled(lines, ['hinweise', 'bemerkung', 'anmerkung', 'special instructions', 'aciklama'], {
    maxLength: 2_000,
  });
  if (instructions) {
    payload.specialInstructions = instructions.value;
    record('specialInstructions', instructions.line, CONFIDENCE_LABELLED);
  }

  const instructionHit = lines.find((line) => INSTRUCTION_TERMS.some((term) => line.folded.includes(term)));

  return {
    payload,
    confidence,
    evidence: { entries: entries.slice(0, 100), extractorVersion: ORDER_EXTRACTOR_VERSION },
    checks: buildOrderChecks({
      payload,
      hasText: lines.length > 0,
      instructionDetected: Boolean(instructionHit),
      foldedAll: allFolded,
    }),
  };
}

/**
 * Fiyat ANLAMI tasiyan etiketler.
 *
 * Cipl ak sayi aramiyoruz: bir tasima emri agirlik, palet sayisi ve posta
 * koduyla doludur ve her sayiyi tutar saymak her mesaja yanlis bir fiyat
 * yazardi.
 */
const PRICE_LABELS = [
  'frachtpreis', 'fracht', 'preis', 'betrag', 'entgelt', 'pauschale', 'tarif',
  'price', 'amount', 'freight', 'rate', 'total',
  'fiyat', 'tutar', 'navlun', 'bedel',
];

const CURRENCY_BY_TOKEN: Record<string, string> = {
  eur: 'EUR', '€': 'EUR',
  usd: 'USD', $: 'USD',
  chf: 'CHF',
  gbp: 'GBP', '£': 'GBP',
  try: 'TRY', '₺': 'TRY',
  pln: 'PLN',
};

/**
 * `1.250,00` ve `1,250.00` ikisini de okur.
 *
 * SON ayrac ondalik sayilir: Almanca `1.250,00` ile Ingilizce `1,250.00`
 * arasindaki tek guvenilir fark budur. Ayrac tek ve arkasinda 3 rakam varsa
 * BINLIK sayilir — `1.250` bin iki yuz elli demektir, bir nokta virgul degil.
 */
export function parseAmount(raw: string): number | null {
  const cleaned = raw.trim();
  const lastSeparator = Math.max(cleaned.lastIndexOf(','), cleaned.lastIndexOf('.'));
  if (lastSeparator === -1) {
    const plain = Number(cleaned);
    return Number.isFinite(plain) ? plain : null;
  }
  const decimals = cleaned.length - lastSeparator - 1;
  const value =
    decimals === 3
      ? Number(cleaned.replace(/[.,]/g, ''))
      : Number(`${cleaned.slice(0, lastSeparator).replace(/[.,]/g, '')}.${cleaned.slice(lastSeparator + 1)}`);
  return Number.isFinite(value) ? value : null;
}

/**
 * Tek kalem cikarimi.
 *
 * BIRDEN FAZLA KALEM: bu mock tek kalem uretiyor ve bu bir SINIRLAMA, bir
 * tasarim karari degil — sozlesme 20 kaleme kadar tasiyor ve insan arayuzde
 * kalem ekleyebiliyor. Mock'un cok kalemli bir metni dogru bolmesi, gercek bir
 * modelin isi.
 */
function extractConsignment(
  lines: Line[],
  record: (field: string, line: Line, score: number) => void,
): Record<string, unknown> | null {
  const pickup = readLabelled(lines, ['ladestelle', 'beladestelle', 'abholadresse', 'pickup address', 'yukleme adresi'], {
    maxLength: 300,
  });
  const delivery = readLabelled(
    lines,
    ['entladestelle', 'abladestelle', 'lieferadresse', 'delivery address', 'bosaltma adresi'],
    { maxLength: 300 },
  );
  const cargo = readLabelled(lines, ['ladung', 'ware', 'gut', 'cargo', 'yuk'], { maxLength: 500 });
  const weight = readLabelled(lines, ['gewicht', 'weight', 'agirlik'], { maxLength: 40, pattern: /\d/ });
  const pallets = readLabelled(lines, ['paletten', 'palette', 'pallets', 'palet'], { maxLength: 20, pattern: /\d/ });

  const adrLine = lines.find((line) => /\badr\b|gefahrgut|tehlikeli madde|dangerous goods/.test(line.folded));

  if (!pickup && !delivery && !cargo && !adrLine) return null;

  const consignment: Record<string, unknown> = {
    // ADR DAIMA YAZILIYOR ve varsayilani `unknown`: sozlesme bu alani ZORUNLU
    // kiliyor ki "belirtilmemis" bir kalem sessizce `no` gibi islem gormesin.
    adr: 'unknown',
  };

  if (pickup) {
    consignment.pickupAddress = pickup.value;
    record('consignments[0].pickupAddress', pickup.line, CONFIDENCE_LABELLED);
  }
  if (delivery) {
    consignment.deliveryAddress = delivery.value;
    record('consignments[0].deliveryAddress', delivery.line, CONFIDENCE_LABELLED);
  }
  if (cargo) {
    consignment.cargoDescription = cargo.value;
    record('consignments[0].cargoDescription', cargo.line, CONFIDENCE_LABELLED);
  }
  if (weight) {
    const kilograms = parseAmount(weight.value.replace(/[^\d.,]/g, ''));
    if (kilograms !== null) {
      consignment.weightKg = kilograms;
      record('consignments[0].weightKg', weight.line, CONFIDENCE_LABELLED);
    }
  }
  if (pallets) {
    const count = Number.parseInt(pallets.value.replace(/[^\d]/g, ''), 10);
    if (Number.isFinite(count)) {
      consignment.palletCount = count;
      record('consignments[0].palletCount', pallets.line, CONFIDENCE_LABELLED);
    }
  }

  if (adrLine) {
    // UC DURUM: acikca "nein/no/hayir" denmediyse `unknown` kaliyor.
    if (/\b(nein|no|hayir|kein gefahrgut|keine gefahrgut|not adr|non-adr)\b/.test(adrLine.folded)) {
      consignment.adr = 'no';
    } else if (/\b(ja|yes|evet|gefahrgut|tehlikeli madde|dangerous goods|adr\s*[:=]?\s*(ja|yes|evet))\b/.test(adrLine.folded)) {
      consignment.adr = 'yes';
    }
    record('consignments[0].adr', adrLine, consignment.adr === 'unknown' ? CONFIDENCE_WEAK : CONFIDENCE_LABELLED);
  }

  // ZAMAN DILIMI: yalnizca ACIKCA yaziliyorsa. Bir saat gordugumuzde
  // `Europe/Berlin` VARSAYMIYORUZ — mesaj Rotterdam'dan da gelebilir.
  const timezone = readPattern(lines, /\b(?:Europe|Africa|America|Asia)\/[A-Za-z_]+\b/);
  if (timezone) {
    consignment.timezone = timezone.value;
    record('consignments[0].timezone', timezone.line, CONFIDENCE_PATTERN);
  }

  return consignment;
}

// ---------------------------------------------------------------------------
// Kontroller — UC DURUMLU
// ---------------------------------------------------------------------------

/**
 * `unknown` HICBIR YERDE "sorun yok" DEMEK DEGILDIR (Faz 12 sozlesmesi).
 *
 * Bir kontrol calistirilamadiysa bunu soylemek zorundayiz; sessizce gecmek,
 * kontrol edilmis izlenimi verir.
 */
export function buildOrderChecks(input: {
  payload: Record<string, unknown>;
  hasText: boolean;
  instructionDetected: boolean;
  foldedAll: string;
}): AutomationCheckResult[] {
  const checks: AutomationCheckResult[] = [];
  const consignments = Array.isArray(input.payload.consignments)
    ? (input.payload.consignments as Array<Record<string, unknown>>)
    : [];

  checks.push(
    input.payload.intent && input.payload.intent !== 'unknown'
      ? { code: 'order_intent_detected', status: 'verified', messageKey: 'orderIntake.checks.intentDetected' }
      : {
          code: 'order_intent_detected',
          status: 'unknown',
          messageKey: 'orderIntake.checks.intentDetected',
          unknownReason: input.hasText ? 'no_intent_signal' : 'no_readable_text',
        },
  );

  checks.push(
    input.payload.externalReference
      ? { code: 'order_reference_present', status: 'verified', messageKey: 'orderIntake.checks.referencePresent' }
      : {
          code: 'order_reference_present',
          status: 'unknown',
          messageKey: 'orderIntake.checks.referencePresent',
          unknownReason: 'no_reference_label',
        },
  );

  // PARA BIRIMI: tutar VAR ama para birimi YOKSA bu bir `failed` — "bilmiyorum"
  // degil. Para birimsiz bir tutar kullanilamaz ve EUR varsayilamaz.
  if (input.payload.revenueAmount !== undefined && !input.payload.currency) {
    checks.push({
      code: 'order_currency_present',
      status: 'failed',
      messageKey: 'orderIntake.checks.currencyMissing',
    });
  } else if (input.payload.currency) {
    checks.push({ code: 'order_currency_present', status: 'verified', messageKey: 'orderIntake.checks.currencyPresent' });
  } else {
    checks.push({
      code: 'order_currency_present',
      status: 'unknown',
      messageKey: 'orderIntake.checks.currencyPresent',
      unknownReason: 'no_amount_found',
    });
  }

  const adrValues = consignments.map((item) => item.adr);
  checks.push(
    adrValues.length > 0 && adrValues.every((value) => value === 'yes' || value === 'no')
      ? { code: 'order_adr_declared', status: 'verified', messageKey: 'orderIntake.checks.adrDeclared' }
      : {
          code: 'order_adr_declared',
          status: 'unknown',
          messageKey: 'orderIntake.checks.adrDeclared',
          unknownReason: adrValues.length === 0 ? 'no_consignment' : 'adr_not_stated',
        },
  );

  const hasWindow = consignments.some(
    (item) => item.pickupWindowStart || item.deliveryWindowStart,
  );
  const hasTimezone = consignments.some((item) => item.timezone);
  checks.push(
    hasTimezone
      ? { code: 'order_timezone_present', status: 'verified', messageKey: 'orderIntake.checks.timezonePresent' }
      : {
          code: 'order_timezone_present',
          status: hasWindow ? 'failed' : 'unknown',
          messageKey: 'orderIntake.checks.timezonePresent',
          // Saat VAR ama dilim YOKSA bu `failed`: saat kullanilamaz durumda.
          ...(hasWindow ? {} : { unknownReason: 'no_time_window' }),
        },
  );

  // TALIMAT BENZERI ICERIK: `failed` ve GORUNUR. Sessiz kalmak, saldirganin
  // denemesini gizlemek olurdu.
  checks.push(
    input.instructionDetected
      ? {
          code: 'order_instructions_detected',
          status: 'failed',
          messageKey: 'orderIntake.checks.instructionsDetected',
        }
      : {
          code: 'order_instructions_detected',
          status: 'verified',
          messageKey: 'orderIntake.checks.noInstructions',
        },
  );

  return checks;
}
