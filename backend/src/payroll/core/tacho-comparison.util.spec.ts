import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compareBreakWithTacho, intersectIntervals } from './tacho-comparison.util';

function interval(fromIso: string, toIso: string) {
  return { from: new Date(fromIso), to: new Date(toIso) };
}

describe('intersectIntervals', () => {
  it('vardiya penceresine dusen kismi keser', () => {
    // Takograf blogu vardiyadan once basliyor, sonra bitiyor.
    const result = intersectIntervals(
      [interval('2026-08-10T04:00:00.000Z', '2026-08-10T15:00:00.000Z')],
      interval('2026-08-10T05:00:00.000Z', '2026-08-10T14:00:00.000Z'),
    );

    assert.equal(result.length, 1);
    assert.equal(result[0].from.toISOString(), '2026-08-10T05:00:00.000Z');
    assert.equal(result[0].to.toISOString(), '2026-08-10T14:00:00.000Z');
  });

  it('gunluk dinlenmeyi tamamen disarida birakir', () => {
    // Gece 20:00–07:00 dinlenmesi vardiyanin disinda: bunu molaya saymak
    // her gunu devasa bir sapma gibi gosterirdi.
    const result = intersectIntervals(
      [interval('2026-08-09T18:00:00.000Z', '2026-08-10T05:00:00.000Z')],
      interval('2026-08-10T05:00:00.000Z', '2026-08-10T14:00:00.000Z'),
    );

    assert.deepEqual(result, []);
  });

  it('penceresiz veya ters araligi eler', () => {
    assert.deepEqual(
      intersectIntervals(
        [interval('2026-08-10T09:00:00.000Z', '2026-08-10T10:00:00.000Z')],
        interval('2026-08-10T14:00:00.000Z', '2026-08-10T05:00:00.000Z'),
      ),
      [],
    );
  });

  it('birden fazla blogu ayri ayri keser', () => {
    const result = intersectIntervals(
      [
        interval('2026-08-10T08:00:00.000Z', '2026-08-10T08:30:00.000Z'),
        interval('2026-08-10T11:00:00.000Z', '2026-08-10T11:20:00.000Z'),
      ],
      interval('2026-08-10T05:00:00.000Z', '2026-08-10T14:00:00.000Z'),
    );

    assert.equal(result.length, 2);
  });
});

describe('compareBreakWithTacho', () => {
  const tolerance = 15;

  it('kullanicinin ornegini isaretler: 30 dk mola, 47 dk REST', () => {
    const result = compareBreakWithTacho({
      driverBreakMinutes: 30,
      workedMinutes: 480,
      tachoRestMinutes: 47,
      toleranceMinutes: tolerance,
    });

    assert.equal(result?.tachoRestMinutes, 47);
    assert.equal(result?.deltaMinutes, 17);
    assert.equal(result?.mismatch, true);
  });

  it('tolerans icindeki farki isaretlemez', () => {
    // Surucu dugmeye basmayi geciktirir, takograf aracin durusundan sayar;
    // birkac dakika fark normaldir.
    const result = compareBreakWithTacho({
      driverBreakMinutes: 45,
      workedMinutes: 480,
      tachoRestMinutes: 52,
      toleranceMinutes: tolerance,
    });

    assert.equal(result?.deltaMinutes, 7);
    assert.equal(result?.mismatch, false);
  });

  it('surucunun FAZLA mola yazmasini da isaretler', () => {
    const result = compareBreakWithTacho({
      driverBreakMinutes: 60,
      workedMinutes: 480,
      tachoRestMinutes: 20,
      toleranceMinutes: tolerance,
    });

    assert.equal(result?.deltaMinutes, -40);
    assert.equal(result?.mismatch, true);
  });

  it('tam esikte isaretlemez, bir dakika ustunde isaretler', () => {
    const atLimit = compareBreakWithTacho({
      driverBreakMinutes: 30,
      workedMinutes: 480,
      tachoRestMinutes: 45,
      toleranceMinutes: tolerance,
    });
    const overLimit = compareBreakWithTacho({
      driverBreakMinutes: 30,
      workedMinutes: 480,
      tachoRestMinutes: 46,
      toleranceMinutes: tolerance,
    });

    assert.equal(atLimit?.mismatch, false);
    assert.equal(overLimit?.mismatch, true);
  });

  it('takograf verisi olmayan gunde KARSILASTIRMAZ', () => {
    // DDD dosyasinin gelmemis olmasi "surucu hic dinlenmedi" demek degil.
    const result = compareBreakWithTacho({
      driverBreakMinutes: 30,
      workedMinutes: 480,
      tachoRestMinutes: undefined,
      toleranceMinutes: tolerance,
    });

    assert.equal(result, null);
  });

  it('calisilmayan gunde karsilastirmaz', () => {
    const result = compareBreakWithTacho({
      driverBreakMinutes: 0,
      workedMinutes: 0,
      tachoRestMinutes: 660,
      toleranceMinutes: tolerance,
    });

    assert.equal(result, null);
  });
});
