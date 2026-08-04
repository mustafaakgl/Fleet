/**
 * Alman ev numarasi bicimleri: 24, 12a, 12-14, 3/5.
 * Bes haneli bir sayi ev numarasi degil posta kodudur — "Hauptstrasse 47059"
 * sorgusunda 47059'u ev numarasi saymak yanlis sonuc uretir.
 */
const HOUSE_NUMBER_TOKEN = /^\d{1,4}\s*[a-zA-Z]?([-/]\s*\d{1,4}\s*[a-zA-Z]?)?$/;
const POSTAL_CODE_TOKEN = /^\d{5}$/;

/**
 * Sorgu bir ev numarasi iceriyor mu?
 *
 * Sokak aramasi Photon'a `osm_tag=highway` ile gidiyor; bu yol CIZGISI demek ve
 * ev numarasi tasimaz. Kullanici numara yazdiysa o kisit kaldirilmali, yoksa
 * "Stralauer Allee 24" sorgusu numarasiz cadde olarak geri doner ve sofore
 * caddenin ortasindaki bir koordinat gider.
 */
export function queryHasHouseNumber(query: string): boolean {
  const tokens = query.trim().split(/[\s,]+/).filter(Boolean);

  return tokens.some((token, index) => {
    // Ilk token numara ise bu bir ev numarasi degil (ornegin "10 Downing" gibi
    // Alman olmayan bicimler ya da yanlislikla yazilmis posta kodu).
    if (index === 0) return false;
    if (POSTAL_CODE_TOKEN.test(token)) return false;
    return HOUSE_NUMBER_TOKEN.test(token);
  });
}
