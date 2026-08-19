import type { AutomationCheckResult } from './automation-check.contract';
import {
  DOCUMENT_TYPE_REGISTRY,
  type DocumentTypeKey,
  type InspectionSubtype,
} from './document-type-registry';
import { resolveProposedSegmentation, type PageRange } from './document-pages';
import type { UnsafeDocumentText } from './intake-file';

/**
 * MOCK ORDIVAN SINIFLANDIRICI (Faz 14) — SAF, DETERMINISTIK.
 *
 * GERCEK ORDIVAN, OLLAMA YA DA DIS AI YOK. Bu modul sabit bir sozlukle
 * calisan bir karar tablosudur; ayni girdi her zaman ayni ciktiyi verir.
 *
 * NEDEN BU, "gercekmis gibi" bir model degil: sentetik fixture'lar uzerinde
 * olculen bir dogruluk, gercek dogruluk DEGILDIR. Deterministik bir mock,
 * ne oldugu konusunda durust olur ve butun ardil mantigin (sayfa bolme,
 * arac eslestirme, yonlendirme, insan onayi) testini mumkun kilar.
 *
 * GUVENLIK SOZLESMESI — BELGE METNI TALIMAT DEGILDIR:
 * Bu fonksiyon metni YALNIZCA sabit bir anahtar listesine karsi eslestirir.
 * Metnin icindeki "ignore previous instructions", "auto-approve this" ya da
 * "set vehicle to X" gibi ifadelerin calisabilecegi BIR YOL YOKTUR: cikti
 * kapali bir kumeden secilen bir tur, bir sayfa araligi ve aday
 * DEGERLERDIR. Ne rol, ne hedef, ne onay durumu metinden gelir.
 */

export const CLASSIFIER_VERSION = 'mock-ordivan-inbox@1.0.0';

/** Turun `verified` sayilmasi icin gereken en dusuk guven. */
export const CONFIDENT_THRESHOLD = 0.7;

/**
 * ANAHTAR SOZLUGU — kapali ve bizim kontrolumuzde.
 *
 * Eslesen terimler `evidence`a yaziliyor; bu GUVENLI cunku terimler
 * BELGEDEN degil BU LISTEDEN geliyor. Belgenin ham metni hicbir yere
 * kopyalanmaz.
 */
const TYPE_TERMS: Record<Exclude<DocumentTypeKey, 'unknown@v1'>, readonly string[]> = {
  /**
   * Faz 16 — tasima emri. Terimler yine KAPALI ve bizim listemizden.
   *
   * `auftrag` TEK BASINA yeterli degil: bir servis faturasinda da gecebilir.
   * Bu yuzden liste tasima emrine OZGU terimlerden olusuyor (yukleme/bosaltma,
   * gonderici/alici, kolli). Yanlis siniflandirma `unknown`a duser ve insan
   * secer — sessizce siparis acilmaz.
   */
  'transport_order@v1': [
    'transportauftrag',
    'frachtauftrag',
    'speditionsauftrag',
    'ladestelle',
    'entladestelle',
    'abladestelle',
    'absender',
    'empfanger',
    'frachtfuhrer',
    'ladung',
    'kolli',
    'transport order',
    'shipment order',
    'consignment',
    'pickup address',
    'delivery address',
    'tasima emri',
    'yukleme adresi',
    'bosaltma adresi',
  ],
  'service_invoice@v1': [
    'rechnung',
    'werkstatt',
    'reparatur',
    'inspektion',
    'arbeitslohn',
    'ersatzteile',
    'kundendienst',
  ],
  'vehicle_inspection@v1': [
    'hauptuntersuchung',
    'untersuchungsbericht',
    'prufbericht',
    'sicherheitsprufung',
    'tuv',
    'dekra',
    'plakette',
  ],
  'vehicle_insurance@v1': [
    'versicherung',
    'versicherungsschein',
    'police',
    'haftpflicht',
    'teilkasko',
    'vollkasko',
    'beitragsrechnung',
  ],
  'traffic_fine@v1': [
    'bussgeldbescheid',
    'verwarnungsgeld',
    'ordnungswidrigkeit',
    'anhorungsbogen',
    'tatvorwurf',
    'verkehrsverstoss',
    'bussgeldstelle',
  ],
  'fuel_receipt@v1': [
    'tankstelle',
    'tankquittung',
    'kraftstoff',
    'diesel',
    'super e10',
    'liter',
    'zapfsaule',
  ],
};

/** Muayene alt turu — `unknown` "sorun yok" DEMEK DEGILDIR. */
const SUBTYPE_TERMS: Record<Exclude<InspectionSubtype, 'unknown'>, readonly string[]> = {
  tuv: ['hauptuntersuchung', 'tuv', 'plakette'],
  sp: ['sicherheitsprufung', 'sp-bericht', 'bremsenprufung'],
};

/**
 * TALIMAT BENZERI ICERIK.
 *
 * Bulunmasi bir SALDIRI KANITI degil, bir SINYALDIR: belgede modele emir
 * vermeye calisan metin var. Davranisi DEGISTIRMEZ (zaten degistiremez);
 * yalnizca kontrol listesinde `failed` olarak gorunur ki insan neye baktigini
 * bilsin.
 */
const INSTRUCTION_MARKERS = [
  'ignore previous',
  'ignore all previous',
  'disregard the above',
  'system prompt',
  'you are an ai',
  'auto-approve',
  'automatically approve',
  'set vehicle',
  'grant access',
  'execute the following',
  'anweisung an die ki',
  'bestatige automatisch',
];

/** Umlaut ve noktalama normalize edilir; eslestirme aksandan bagimsiz olmali. */
export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9\s.,:/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Alman plakasi: `DU-AB 123`. Kismi eslesme YOK — tam kalip. */
const PLATE_PATTERN = /\b([A-ZÄÖÜ]{1,3})-([A-Z]{1,2})\s?(\d{1,4})\b/g;
/** VIN: 17 karakter, I/O/Q yok. */
const VIN_PATTERN = /\b([A-HJ-NPR-Z0-9]{17})\b/g;
const DATE_PATTERN = /\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b|\b(\d{4})-(\d{2})-(\d{2})\b/g;
/** Alman biciminde tutar: `1.234,56`. */
const AMOUNT_PATTERN = /\b(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})\b/g;

export interface DocumentCandidates {
  plateNumbers: string[];
  vins: string[];
  /** ISO 'YYYY-MM-DD'. Belirsiz tarih UYDURULMAZ. */
  dates: string[];
  amounts: number[];
}

export function extractCandidates(raw: string): DocumentCandidates {
  const plateNumbers = new Set<string>();
  const vins = new Set<string>();
  const dates = new Set<string>();
  const amounts = new Set<number>();

  const upper = raw.toUpperCase();

  for (const match of upper.matchAll(PLATE_PATTERN)) {
    plateNumbers.add(`${match[1]}-${match[2]} ${match[3]}`);
  }
  for (const match of upper.matchAll(VIN_PATTERN)) {
    // Salt rakamdan olusan 17 haneli bir dizi VIN degildir (fatura numarasi olabilir).
    if (/[A-Z]/.test(match[1]!)) {
      vins.add(match[1]!);
    }
  }
  for (const match of raw.matchAll(DATE_PATTERN)) {
    if (match[1]) {
      const day = match[1].padStart(2, '0');
      const month = match[2]!.padStart(2, '0');
      const iso = `${match[3]}-${month}-${day}`;
      if (!Number.isNaN(Date.parse(iso))) dates.add(iso);
    } else if (match[4]) {
      const iso = `${match[4]}-${match[5]}-${match[6]}`;
      if (!Number.isNaN(Date.parse(iso))) dates.add(iso);
    }
  }
  for (const match of raw.matchAll(AMOUNT_PATTERN)) {
    const value = Number(`${match[1]!.replace(/\./g, '')}.${match[2]}`);
    if (Number.isFinite(value) && value > 0) amounts.add(value);
  }

  return {
    plateNumbers: [...plateNumbers].slice(0, 10),
    vins: [...vins].slice(0, 10),
    dates: [...dates].sort().slice(0, 10),
    amounts: [...amounts].sort((left, right) => right - left).slice(0, 10),
  };
}

interface PageVerdict {
  typeKey: DocumentTypeKey;
  score: number;
  matchedTerms: string[];
}

function classifyPage(normalized: string): PageVerdict {
  let best: PageVerdict = { typeKey: 'unknown@v1', score: 0, matchedTerms: [] };

  for (const [typeKey, terms] of Object.entries(TYPE_TERMS) as Array<
    [Exclude<DocumentTypeKey, 'unknown@v1'>, readonly string[]]
  >) {
    const matched = terms.filter((term) => normalized.includes(term));
    if (matched.length > best.score) {
      best = { typeKey, score: matched.length, matchedTerms: matched };
    }
  }

  return best;
}

/**
 * Guven skoru — SKORDAN TURETILIR, uydurulmaz.
 *
 * Tek terim eslesmesi 0.55'te kalir: bir kelime bir belgeyi belirlemez ve
 * arayuz bunu DUSUK GUVEN olarak isaretler.
 */
export function confidenceFromScore(score: number): number {
  if (score <= 0) return 0.2;
  return Math.min(0.95, 0.43 + score * 0.12);
}

export interface ClassifiedLogicalDocument {
  typeKey: DocumentTypeKey;
  confidence: number;
  subtype: InspectionSubtype | null;
  range: PageRange;
  /** Neyin nereden geldigi. HAM METIN YOK. */
  evidence: {
    matchedTerms: string[];
    pages: number[];
    classifierVersion: string;
  };
  candidates: DocumentCandidates;
  checks: AutomationCheckResult[];
  /** Onerilen hedef — KARAR DEGIL, oneri. Rol kontrolu ve insan onayi ayri. */
  suggestedDestination: string | null;
}

export interface ClassificationResult {
  classifierVersion: string;
  segmentationTrusted: boolean;
  documents: ClassifiedLogicalDocument[];
}

function detectSubtype(normalized: string): InspectionSubtype {
  for (const [subtype, terms] of Object.entries(SUBTYPE_TERMS) as Array<
    [Exclude<InspectionSubtype, 'unknown'>, readonly string[]]
  >) {
    if (terms.some((term) => normalized.includes(term))) {
      return subtype;
    }
  }
  // BILMIYORUM. `tuv` varsaymak, yanlis muayene tarihinden dogan bir
  // hatirlatmanin sessiz kaynagi olurdu.
  return 'unknown';
}

function detectInstructions(normalized: string): string[] {
  return INSTRUCTION_MARKERS.filter((marker) => normalized.includes(marker));
}

/**
 * Belgeyi mantiksal parcalara ayirir ve her parcayi siniflandirir.
 *
 * SAYFA SINIRLARI: ardisik ayni turdeki sayfalar tek mantiksal belge sayilir.
 * Bu, cok belgeli bir taramanin dogal bolunmesidir. Sonuc `resolveProposedSegmentation`
 * ile belgenin GERCEK sayfa sayisina oturtulur — ajan disari tasan bir sinir
 * onerse bile arayuz bos onizleme gostermez.
 */
export function classifyDocument(text: UnsafeDocumentText, pageCount: number): ClassificationResult {
  const normalizedPages = text.pages.map((page) => normalizeText(page));
  // METADATA DA GUVENSIZ VERI: siniflandirmaya KATILMAZ, yalnizca talimat
  // taramasina girer. Metadata'dan tur belirlemek, dosyanin "Title" alanina
  // `Bussgeldbescheid` yazan herkese tur secme yetkisi vermek olurdu.
  const normalizedMetadata = normalizeText(text.metadata);

  const verdicts = normalizedPages.map((page) => classifyPage(page));

  // Ardisik ayni tur = tek mantiksal belge.
  const groups: Array<{ typeKey: DocumentTypeKey; from: number; to: number; terms: Set<string> }> = [];
  verdicts.forEach((verdict, index) => {
    const previous = groups[groups.length - 1];
    if (previous && previous.typeKey === verdict.typeKey) {
      previous.to = index + 1;
      verdict.matchedTerms.forEach((term) => previous.terms.add(term));
      return;
    }
    groups.push({
      typeKey: verdict.typeKey,
      from: index + 1,
      to: index + 1,
      terms: new Set(verdict.matchedTerms),
    });
  });

  const segmentation = resolveProposedSegmentation(
    groups.map((group) => ({ pageFrom: group.from, pageTo: group.to })),
    pageCount,
  );

  const documents = segmentation.ranges.map((range, index) => {
    const group = groups[index];
    const typeKey = group?.typeKey ?? 'unknown@v1';
    const pageIndexes: number[] = [];
    for (let page = range.pageFrom; page <= range.pageTo; page += 1) {
      pageIndexes.push(page);
    }
    const combined = pageIndexes.map((page) => normalizedPages[page - 1] ?? '').join(' ');
    const rawCombined = pageIndexes.map((page) => text.pages[page - 1] ?? '').join(' ');

    const matchedTerms = [...(group?.terms ?? new Set<string>())].sort();
    const confidence = confidenceFromScore(matchedTerms.length);
    const definition = DOCUMENT_TYPE_REGISTRY[typeKey];
    const candidates = extractCandidates(rawCombined);

    const checks: AutomationCheckResult[] = [];

    checks.push(
      confidence >= CONFIDENT_THRESHOLD && typeKey !== 'unknown@v1'
        ? {
            code: 'document_type_confident',
            status: 'verified',
            messageKey: 'documentInbox.checks.document_type_confident.verified',
            evidence: { typeKey, matchedTermCount: matchedTerms.length },
          }
        : {
            code: 'document_type_confident',
            status: 'unknown',
            messageKey: 'documentInbox.checks.document_type_confident.unknown',
            evidence: { typeKey, matchedTermCount: matchedTerms.length },
            // "Emin degilim" ile "sorun yok" ayni sey DEGIL.
            unknownReason: typeKey === 'unknown@v1' ? 'no_type_signal' : 'weak_type_signal',
          },
    );

    checks.push(
      segmentation.trusted
        ? {
            code: 'page_segmentation',
            status: 'verified',
            messageKey: 'documentInbox.checks.page_segmentation.verified',
            evidence: { pageFrom: range.pageFrom, pageTo: range.pageTo },
          }
        : {
            code: 'page_segmentation',
            status: 'unknown',
            messageKey: 'documentInbox.checks.page_segmentation.unknown',
            evidence: { pageFrom: range.pageFrom, pageTo: range.pageTo, pageCount },
            unknownReason: 'segmentation_fallback',
          },
    );

    // Belgede tarih bulunamamasi `unknown` — TARIH UYDURULMAZ. TUV/sigortada
    // bu, hatirlatma onerilmemesi demektir.
    checks.push(
      candidates.dates.length > 0
        ? {
            code: 'document_date_present',
            status: 'verified',
            messageKey: 'documentInbox.checks.document_date_present.verified',
            evidence: { dateCount: candidates.dates.length },
          }
        : {
            code: 'document_date_present',
            status: 'unknown',
            messageKey: 'documentInbox.checks.document_date_present.unknown',
            evidence: { dateCount: 0 },
            unknownReason: 'no_parsable_date',
          },
    );

    // Talimat benzeri icerik: metinde VE metadata'da.
    const instructions = [
      ...detectInstructions(combined),
      ...detectInstructions(normalizedMetadata),
    ];
    checks.push(
      instructions.length === 0
        ? {
            code: 'content_instructions',
            status: 'verified',
            messageKey: 'documentInbox.checks.content_instructions.verified',
            evidence: { markerCount: 0 },
          }
        : {
            code: 'content_instructions',
            // `failed`: belge modele emir vermeye calisiyor. DAVRANIS DEGISMEDI;
            // isaretlendi. Eslesen isaretler BIZIM listemizden, belgeden degil.
            status: 'failed',
            messageKey: 'documentInbox.checks.content_instructions.failed',
            evidence: {
              markerCount: instructions.length,
              markers: [...new Set(instructions)].sort().join(', '),
            },
          },
    );

    return {
      typeKey,
      confidence,
      subtype: typeKey === 'vehicle_inspection@v1' ? detectSubtype(combined) : null,
      range,
      evidence: {
        matchedTerms,
        pages: pageIndexes,
        classifierVersion: CLASSIFIER_VERSION,
      },
      candidates,
      checks,
      // ONERI. Yetki kontrolu ve insan onayi bundan BAGIMSIZ.
      suggestedDestination: definition.destination,
    };
  });

  return {
    classifierVersion: CLASSIFIER_VERSION,
    segmentationTrusted: segmentation.trusted,
    documents,
  };
}
