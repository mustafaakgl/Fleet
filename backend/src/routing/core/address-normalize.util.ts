import { createHash } from 'node:crypto';

/**
 * Almanca adres metnini tekillestirme anahtarina cevirir.
 *
 * Amac: "Hauptstr. 5, 47059 Duisburg", "Hauptstraße 5, 47059 Duisburg" ve
 * "HAUPTSTRASSE 5 / 47059 DUISBURG" ayni Location kaydini paylassin — ayni adres
 * tenant icinde iki kez geocode edilmesin.
 */

/** Umlaut ve eszett'i ASCII karsiliklarina cevirir (DIN 5007-2 / posta kullanimi). */
const CHAR_MAP: Record<string, string> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  ß: 'ss',
  å: 'a',
  é: 'e',
  è: 'e',
  ê: 'e',
  á: 'a',
  à: 'a',
  ó: 'o',
  ò: 'o',
  ú: 'u',
  ù: 'u',
  ç: 'c',
  ñ: 'n',
};

/**
 * Almanca adres kisaltmalari. Uzun bicime acilir, boylece "str." ile "strasse"
 * ayni anahtari uretir. Sadece kelime sonundaki eki hedefler.
 */
const STREET_SUFFIXES: Array<[RegExp, string]> = [
  [/(\S*?)str\b\.?/g, '$1strasse'],
  [/(\S*?)stra(ss|s)e\b/g, '$1strasse'],
  [/(\S*?)pl\b\.?/g, '$1platz'],
  [/(\S*?)allee\b/g, '$1allee'],
  [/(\S*?)wg\b\.?/g, '$1weg'],
];

/** Adres anlamini degistirmeyen dolgu sozcukleri. */
const NOISE_WORDS = new Set(['deutschland', 'germany', 'de', 'ger']);

/**
 * Adresi karsilastirilabilir kanonik bicime getirir.
 * Bos/anlamsiz girdide bos string doner — cagiran taraf bunu gecersiz sayar.
 */
export function normalizeAddress(raw: string): string {
  if (!raw) {
    return '';
  }

  let value = raw.toLowerCase();

  // Umlaut ve aksanlari ASCII'ye indir
  value = value.replace(/[äöüßåéèêáàóòúùçñ]/g, (char) => CHAR_MAP[char] ?? char);

  // Noktalama ve ayiriclari bosluga cevir; harf/rakam/bosluk disini at
  value = value.replace(/[^a-z0-9\s]/g, ' ');

  // Kisaltmalari ac — bosluk sadelestirmesinden ONCE, cunku \b sinirlarina dayaniyor
  value = value.replace(/\s+/g, ' ').trim();
  for (const [pattern, replacement] of STREET_SUFFIXES) {
    value = value.replace(pattern, replacement);
  }

  // Ulke adi gibi ayirt edici olmayan sozcukleri dusur
  const tokens = value
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && !NOISE_WORDS.has(token));

  return tokens.join(' ');
}

/**
 * Location.normalizedHash degeri. `@@unique([tenantId, normalizedHash])` ile
 * birlikte tenant ici adres tekilligini saglar.
 *
 * Ham metin yerine hash saklanmasinin sebebi: normalize edilmis metin cok uzun
 * olabilir ve index boyutu ongorulemez; sabit 64 karakter daha guvenli.
 */
export function addressHash(raw: string): string {
  const normalized = normalizeAddress(raw);
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/** Iki adresin ayni Location'a denk gelip gelmedigi. */
export function isSameAddress(a: string, b: string): boolean {
  const normalizedA = normalizeAddress(a);
  return normalizedA.length > 0 && normalizedA === normalizeAddress(b);
}
