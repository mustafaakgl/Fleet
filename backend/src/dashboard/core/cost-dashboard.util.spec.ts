import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Prisma } from '@prisma/client';
import {
  DEFAULT_PERIOD_MONTHS,
  MAX_RANGE_DAYS,
  bucketKeyFor,
  compare,
  costPerKm,
  costPerKmCoverage,
  dataQualityFlags,
  fleetCostPerKm,
  monthBuckets,
  resolvePeriod,
  sortVehicles,
  zonedMonthStart,
} from './cost-dashboard.util';

/** Kisa yazim. */
const d = (value: number | string) => new Prisma.Decimal(value);

describe('metric comparison', () => {
  it('computes absolute and percent change', () => {
    const result = compare(d(1200), d(1000));
    assert.equal(result.current, '1200.00');
    assert.equal(result.previous, '1000.00');
    assert.equal(result.absoluteChange, '200.00');
    assert.equal(result.percentChange, '20.0');
  });

  it('returns a negative change when costs fall', () => {
    const result = compare(d(800), d(1000));
    assert.equal(result.absoluteChange, '-200.00');
    assert.equal(result.percentChange, '-20.0');
  });

  it('returns null percent when the previous period was zero', () => {
    // `Infinity`, `9999%` ya da `100%` yazmak kullaniciyi yanlis bir buyuklukle
    // karar vermeye iter. null = "onceki donemde veri yok".
    const result = compare(d(500), d(0));
    assert.equal(result.absoluteChange, '500.00');
    assert.equal(result.percentChange, null);
  });

  it('handles both periods being zero without dividing', () => {
    const result = compare(d(0), d(0));
    assert.equal(result.percentChange, null);
    assert.equal(result.absoluteChange, '0.00');
  });

  it('keeps money as fixed-precision strings, never floats', () => {
    // 0,1 + 0,2 float'ta 0,30000000000000004 verir.
    const result = compare(d('0.1').plus(d('0.2')), d(0));
    assert.equal(result.current, '0.30');
  });
});

describe('cost per km', () => {
  it('divides cost by distance', () => {
    assert.equal(costPerKm(d(1000), d(2000))!.toFixed(4), '0.5000');
  });

  it('refuses to compute a ratio without usable distance', () => {
    // `0 €/km` "bu arac bedava calisiyor" demek olurdu; gercek "mesafe yok".
    assert.equal(costPerKm(d(1000), null), null);
    assert.equal(costPerKm(d(1000), d(0)), null);
    assert.equal(costPerKm(d(1000), d(-5)), null);
  });
});

describe('fleet cost per km', () => {
  it('is weighted by distance, not an average of vehicle ratios', () => {
    const rows = [
      // 10 km giden pahali arac: oran 10 EUR/km
      { total: d(100), distanceKm: d(10) },
      // 10.000 km giden ucuz arac: oran 0,05 EUR/km
      { total: d(500), distanceKm: d(10000) },
    ];

    const weighted = fleetCostPerKm(rows)!;
    // Dogru cevap 600 / 10010 = 0,0599...
    assert.equal(weighted.toFixed(4), '0.0599');

    // Basit ortalama 5,025 verirdi — filonun gercek birim maliyetini 80 kat
    // sisirir.
    const naiveAverage = (10 + 0.05) / 2;
    assert.ok(Number(weighted) < naiveAverage / 50);
  });

  it('excludes both the cost and the distance of a vehicle without distance', () => {
    // Maliyeti paya katip mesafeyi paydaya katmamak orani sistematik sisirir.
    const rows = [
      { total: d(100), distanceKm: d(1000) },
      { total: d(9999), distanceKm: null },
    ];
    assert.equal(fleetCostPerKm(rows)!.toFixed(4), '0.1000');
  });

  it('returns null when no vehicle has distance', () => {
    assert.equal(fleetCostPerKm([{ total: d(500), distanceKm: null }]), null);
    assert.equal(fleetCostPerKm([]), null);
  });
});

describe('month buckets', () => {
  it('produces one bucket per month including empty ones', () => {
    const from = zonedMonthStart(2026, 3);
    const to = zonedMonthStart(2026, 6);
    const buckets = monthBuckets(from, to);

    // Bos ay ATLANMAZ: eksik ay "o ay maliyet yoktu" bilgisini gizler.
    assert.deepEqual(buckets.map((b) => b.key), ['2026-03', '2026-04', '2026-05', '2026-06']);
  });

  it('covers the month the range ends in even mid-month', () => {
    const buckets = monthBuckets(zonedMonthStart(2026, 1), new Date('2026-02-14T10:00:00Z'));
    assert.deepEqual(buckets.map((b) => b.key), ['2026-01', '2026-02']);
  });

  it('crosses a year boundary', () => {
    const buckets = monthBuckets(zonedMonthStart(2025, 11), zonedMonthStart(2026, 2));
    assert.deepEqual(buckets.map((b) => b.key), ['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('places a record on the month boundary in exactly one bucket', () => {
    const buckets = monthBuckets(zonedMonthStart(2026, 3), zonedMonthStart(2026, 4));
    const marchStart = buckets[0]!;
    const aprilStart = buckets[1]!;

    // Ust sinir HARIC: mart kovasi nisanin ilk anini ICERMEZ.
    assert.equal(marchStart.end.getTime(), aprilStart.start.getTime());
    const boundary = aprilStart.start;
    assert.equal(boundary.getTime() >= marchStart.end.getTime(), true);
    assert.equal(bucketKeyFor(boundary), '2026-04');
  });

  it('keeps the local month start correct across a DST change', () => {
    // Almanya'da yaz saati mart sonunda basliyor. Yerel ay basi her iki
    // tarafta da yerel gece yarisi olmali, bir saat kaymamali.
    const march = zonedMonthStart(2026, 3);
    const april = zonedMonthStart(2026, 4);

    const localHour = (instant: Date) =>
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Berlin',
        hour: '2-digit',
        hour12: false,
      }).format(instant);

    assert.equal(localHour(march), '00');
    assert.equal(localHour(april), '00');
  });
});

describe('period resolution', () => {
  const now = new Date('2026-08-16T12:00:00Z');

  it('defaults to six months', () => {
    const result = resolvePeriod({}, now);
    assert.ok(result.ok);
    assert.equal(monthBuckets(result.period.from, result.period.to).length, DEFAULT_PERIOD_MONTHS);
  });

  it('builds a non-overlapping comparison period of equal length', () => {
    const result = resolvePeriod(
      { from: '2026-04-01T00:00:00Z', to: '2026-07-01T00:00:00Z' },
      now,
    );
    assert.ok(result.ok);
    const { from, to, comparisonFrom, comparisonTo } = result.period;

    // Esit uzunluk.
    assert.equal(to.getTime() - from.getTime(), comparisonTo.getTime() - comparisonFrom.getTime());
    // CAKISMIYOR: onceki donem tam olarak `from`da biter.
    assert.equal(comparisonTo.getTime(), from.getTime());
  });

  it('rejects a reversed range', () => {
    const result = resolvePeriod({ from: '2026-07-01', to: '2026-04-01' }, now);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.error, 'reversed_range');
  });

  it('rejects a range that starts in the future', () => {
    const result = resolvePeriod({ from: '2027-01-01', to: '2027-02-01' }, now);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.error, 'range_in_future');
  });

  it('rejects an unbounded history query', () => {
    const result = resolvePeriod({ from: '2000-01-01', to: '2026-08-01' }, now);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.error, 'range_too_large');
  });

  it('accepts a range at the documented limit', () => {
    const to = new Date(now.getTime());
    const from = new Date(to.getTime() - (MAX_RANGE_DAYS - 1) * 86_400_000);
    const result = resolvePeriod({ from: from.toISOString(), to: to.toISOString() }, now);
    assert.equal(result.ok, true);
  });

  it('rejects an unparseable date', () => {
    const result = resolvePeriod({ from: 'gestern', to: '2026-08-01' }, now);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.error, 'invalid_range');
  });
});

describe('vehicle ranking', () => {
  const vehicle = (
    id: string,
    plate: string,
    total: number,
    perKm: number | null = null,
  ) => ({
    vehicleId: id,
    plateNumber: plate,
    total: d(total),
    costPerKm: perKm === null ? null : d(perKm),
    margin: null,
    changePercent: null,
  });

  it('sorts by total cost descending', () => {
    const sorted = sortVehicles(
      [vehicle('a', 'AA-1', 100), vehicle('b', 'BB-2', 300), vehicle('c', 'CC-3', 200)],
      'total',
    );
    assert.deepEqual(sorted.map((row) => row.vehicleId), ['b', 'c', 'a']);
  });

  it('breaks ties deterministically by plate then id', () => {
    // Kararsiz siralama, sayfalamada bir aracin hic gorunmemesine yol acar.
    const first = sortVehicles(
      [vehicle('z', 'BB-2', 100), vehicle('a', 'AA-1', 100)],
      'total',
    );
    const second = sortVehicles(
      [vehicle('a', 'AA-1', 100), vehicle('z', 'BB-2', 100)],
      'total',
    );
    assert.deepEqual(
      first.map((r) => r.vehicleId),
      second.map((r) => r.vehicleId),
    );
    assert.deepEqual(first.map((r) => r.vehicleId), ['a', 'z']);
  });

  it('pushes vehicles without the sort metric to the end', () => {
    const sorted = sortVehicles(
      [
        vehicle('no-data', 'AA-1', 999, null),
        vehicle('cheap', 'BB-2', 100, 0.2),
        vehicle('pricey', 'CC-3', 100, 5),
      ],
      'costPerKm',
    );
    // "Veri yok" en iyi ya da en kotu DEGILDIR — siralanamaz, sona gider.
    assert.deepEqual(sorted.map((r) => r.vehicleId), ['pricey', 'cheap', 'no-data']);
  });
});

describe('data quality flags', () => {
  it('flags a vehicle without distance', () => {
    const flags = dataQualityFlags({ distanceKm: null, total: d(100), hasRevenue: true });
    assert.ok(flags.includes('no_distance'));
    assert.equal(flags.includes('no_costs'), false);
  });

  it('flags a vehicle without any cost', () => {
    const flags = dataQualityFlags({ distanceKm: d(100), total: d(0), hasRevenue: true });
    assert.ok(flags.includes('no_costs'));
  });

  it('reports a clean vehicle with no flags', () => {
    assert.deepEqual(
      dataQualityFlags({ distanceKm: d(1000), total: d(500), hasRevenue: true }),
      [],
    );
  });
});

describe('tenant timezone', () => {
  it('puts the same UTC instant in a different month for Berlin and Istanbul', () => {
    // 31 Temmuz 23:30 UTC: Berlin'de (UTC+2) 1 Agustos 01:30,
    // Istanbul'da (UTC+3) 1 Agustos 02:30 — ikisi de agustos.
    // Kritik ornek ayin ILK aninda: 31 Temmuz 21:30 UTC Berlin'de
    // 31 Temmuz 23:30 (temmuz), Istanbul'da 1 Agustos 00:30 (AGUSTOS).
    const instant = new Date('2026-07-31T21:30:00Z');

    assert.equal(bucketKeyFor(instant, 'Europe/Berlin'), '2026-07');
    assert.equal(bucketKeyFor(instant, 'Europe/Istanbul'), '2026-08');
  });

  it('starts the month at local midnight in each zone', () => {
    const localHour = (instant: Date, zone: string) =>
      new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', hour12: false }).format(
        instant,
      );

    const berlin = zonedMonthStart(2026, 8, 'Europe/Berlin');
    const istanbul = zonedMonthStart(2026, 8, 'Europe/Istanbul');

    assert.equal(localHour(berlin, 'Europe/Berlin'), '00');
    assert.equal(localHour(istanbul, 'Europe/Istanbul'), '00');
    // Istanbul UTC+3, Berlin yazin UTC+2 -> ay basi bir saat ONCE gelir.
    assert.equal(berlin.getTime() - istanbul.getTime(), 3_600_000);
  });

  it('keeps Istanbul month starts correct although it has no DST', () => {
    // Turkiye 2016'dan beri kalici UTC+3; yaz/kis ofseti DEGISMEZ.
    const winter = zonedMonthStart(2026, 1, 'Europe/Istanbul');
    const summer = zonedMonthStart(2026, 7, 'Europe/Istanbul');

    const offset = (instant: Date) => {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Istanbul',
        hour: '2-digit',
        hour12: false,
      }).format(instant);
      return parts;
    };
    assert.equal(offset(winter), '00');
    assert.equal(offset(summer), '00');
  });

  it('handles the Berlin DST switch without shifting the month start', () => {
    // Berlin kisin UTC+1, yazin UTC+2 — ay basi HER IKISINDE de yerel 00:00.
    const beforeDst = zonedMonthStart(2026, 3, 'Europe/Berlin');
    const afterDst = zonedMonthStart(2026, 4, 'Europe/Berlin');
    const localHour = (instant: Date) =>
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Berlin',
        hour: '2-digit',
        hour12: false,
      }).format(instant);

    assert.equal(localHour(beforeDst), '00');
    assert.equal(localHour(afterDst), '00');
  });

  it('resolves the default period in the tenant zone', () => {
    const now = new Date('2026-08-01T00:30:00Z');
    // Istanbul'da bu an 03:30, 1 Agustos. Berlin'de 02:30, yine 1 Agustos.
    const istanbul = resolvePeriod({ months: 1 }, now, 'Europe/Istanbul');
    assert.ok(istanbul.ok);
    assert.deepEqual(
      monthBuckets(istanbul.period.from, istanbul.period.to, 'Europe/Istanbul').map((b) => b.key),
      ['2026-08'],
    );
  });
});

describe('cost per km coverage', () => {
  it('reports which slice of the fleet the ratio actually covers', () => {
    const coverage = costPerKmCoverage([
      { total: d(600), distanceKm: d(10000) },
      { total: d(400), distanceKm: null },
    ]);

    assert.equal(coverage.includedVehicleCount, 1);
    assert.equal(coverage.excludedVehicleCount, 1);
    assert.equal(coverage.includedCost, '600.00');
    assert.equal(coverage.totalFleetCost, '1000.00');
    // Oran filo maliyetinin YALNIZCA %60'ini temsil ediyor — bunu soylemeden
    // "0,06 EUR/km" yazmak yanlis bir kesinlik verirdi.
    assert.equal(coverage.costCoveragePercent, '60.0');
  });

  it('reports full coverage when every vehicle has distance', () => {
    const coverage = costPerKmCoverage([{ total: d(500), distanceKm: d(1000) }]);
    assert.equal(coverage.costCoveragePercent, '100.0');
    assert.equal(coverage.excludedVehicleCount, 0);
  });

  it('returns null coverage instead of a fake 100% when there are no costs', () => {
    const coverage = costPerKmCoverage([{ total: d(0), distanceKm: null }]);
    assert.equal(coverage.costCoveragePercent, null);
  });
});
