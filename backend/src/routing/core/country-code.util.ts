/**
 * Adres formundaki serbest metin ulke alanini ISO 3166-1 alpha-2 koduna cevirir.
 *
 * Neden ISO koda cevirip SONUCU filtreliyoruz da ulkeyi sorgu metnine
 * eklemiyoruz: olculdu, Photon sorgudaki ulke adini kullanmiyor.
 * "Bahnhofstrasse Koeln Deutschland" ve "Bahnhofstrasse Koeln Oesterreich" ayni
 * Köln sonuclarini donduruyor — yani metin ne daraltiyor ne duzeltiyor. Buna
 * karsilik TANIMADIGI bir kelime aramayi tamamen oldururuyor:
 * "Hauptstrasse Freedonia" bos liste donuyor. Serbest metni sorguya eklemek bu
 * yuzden en iyi ihtimalle etkisiz, en kotusunde yikici.
 *
 * Tanimadigimiz metin null doner ve cagiran taraf filtreyi HIC uygulamaz.
 * Bilinmeyen bir ulke adi yuzunden listeyi bosaltmak, filtrelememekten kotu.
 */
const COUNTRY_CODES = new Map<string, string>([
  ['de', 'DE'],
  ['deu', 'DE'],
  ['brd', 'DE'],
  ['deutschland', 'DE'],
  ['germany', 'DE'],
  ['allemagne', 'DE'],
  ['duitsland', 'DE'],

  ['at', 'AT'],
  ['aut', 'AT'],
  ['osterreich', 'AT'],
  ['oesterreich', 'AT'],
  ['austria', 'AT'],
  ['autriche', 'AT'],

  ['ch', 'CH'],
  ['che', 'CH'],
  ['schweiz', 'CH'],
  ['switzerland', 'CH'],
  ['suisse', 'CH'],
  ['svizzera', 'CH'],

  ['nl', 'NL'],
  ['nld', 'NL'],
  ['niederlande', 'NL'],
  ['netherlands', 'NL'],
  ['nederland', 'NL'],
  ['holland', 'NL'],
  ['pays-bas', 'NL'],

  ['be', 'BE'],
  ['bel', 'BE'],
  ['belgien', 'BE'],
  ['belgium', 'BE'],
  ['belgie', 'BE'],
  ['belgique', 'BE'],

  ['lu', 'LU'],
  ['lux', 'LU'],
  ['luxemburg', 'LU'],
  ['luxembourg', 'LU'],
  ['letzebuerg', 'LU'],

  ['fr', 'FR'],
  ['fra', 'FR'],
  ['frankreich', 'FR'],
  ['france', 'FR'],

  ['it', 'IT'],
  ['ita', 'IT'],
  ['italien', 'IT'],
  ['italy', 'IT'],
  ['italia', 'IT'],

  ['pl', 'PL'],
  ['pol', 'PL'],
  ['polen', 'PL'],
  ['poland', 'PL'],
  ['polska', 'PL'],

  ['cz', 'CZ'],
  ['cze', 'CZ'],
  ['tschechien', 'CZ'],
  ['czechia', 'CZ'],
  ['czech republic', 'CZ'],
  ['cesko', 'CZ'],
  ['ceska republika', 'CZ'],

  ['dk', 'DK'],
  ['dnk', 'DK'],
  ['danemark', 'DK'],
  ['denmark', 'DK'],
  ['danmark', 'DK'],

  ['si', 'SI'],
  ['svn', 'SI'],
  ['slowenien', 'SI'],
  ['slovenia', 'SI'],
  ['slovenija', 'SI'],

  ['sk', 'SK'],
  ['svk', 'SK'],
  ['slowakei', 'SK'],
  ['slovakia', 'SK'],
  ['slovensko', 'SK'],

  ['hu', 'HU'],
  ['hun', 'HU'],
  ['ungarn', 'HU'],
  ['hungary', 'HU'],
  ['magyarorszag', 'HU'],
]);

/**
 * Anahtarlar aksansiz tutuluyor ve girdi de aksanindan arindiriliyor:
 * "Österreich", "Oesterreich" ve "osterreich" ayni kayda dusmeli. Nokta ve
 * fazla bosluk ayiklanir ("D.E." veya "Czech  Republic").
 */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Bilinen bir ulke adi/kodu ise ISO 3166-1 alpha-2, degilse null. */
export function toCountryCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return COUNTRY_CODES.get(normalize(raw)) ?? null;
}
