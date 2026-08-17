import { Prisma } from '@prisma/client';
import type { FuelProductType } from '@prisma/client';

/**
 * Fis metninin SAF normalizasyonu — saglayicidan bagimsiz.
 *
 * Adaptorun icine gomulmedi cunku asil risk burada: "1.759" mu "1,759" mu,
 * "Super" E5 mi E10 mi, fisteki 48,90 EUR yakit mi yoksa yakit + kahve mi.
 * Bu sorularin cevabi HTTP'siz sinanabilmeli.
 */

// ---------------------------------------------------------------------------
// Ondalik ayristirma
// ---------------------------------------------------------------------------

/**
 * Fisteki sayiyi guvenle okur.
 *
 * ALMANCA "1.234,56" ile INGILIZCE "1,234.56" ayni karakterleri TERS anlamda
 * kullanir. Locale'e bakip tahmin etmek yerine AYIRICI KONUMUNDAN karar
 * veriliyor: son ayirici hangisiyse ondalik odur. Bu, iki formati da tek
 * kuralla dogru okur ve "1.759" gibi tek ayiricili belirsiz durumda
 * ondalik basamak sayisina bakar.
 *
 * Belirsizligi cozemezse null doner — YANLIS bir tutar dondurmektense
 * "okunamadi" demek dogru. Yanlis okunan bir birim fiyat, muhasebeye
 * gercek maliyet gibi girer.
 */
export function parseReceiptDecimal(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;

  // Para birimi simgeleri, birimler ve bosluklar atiliyor.
  const cleaned = raw
    .replace(/[€$₺]|EUR|TRY|TL\b/gi, '')
    .replace(/\b(?:l|lt|litre|liter|ltr)\b/gi, '')
    .replace(/\s+/g, '')
    .trim();
  if (!cleaned) return null;

  const negative = /^-/.test(cleaned);
  const digitsOnly = cleaned.replace(/^[+-]/, '');
  if (!/^[\d.,]+$/.test(digitsOnly)) return null;

  const lastComma = digitsOnly.lastIndexOf(',');
  const lastDot = digitsOnly.lastIndexOf('.');

  let normalized: string;
  if (lastComma === -1 && lastDot === -1) {
    normalized = digitsOnly;
  } else if (lastComma > lastDot) {
    // Son ayirici virgul → ondalik virgul, noktalar binlik.
    normalized = digitsOnly.replace(/\./g, '').replace(',', '.');
    if (normalized.split('.').length > 2) return null;
  } else if (lastDot > lastComma) {
    // Son ayirici nokta → ondalik nokta, virguller binlik.
    normalized = digitsOnly.replace(/,/g, '');
    if (normalized.split('.').length > 2) return null;
  } else {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -parsed : parsed;
}

// ---------------------------------------------------------------------------
// Yakit urunu eslemesi
// ---------------------------------------------------------------------------

export interface FuelLabelMatch {
  /** Canonical enum degeri; guvenle eslenemezse null. */
  product: FuelProductType | null;
  /** Eslenemeyen ya da belirsiz ham metin — surucuye gosterilir. */
  rawLabel: string;
  /**
   * Metin bir yakit urunune benziyor ama HANGISI oldugu belirsiz.
   *
   * "Super" (E5 mi E10 mi) ve "Benzin" (oktan yok) boyle. Arayuz bunu
   * "seciminizi yapin" diye gosterir; sessizce bir urun secmek yanlis yakit
   * kaydi ve yanlis uyumluluk uyarisi uretir.
   */
  ambiguous: boolean;
}

/**
 * Enum'da KARSILIGI OLMAYAN ama fiste sik gecen urunler.
 *
 * LPG/Otogaz repo'nun `FuelProductType` enum'unda YOK. Spec bunlari
 * "desteklenecek ifadeler" arasinda sayiyor ama ayni spec yeni/paralel yakit
 * enum'u yasakliyor. Dogru davranis: metni TANI, enum'a UYDURMA — deger null
 * kalir, ham etiket surucuye gosterilir, secimi o yapar.
 */
const KNOWN_UNMAPPED = [/\blpg\b/i, /\botogaz\b/i, /\bautogas\b/i, /\bfl[uü]ssiggas\b/i];

/** Sirali: ozel olan once. "Super E10" once eslesmeli ki "Super"e dusmesin. */
const FUEL_PATTERNS: Array<{ pattern: RegExp; product: FuelProductType }> = [
  // --- AdBlue: yakit DEGIL, katki. En basta cunku "Diesel Exhaust Fluid"
  //     metinlerinde "Diesel" gecebiliyor ve yanlislikla DIESEL'e duserdi.
  { pattern: /\b(?:adblue|ad\s*blue|def\b|harnstoff|scr[-\s]?l[oö]sung)\b/i, product: 'ADBLUE' },

  // --- HVO (paraffinik dizel). "Diesel"den ONCE: "HVO100 Diesel" yaziyor olabilir.
  { pattern: /\bhvo\s*100\b|\bhvo\b/i, product: 'HVO100' },

  // --- Benzin turleri: spesifik olan once.
  { pattern: /\bsuper\s*plus\b|\bsuperplus\b|\bsuper\s*\+/i, product: 'SUPER_PLUS' },
  { pattern: /\b(?:super\s*)?e\s*10\b/i, product: 'SUPER_E10' },
  { pattern: /\b(?:super\s*)?e\s*5\b/i, product: 'SUPER_E5' },

  // --- Dizel: DE + TR.
  {
    pattern:
      /\b(?:lkw[-\s]?diesel|diesel|dizel|motorin|mazot|gasoil|gas[oö]l)\b/i,
    product: 'DIESEL',
  },

  // --- Gazlar.
  { pattern: /\blng\b|\bfl[uü]ssigerdgas\b/i, product: 'LNG' },
  { pattern: /\bcng\b|\berdgas\b|\bdo[gğ]algaz\b/i, product: 'CNG' },

  // --- Elektrik / hidrojen (sarj fisleri de yuklenebiliyor).
  { pattern: /\bh2\b|\bwasserstoff\b|\bhidrojen\b|\bhydrogen\b/i, product: 'HYDROGEN' },
  { pattern: /\bstrom\b|\belektrik\b|\bkwh\b|\bladen\b/i, product: 'ELECTRICITY' },
];

/**
 * BELIRSIZ kaliplar — bir yakita benziyor ama hangisi oldugu SOYLENEMEZ.
 *
 * "Super" DE'de E5 de E10 da olabilir. "Benzin"/"Kursunsuz" TR'de oktan
 * bilgisi olmadan E5/E10 ayrimi tasimaz. Oktan sayisi (95/98) da yeterli
 * degil: 95 oktan hem E5 hem E10 olabilir. Tahmin etmek yerine surucuye
 * soruyoruz.
 */
const AMBIGUOUS_PATTERNS: RegExp[] = [
  /\bsuper\b/i,
  /\bbenzin\b/i,
  /\bkur[sş]unsuz\b/i,
  /\bunleaded\b/i,
  /\bbleifrei\b/i,
];

export function matchFuelLabel(rawLabel: string | null | undefined): FuelLabelMatch {
  const label = (rawLabel ?? '').trim();
  if (!label) {
    return { product: null, rawLabel: '', ambiguous: false };
  }

  for (const { pattern, product } of FUEL_PATTERNS) {
    if (pattern.test(label)) {
      return { product, rawLabel: label, ambiguous: false };
    }
  }

  if (KNOWN_UNMAPPED.some((pattern) => pattern.test(label))) {
    // Taniyoruz ama canonical enum'da yok. Uydurmuyoruz.
    return { product: null, rawLabel: label, ambiguous: true };
  }

  if (AMBIGUOUS_PATTERNS.some((pattern) => pattern.test(label))) {
    return { product: null, rawLabel: label, ambiguous: true };
  }

  return { product: null, rawLabel: label, ambiguous: false };
}

// ---------------------------------------------------------------------------
// Para birimi
// ---------------------------------------------------------------------------

/**
 * Para birimi YALNIZCA acik kanittan.
 *
 * Kiracinin ulkesine ya da arayuz diline bakip para birimi uydurmak, Turkiye'de
 * calisan bir Alman filosunun 2.400 TL'lik fisini 2.400 EUR olarak
 * kaydetmesine yol acar. Kanit yoksa null doner ve surucu secer.
 */
export function detectCurrency(...evidence: Array<string | null | undefined>): string | null {
  const haystack = evidence.filter(Boolean).join(' ');
  if (!haystack) return null;

  const hasEur = /€|\bEUR\b/i.test(haystack);
  const hasTry = /₺|\bTRY\b|\bTL\b/i.test(haystack);

  // Ikisi birden varsa BELIRSIZ: "EUR karsiligi" yazan bir fis olabilir.
  if (hasEur && hasTry) return null;
  if (hasEur) return 'EUR';
  if (hasTry) return 'TRY';
  return null;
}

// ---------------------------------------------------------------------------
// Yakit satiri secimi
// ---------------------------------------------------------------------------

export interface ReceiptLineItem {
  description: string | null;
  quantity: number | null;
  unitPrice: number | null;
  totalPrice: number | null;
  confidence: number | null;
}

export interface FuelLineSelection {
  /** Tek bir yakit satiri guvenle secildiyse. */
  selected: ReceiptLineItem | null;
  match: FuelLabelMatch | null;
  /** Birden fazla aday — surucu secmeli. */
  candidates: ReceiptLineItem[];
  /** Fiste yakit disi kalem var mi. */
  hasNonFuelItems: boolean;
  /** Yakit satiri hic bulunamadi. Fis REDDEDILMEZ; form elle doldurulur. */
  noFuelLine: boolean;
}

/**
 * Fis kalemlerinden yakit satirini ayirir.
 *
 * KARMA FIS BU FONKSIYONUN VARLIK SEBEBI: fisin genel toplamini arac yakit
 * maliyeti olarak yazmak, kahveyi ve arac yikamayi yakit giderine yazmak
 * demektir. Yalnizca yakit satirinin tutari onerilir.
 *
 * BIRDEN FAZLA ADAYDA OTOMATIK SECIM YOK: iki farkli yakit satiri olan bir
 * fiste (ornegin dizel + AdBlue) hangisinin arac yakiti oldugunu sunucu
 * bilemez.
 */
export function selectFuelLine(items: readonly ReceiptLineItem[]): FuelLineSelection {
  const classified = items.map((item) => ({ item, match: matchFuelLabel(item.description) }));

  // ADDITIVE ayri tutuluyor: AdBlue bir yakit satiri DEGIL. Onu aday saymak,
  // dizel + AdBlue alan her fisi "belirsiz" yapardi.
  const fuelLines = classified.filter(
    ({ match }) => match.product !== null && match.product !== 'ADBLUE',
  );
  const ambiguousLines = classified.filter(({ match }) => match.ambiguous);
  const candidates = [...fuelLines, ...ambiguousLines];

  // Yakit disi kalem: bir urune de belirsiz bir yakita da eslesmeyen, ama
  // GERCEKTEN bir metni olan satir. Bos etiketli satirlar sayilmaz — onlar
  // okuma artigi olabilir ve "fiste market urunu var" uyarisini haksiz
  // yere tetiklerdi.
  const hasNonFuelItems = classified.some(
    ({ match }) =>
      match.product === null && !match.ambiguous && match.rawLabel.trim().length > 0,
  );

  if (candidates.length === 0) {
    return {
      selected: null,
      match: null,
      candidates: [],
      hasNonFuelItems,
      noFuelLine: true,
    };
  }

  if (candidates.length > 1) {
    return {
      selected: null,
      match: null,
      candidates: candidates.map(({ item }) => item),
      hasNonFuelItems,
      noFuelLine: false,
    };
  }

  const only = candidates[0];
  return {
    selected: only.item,
    match: only.match,
    candidates: [only.item],
    hasNonFuelItems,
    noFuelLine: false,
  };
}

// ---------------------------------------------------------------------------
// Tutarlilik
// ---------------------------------------------------------------------------

/**
 * `litre x birim fiyat ≈ yakit toplami` kontrolu.
 *
 * DECIMAL ile yapiliyor: 45.32 * 1.759 JavaScript'te 79.71788000000001 verir
 * ve tolerans karsilastirmasi bu artiktan etkilenmemeli.
 *
 * TOLERANS iki kaynagi birlikte karsilar: pompanin kendi yuvarlamasi (birim
 * fiyat 3 haneli, toplam 2 haneli) ve fisin kurus yuvarlamasi. Sabit bir
 * mutlak esik buyuk dolumları yanlis isaretlerdi, sabit bir yuzde ise kucuk
 * dolumları. Ikisinin BUYUGU aliniyor.
 */
export const CONSISTENCY_RELATIVE_TOLERANCE = 0.01; // %1
export const CONSISTENCY_ABSOLUTE_TOLERANCE = 0.05; // 5 kurus

export interface ConsistencyCheck {
  /** Uc deger de varsa hesaplanabildi mi. */
  checked: boolean;
  consistent: boolean;
  /** |litre x fiyat - toplam| — arayuz gostermez, test ve gunluk icin. */
  difference: string | null;
}

export function checkFuelLineConsistency(
  liters: number | null,
  unitPrice: number | null,
  fuelTotal: number | null,
): ConsistencyCheck {
  if (liters === null || unitPrice === null || fuelTotal === null) {
    // Eksik veri TUTARSIZLIK DEGIL: bilinmeyen sey yanlis sayilmaz.
    return { checked: false, consistent: true, difference: null };
  }

  const expected = new Prisma.Decimal(liters).mul(new Prisma.Decimal(unitPrice));
  const actual = new Prisma.Decimal(fuelTotal);
  const difference = expected.sub(actual).abs();

  const relative = actual.abs().mul(CONSISTENCY_RELATIVE_TOLERANCE);
  const tolerance = relative.greaterThan(CONSISTENCY_ABSOLUTE_TOLERANCE)
    ? relative
    : new Prisma.Decimal(CONSISTENCY_ABSOLUTE_TOLERANCE);

  return {
    checked: true,
    consistent: difference.lessThanOrEqualTo(tolerance),
    difference: difference.toFixed(4),
  };
}

/**
 * Fis genel toplami ile yakit satiri toplami ANLAMLI olcude farkli mi.
 *
 * true ise arayuz "fiste yakit disi urunler olabilir" uyarisi gosterir ve
 * genel toplam arac maliyetine YAZILMAZ.
 */
export function hasNonFuelDifference(
  receiptTotal: number | null,
  fuelTotal: number | null,
): boolean {
  if (receiptTotal === null || fuelTotal === null) return false;
  const diff = new Prisma.Decimal(receiptTotal).sub(new Prisma.Decimal(fuelTotal));
  // Yalnizca fis toplami BUYUKSE anlamli: kucukse okuma hatasi olasiligi
  // yuksek ve "market urunu var" demek yanlis olur.
  return diff.greaterThan(CONSISTENCY_ABSOLUTE_TOLERANCE);
}

// ---------------------------------------------------------------------------
// Guven siniflari
// ---------------------------------------------------------------------------

/**
 * Alan bazli guven sinifi.
 *
 * Esikler TEK YERDE: arayuz ile sunucu farkli esikler kullansaydi, sunucunun
 * "dusuk guven" dedigi bir alan ekranda yesil gorunurdu.
 */
export const CONFIDENCE_HIGH = 0.85;
export const CONFIDENCE_REVIEW = 0.6;

export type ConfidenceClass = 'high' | 'review' | 'low_or_missing';

export function classifyConfidence(confidence: number | null | undefined): ConfidenceClass {
  if (confidence === null || confidence === undefined || !Number.isFinite(confidence)) {
    return 'low_or_missing';
  }
  if (confidence >= CONFIDENCE_HIGH) return 'high';
  if (confidence >= CONFIDENCE_REVIEW) return 'review';
  return 'low_or_missing';
}
