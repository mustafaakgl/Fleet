export type SuggestionKind = 'city' | 'street' | 'address' | 'poi';

/**
 * Photon sonucunu oneri turune cevirir.
 *
 * `osm_tag` Photon'da KATI filtre degil, yumusak tercih — istenen turle
 * eslesmeyen sonuclar da doner ve burada elenir.
 *
 * OLCULDU (2026-08-11, photon.komoot.io): Alman EV ADRESI `place/house` olarak
 * geliyor — "Buttmannstrasse 2" sorgusunda donen kayit budur. Bu deger
 * taninmadigi surece POI sayilip eleniyordu, yani kullanici numarayi yazdiginda
 * numarali adres listeden dusuyor ve geriye yalnizca numarasiz cadde kaliyordu.
 * Sofore caddenin ortasindaki bir koordinat gitmesi demek.
 */
const PLACE_CITY_VALUES = ['city', 'town', 'village', 'suburb'];

export function classifySuggestionKind(osmKey?: string, osmValue?: string): SuggestionKind {
  if (osmKey === 'place') {
    if (PLACE_CITY_VALUES.includes(osmValue ?? '')) {
      return 'city';
    }
    // place/house ve place/houses: tam adres noktasi.
    if (osmValue === 'house' || osmValue === 'houses') {
      return 'address';
    }
    return 'poi';
  }

  if (osmKey === 'highway') {
    return 'street';
  }

  if (osmKey === 'building' || osmKey === 'address') {
    return 'address';
  }

  return 'poi';
}
