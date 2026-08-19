import { createHash } from 'node:crypto';

/**
 * MESAJ KIMLIGI VE FINANSAL ICERIK TESPITI (Faz 16).
 *
 * Iki islev de SAF: girdi disinda hicbir seye bakmiyorlar ve yan etkileri yok.
 * Ikisi de guvenlik siniri uzerinde calisiyor, bu yuzden ayri ve test edilebilir.
 */

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

/**
 * IDEMPOTENCY ANAHTARI — DAIMA SUNUCUDA.
 *
 * `mailbox` + `Message-ID` + ICERIK HASH'i. Ucunu birden almanin sebebi:
 *
 *   - Yalniz `Message-ID`: gonderen bu basligi serbestce yazar. Her seferinde
 *     yeni bir kimlik uretip AYNI siparisi defalarca actirabilirdi.
 *   - Yalniz icerik hash'i: ayni sablonu iki farkli musteriye gonderen bir
 *     spedisyon, ikinci gercek siparisin sessizce yutulmasina yol acardi.
 *   - `mailbox` olmadan: ayni mesaj iki farkli posta kutusuna dustugunde
 *     bunlar gercekten iki ayri isdir; birini kaybetmek veri kaybidir.
 *
 * ISTEMCIDEN ANAHTAR ALINMAZ. Faz 14'te connector kendi `idempotencyKey`ini
 * yolluyor cunku orada connector KIRACIYA KILITLI ve kendi yeniden denemesini
 * isaretliyor. Burada anahtari uretenin GONDEREN olmasi, tekrar tespitini
 * gonderenin isteğine birakmak demekti.
 */
export function buildDedupeKey(input: {
  mailbox?: string | null;
  externalMessageId?: string | null;
  contentHash: string;
}): string {
  // Ayraç olarak `\n` KULLANILIYOR ve alanlar kirpiliyor: ayrac olmadan
  // ("ab"+"c") ile ("a"+"bc") ayni anahtari uretirdi.
  const parts = [
    (input.mailbox ?? '').trim().toLowerCase(),
    (input.externalMessageId ?? '').trim(),
    input.contentHash,
  ];
  return createHash('sha256').update(parts.join('\n')).digest('hex');
}

export function hashContent(raw: Buffer): string {
  return createHash('sha256').update(raw).digest('hex');
}

// ---------------------------------------------------------------------------
// Finansal icerik
// ---------------------------------------------------------------------------

/**
 * UC DURUMLU SONUC.
 *
 * `unknown` GUVENLI SAYILMAZ ve cagiran taraf onu `yes` gibi korur: taranacak
 * metin YOKSA (gomulu metni olmayan bir tarama gibi) "icinde fiyat yok"
 * DIYEMEYIZ. Tersini soylemek — "emin degilim, o halde gosterebilirim" —
 * maskelemenin tamamini anlamsiz kilardi, cunku saldirganin tek isi tespiti
 * sasirtmak olurdu.
 */
export type FinancialContent = 'yes' | 'no' | 'unknown';

/** Para birimi isaretleri ve kodlari. */
const CURRENCY_TOKENS = [
  '€', '₺', '£', '$', 'eur', 'usd', 'chf', 'gbp', 'try', 'pln', 'czk', 'huf', 'ron',
];

/**
 * Fiyat ANLAMI tasiyan kelimeler — DE / EN / TR.
 *
 * Neden yalnizca sayi aramiyoruz: bir tasima emri agirlik, hacim, palet
 * sayisi ve posta kodu ile doludur. Cikplak sayi aramak her mesaji "finansal"
 * isaretler ve maskeleme her yerde devreye girip ekrani kullanilamaz kilardi.
 */
const PRICE_TERMS = [
  // DE
  'preis', 'betrag', 'kosten', 'fracht', 'frachtkosten', 'netto', 'brutto',
  'rechnung', 'entgelt', 'vergutung', 'honorar', 'tarif', 'pauschale', 'zuschlag',
  // EN
  'price', 'amount', 'cost', 'freight', 'rate', 'invoice', 'charge', 'fee', 'total',
  // TR
  'fiyat', 'tutar', 'ucret', 'navlun', 'bedel', 'toplam', 'kdv',
];

/** Ondalikli ya da binlik ayracli sayi — `1.250,00` ve `1,250.00` dahil. */
const AMOUNT_PATTERN = /\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+[.,]\d{1,2}/;

/** Aksan ve `ı/ş/ğ` gibi harfleri kaba ASCII karsiligina indirger. */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ç/g, 'c')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss')
    .toLowerCase();
}

/**
 * Mesajda fiyat/tutar var mi.
 *
 * @param sources Konu, govde ve ek METINLERI. Hepsi GUVENSIZ; burada yalnizca
 *   anahtar kelime eslestirmesi icin kullaniliyorlar ve hicbir yere yazilmiyorlar.
 */
export function detectFinancialContent(sources: Array<string | null | undefined>): FinancialContent {
  const joined = sources.filter((value): value is string => Boolean(value && value.trim())).join('\n');

  // TARANACAK METIN YOK: "fiyat yok" DIYEMEYIZ.
  if (!joined.trim()) return 'unknown';

  const text = fold(joined);

  // Para birimi isareti tek basina yeterli: `1.250,00 €` cumlesinde "preis"
  // kelimesi gecmeyebilir.
  for (const token of CURRENCY_TOKENS) {
    if (!text.includes(token)) continue;
    // Sembol/kod bir SAYIYLA birlikte olmali: imzadaki "EUR" ya da bir adres
    // icindeki "$" tek basina fiyat degildir.
    const near = new RegExp(
      `(${AMOUNT_PATTERN.source})\\s*${escapeRegex(token)}|${escapeRegex(token)}\\s*(${AMOUNT_PATTERN.source})`,
    );
    if (near.test(text)) return 'yes';
  }

  for (const term of PRICE_TERMS) {
    if (!text.includes(term)) continue;
    // Terim ile sayi AYNI SATIRDA olmali: "Rechnung folgt" fiyat degildir.
    for (const line of text.split('\n')) {
      if (line.includes(term) && AMOUNT_PATTERN.test(line)) return 'yes';
    }
  }

  return 'no';
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Maskeleme karari.
 *
 * `unknown` BURADA `yes` GIBI davraniyor — tek satirlik ama Faz 16'nin en
 * onemli guvenlik kurallarindan biri, bu yuzden ayri bir islev ve ayri bir
 * testi var.
 */
export function mustMaskFinancials(content: FinancialContent): boolean {
  return content !== 'no';
}
