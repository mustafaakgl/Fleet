import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FuelProductType, FuelProductUsage } from '@prisma/client';
import {
  compatibleProductsForStationFilter,
  filterStationsForVehicle,
  orderOfferingsByPrice,
  sortStationsByDistance,
} from './core/fuel-compatibility.util';
import type { FuelStationOffering, NormalizedFuelStation } from './fuel-station.types';

/**
 * Yakit uyumluluk filtresinin cekirdek kurallari.
 *
 * Burada sinanan sey altyapi degil is kurali: aracina uymayan bir yakitin
 * fiyatini surucuye gostermek, yanlis yakit alinmasina ve motorun bitmesine
 * yol acar. Bu yuzden her kural ayri ayri civileniyor.
 */

function offering(
  productType: FuelProductType,
  pricePerUnit: number | null = 1.7,
): FuelStationOffering {
  return { productType, pricePerUnit, unit: 'liter', currency: 'EUR', updatedAt: null };
}

function station(
  id: string,
  offerings: FuelStationOffering[],
  overrides: Partial<NormalizedFuelStation> = {},
): NormalizedFuelStation {
  return {
    id,
    provider: 'test',
    name: `Station ${id}`,
    brand: 'Aral',
    address: { street: 'Musterweg', houseNumber: '1', postalCode: '47051', city: 'Duisburg' },
    latitude: 51.44,
    longitude: 6.7,
    distanceKm: 1.2,
    isOpen: true,
    pricesUpdatedAt: null,
    retrievedAt: '2026-08-12T08:00:00.000Z',
    hgvAccess: 'unknown',
    acceptedFuelCards: null,
    offerings,
    ...overrides,
  };
}

const DIESEL_ONLY = [
  {
    productType: FuelProductType.DIESEL,
    usageType: FuelProductUsage.PRIMARY,
    approved: true,
  },
];

describe('compatibleProductsForStationFilter', () => {
  it('returns only the explicitly approved product for a diesel-only vehicle', () => {
    assert.deepEqual(compatibleProductsForStationFilter(DIESEL_ONLY), [FuelProductType.DIESEL]);
  });

  it('returns both petrol grades when both are approved', () => {
    const products = compatibleProductsForStationFilter([
      { productType: FuelProductType.SUPER_E5, usageType: FuelProductUsage.PRIMARY, approved: true },
      {
        productType: FuelProductType.SUPER_E10,
        usageType: FuelProductUsage.ALTERNATIVE,
        approved: true,
      },
    ]);

    assert.equal(products.length, 2);
    assert.equal(products.includes(FuelProductType.SUPER_E5), true);
    assert.equal(products.includes(FuelProductType.SUPER_E10), true);
  });

  it('never infers HVO100 from a diesel approval', () => {
    // HVO100 dizel motorda calisabilir ama ureticinin acik onayi olmadan
    // garanti duser. Cikarim yapilirsa surucu onaysiz yakit alir.
    const products = compatibleProductsForStationFilter(DIESEL_ONLY);
    assert.equal(products.includes(FuelProductType.HVO100), false);
  });

  it('never infers E5 from an E10 approval', () => {
    // Ters yonde de cikarim yok: E10 onayi E5'i ima etmez.
    const products = compatibleProductsForStationFilter([
      { productType: FuelProductType.SUPER_E10, usageType: FuelProductUsage.PRIMARY, approved: true },
    ]);
    assert.deepEqual(products, [FuelProductType.SUPER_E10]);
  });

  it('excludes AdBlue from the primary station filter', () => {
    // AdBlue ADDITIVE: aracin ihtiyaci olabilir ama istasyon onerisini
    // belirlemez.
    const products = compatibleProductsForStationFilter([
      ...DIESEL_ONLY,
      { productType: FuelProductType.ADBLUE, usageType: FuelProductUsage.ADDITIVE, approved: true },
    ]);
    assert.deepEqual(products, [FuelProductType.DIESEL]);
  });

  it('excludes products that are recorded but not approved', () => {
    const products = compatibleProductsForStationFilter([
      { productType: FuelProductType.HVO100, usageType: FuelProductUsage.ALTERNATIVE, approved: false },
      ...DIESEL_ONLY,
    ]);
    assert.deepEqual(products, [FuelProductType.DIESEL]);
  });
});

describe('filterStationsForVehicle', () => {
  it('strips E5 and E10 offerings completely for a diesel-only vehicle', () => {
    const stations = filterStationsForVehicle(
      [
        station('s1', [
          offering(FuelProductType.DIESEL, 1.759),
          offering(FuelProductType.SUPER_E5, 1.879),
          offering(FuelProductType.SUPER_E10, 1.819),
        ]),
      ],
      [FuelProductType.DIESEL],
    );

    assert.equal(stations.length, 1);
    assert.deepEqual(
      stations[0]!.offerings.map((entry) => entry.productType),
      [FuelProductType.DIESEL],
    );
  });

  it('returns both compatible offerings for an E5 + E10 vehicle', () => {
    const stations = filterStationsForVehicle(
      [
        station('s1', [
          offering(FuelProductType.DIESEL, 1.759),
          offering(FuelProductType.SUPER_E5, 1.879),
          offering(FuelProductType.SUPER_E10, 1.819),
        ]),
      ],
      [FuelProductType.SUPER_E5, FuelProductType.SUPER_E10],
    );

    assert.equal(stations.length, 1);
    const products = stations[0]!.offerings.map((entry) => entry.productType);
    assert.equal(products.length, 2);
    assert.equal(products.includes(FuelProductType.SUPER_E5), true);
    assert.equal(products.includes(FuelProductType.SUPER_E10), true);
    assert.equal(products.includes(FuelProductType.DIESEL), false);
  });

  it('drops a station that has no compatible offering left', () => {
    // Bos teklif listesiyle donen istasyon surucuye "burada yakit var"
    // izlenimi verir.
    const stations = filterStationsForVehicle(
      [
        station('petrol-only', [
          offering(FuelProductType.SUPER_E5, 1.879),
          offering(FuelProductType.SUPER_E10, 1.819),
        ]),
        station('has-diesel', [offering(FuelProductType.DIESEL, 1.759)]),
      ],
      [FuelProductType.DIESEL],
    );

    assert.deepEqual(
      stations.map((entry) => entry.id),
      ['has-diesel'],
    );
  });

  it('returns nothing when the vehicle has no compatible products', () => {
    const stations = filterStationsForVehicle(
      [station('s1', [offering(FuelProductType.DIESEL, 1.759)])],
      [],
    );
    assert.deepEqual(stations, []);
  });

  it('keeps a compatible offering whose price is unknown', () => {
    // Fiyat bilinmiyor diye istasyonu dusurmuyoruz: surucu yine oraya gidip
    // yakit alabilir, sadece fiyati onceden bilmez.
    const stations = filterStationsForVehicle(
      [station('s1', [offering(FuelProductType.DIESEL, null)])],
      [FuelProductType.DIESEL],
    );

    assert.equal(stations.length, 1);
    assert.equal(stations[0]!.offerings[0]!.pricePerUnit, null);
  });
});

describe('null price and null distance are never treated as best', () => {
  it('sorts unknown prices last, not first', () => {
    const ordered = orderOfferingsByPrice([
      offering(FuelProductType.DIESEL, null),
      offering(FuelProductType.SUPER_E5, 1.879),
      offering(FuelProductType.SUPER_E10, 1.799),
    ]);

    assert.deepEqual(
      ordered.map((entry) => entry.pricePerUnit),
      [1.799, 1.879, null],
    );
  });

  it('does not let a null price win over a real price inside a station', () => {
    const stations = filterStationsForVehicle(
      [
        station('s1', [
          offering(FuelProductType.SUPER_E5, null),
          offering(FuelProductType.SUPER_E10, 1.899),
        ]),
      ],
      [FuelProductType.SUPER_E5, FuelProductType.SUPER_E10],
    );

    // Ilk teklif "en iyi" olarak okunacaksa, o gercek fiyatli olan olmali.
    assert.equal(stations[0]!.offerings[0]!.pricePerUnit, 1.899);
    assert.equal(stations[0]!.offerings[1]!.pricePerUnit, null);
  });

  it('sorts unknown distances last', () => {
    const ordered = sortStationsByDistance([
      { distanceKm: null },
      { distanceKm: 4.2 },
      { distanceKm: 0.8 },
    ]);

    assert.deepEqual(
      ordered.map((entry) => entry.distanceKm),
      [0.8, 4.2, null],
    );
  });
});
