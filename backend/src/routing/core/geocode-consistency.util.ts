/**
 * Geocode fallback sonucunun orijinal adresle tutarli olup olmadigi.
 *
 * Baglam: gercek veride "DHL Hub Hamburg-Billbrook, Halskestraße 48" gibi tesis
 * adiyla baslayan adresler yaygin ve Photon bu bicimi cozemiyor. Virgul oncesini
 * atinca cozuluyor — ama sehir baglami da kayboluyor:
 *
 *   "DB Schenker Terminal Dresden, Hamburger Straße 19"
 *     -> on eksiz sorgu BREMEN'deki bir Hamburger Straße'yi donduruyor
 *
 * Sessizce yanlis sehre geocode etmek hic etmemekten kotudur: planlanan mesafe
 * yuzlerce km sapar ve yakit sapma raporu tamamen anlamsiz olur. Bu yuzden
 * fallback sonucu yalnizca donen sehir orijinal metinde geciyorsa kabul edilir.
 */
export function isGeocodeFallbackConsistent(
  returnedCity: string | null,
  originalAddress: string,
): boolean {
  if (!returnedCity || !originalAddress) {
    return false;
  }

  const haystack = originalAddress.toLowerCase();
  const city = returnedCity.toLowerCase();

  // Bilesik sehir adlarinda ilk parca da kabul edilir: Photon "Hamburg" doner
  // ama adreste "Hamburg-Billbrook" yazar; tersi de olur.
  const candidates = [city, city.split(/[-\s/]/)[0] ?? ''];

  return candidates.some(
    // 3 karakter esigi "Au", "Ay" gibi kisa sehir adlarinin rastgele alt dize
    // eslesmesiyle yanlis kabul uretmesini engeller
    (candidate) => candidate.length >= 3 && haystack.includes(candidate),
  );
}
