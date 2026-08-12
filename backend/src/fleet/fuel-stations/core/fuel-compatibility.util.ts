import { FuelProductType, FuelProductUsage } from '@prisma/client';
import type { NormalizedFuelStation } from '../fuel-station.types';

/** Uyumluluk kaydinin filtreleme icin gereken kismi. */
export interface CompatibilityRow {
  productType: FuelProductType;
  usageType: FuelProductUsage;
  approved: boolean;
}

/**
 * Ana yakit onerisini belirleyen kullanim turleri.
 *
 * ADDITIVE BILINCLI OLARAK DISARIDA: AdBlue aracin ihtiyaci olabilir ama
 * istasyon onerisini belirlemez. Iceride olsaydi, yalnizca AdBlue satan bir
 * nokta dizel arac icin "uygun istasyon" olarak donerdi.
 */
const STATION_FILTER_USAGES: readonly FuelProductUsage[] = [
  FuelProductUsage.PRIMARY,
  FuelProductUsage.ALTERNATIVE,
];

/**
 * Aracin istasyon filtresinde kullanilacak urunleri.
 *
 * CIKARIM YOK. Kural listesi bilincli olarak BOS: DIESEL -> HVO100,
 * SUPER_E10 -> SUPER_E5 gibi hicbir esdegerlik uygulanmaz. HVO100 kimyasal
 * olarak dizel motorlarda calisabilir ama ureticinin acik onayi olmadan
 * garanti duser; E10 eski benzinli motorlarin yakit sistemine zarar verir.
 * Bir urun ancak KENDI satiri approved ise listeye girer.
 */
export function compatibleProductsForStationFilter(
  rows: readonly CompatibilityRow[],
): FuelProductType[] {
  const products = new Set<FuelProductType>();
  for (const row of rows) {
    if (!row.approved) {
      continue;
    }
    if (!STATION_FILTER_USAGES.includes(row.usageType)) {
      continue;
    }
    products.add(row.productType);
  }
  return [...products];
}

/**
 * Teklif sirasi: fiyati BILINEN teklifler ucuzdan pahaliya, fiyati bilinmeyen
 * (null) teklifler EN SONA.
 *
 * Neden: null'i 0 ya da -Infinity gibi degerlendiren bir siralama, fiyati
 * bilinmeyen istasyonu "en ucuz" diye basa tasir. Surucu en ucuz sandigi
 * yere gidip fiyati orada gorur.
 */
export function orderOfferingsByPrice<T extends { pricePerUnit: number | null }>(
  offerings: readonly T[],
): T[] {
  return [...offerings].sort((left, right) => {
    if (left.pricePerUnit === null && right.pricePerUnit === null) return 0;
    if (left.pricePerUnit === null) return 1;
    if (right.pricePerUnit === null) return -1;
    return left.pricePerUnit - right.pricePerUnit;
  });
}

/**
 * Istasyon sirasi: mesafeye gore artan, mesafesi bilinmeyenler sona.
 *
 * Faz 1'de siralama olcusu YALNIZCA mesafe. Valhalla rota sapmasi henuz
 * hesaplanmiyor — "5 km uzakta ama rota uzerinde" ayrimi sonraki fazin isi.
 */
export function sortStationsByDistance<T extends { distanceKm: number | null }>(
  stations: readonly T[],
): T[] {
  return [...stations].sort((left, right) => {
    if (left.distanceKm === null && right.distanceKm === null) return 0;
    if (left.distanceKm === null) return 1;
    if (right.distanceKm === null) return -1;
    return left.distanceKm - right.distanceKm;
  });
}

/**
 * Istasyon listesini aracin kabul ettigi urunlere indirger.
 *
 * Iki adim, ikisi de zorunlu:
 *   1) uyumsuz teklifler istasyondan CIKARILIR — surucu aracina uymayan bir
 *      fiyati hic gormemeli (yanlis yakit motoru bitirir),
 *   2) hicbir uyumlu teklifi kalmayan istasyon LISTEDEN DUSER — bos teklif
 *      listesiyle donen istasyon surucuye "burada yakit var" izlenimi verir.
 */
export function filterStationsForVehicle(
  stations: readonly NormalizedFuelStation[],
  compatibleProducts: readonly FuelProductType[],
): NormalizedFuelStation[] {
  const allowed = new Set(compatibleProducts);
  if (allowed.size === 0) {
    return [];
  }

  const filtered: NormalizedFuelStation[] = [];
  for (const station of stations) {
    const offerings = station.offerings.filter((offering) => allowed.has(offering.productType));
    if (offerings.length === 0) {
      continue;
    }
    filtered.push({ ...station, offerings: orderOfferingsByPrice(offerings) });
  }

  return sortStationsByDistance(filtered);
}
