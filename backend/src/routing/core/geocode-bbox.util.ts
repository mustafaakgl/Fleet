/**
 * Geocoder'in arama kutusu: "minLon,minLat,maxLon,maxLat".
 *
 * Varsayilan DACH + BeNeLux'u kapsar. Onceki varsayilan Almanya'nin kaba
 * dikdortgeniydi (5.87,47.27,15.04,55.06) ve bati siniri 5.87 oldugu icin
 * Amsterdam (4.90), Rotterdam (4.48), Brüksel (4.35) ve Anvers (4.40) kutunun
 * DISINDA kaliyordu — kodun kendi yorumu "AT/NL/BE'ye de sefer yapiyoruz, sert
 * filtre koymadik" derken kutu bunu fiilen geri getiriyordu.
 *
 * Photon'da bbox yumusak tercih DEGIL sert filtre; olculdu: "Stephansplatz
 * Wien" kutu icindeyken bos donuyor, kutusuz uc sonuc donuyor. Genisletmenin
 * Alman sonuclarina bedeli olcum icinde yok: "Halskestraße 48 Hamburg" iki
 * kutuda da ayni ilk uc adayi donduruyor.
 *
 * Kutu yine de dar: sinirsiz aramada "Bahnhofstr" kitanin her yerinden aday
 * getirir ve isletme bolgesi capasi (bias) bunu tek basina toparlayamaz.
 */
export const DEFAULT_GEOCODING_BBOX = '2.5,45.8,17.2,55.1';

/** GEOCODING_BBOX'i tamamen kapatan degerler — kutusuz, dunya capinda arama. */
const GLOBAL_ALIASES = new Set(['off', 'none', 'global', 'world']);

export type GeocodingBbox =
  /** Photon'a gonderilecek, dogrulanmis kutu */
  | { kind: 'bbox'; value: string }
  /** Kisit yok; bbox parametresi hic gonderilmez */
  | { kind: 'global' }
  /** Cozulemedi; cagiran taraf varsayilana donmeli */
  | { kind: 'invalid'; raw: string };

/**
 * GEOCODING_BBOX'i okur.
 *
 * Gecersiz deger `invalid` doner, varsayilan DEGIL: cagiran taraf bunu bir kez
 * loglayabilsin. Sessizce varsayilana donmek, yanlis yazilmis bir kutunun
 * aylarca fark edilmemesi demek olurdu.
 */
export function readGeocodingBbox(
  raw: string | undefined = process.env.GEOCODING_BBOX,
): GeocodingBbox {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) {
    return { kind: 'bbox', value: DEFAULT_GEOCODING_BBOX };
  }
  if (GLOBAL_ALIASES.has(trimmed.toLowerCase())) {
    return { kind: 'global' };
  }

  const parts = trimmed.split(',').map((part) => part.trim());
  if (parts.length !== 4) {
    return { kind: 'invalid', raw: trimmed };
  }

  const numbers = parts.map(Number);
  if (numbers.some((value) => !Number.isFinite(value))) {
    return { kind: 'invalid', raw: trimmed };
  }

  const [minLon, minLat, maxLon, maxLat] = numbers;
  if (Math.abs(minLon) > 180 || Math.abs(maxLon) > 180) {
    return { kind: 'invalid', raw: trimmed };
  }
  if (Math.abs(minLat) > 90 || Math.abs(maxLat) > 90) {
    return { kind: 'invalid', raw: trimmed };
  }
  // Ters kutu sessiz bir felaket olurdu: Photon bos liste dondurur ve arayuz
  // bunu "adres bulunamadi"dan ayirt edemez.
  if (minLon >= maxLon || minLat >= maxLat) {
    return { kind: 'invalid', raw: trimmed };
  }

  return { kind: 'bbox', value: numbers.join(',') };
}
