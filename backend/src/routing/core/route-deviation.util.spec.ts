import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SUSPICIOUS_DEVIATION_RATIO,
  computeDeviation,
  deviationRatio,
  isSuspicious,
  sumDeviations,
} from './route-deviation.util';

const FULL = {
  plannedKm: 76,
  actualKm: 94,
  consumptionLPer100Km: 30,
  pricePerLiter: 1.7,
};

describe('route-deviation.util', () => {
  describe('computeDeviation', () => {
    it('turns extra kilometres into litres and euros', () => {
      const result = computeDeviation(FULL);
      assert.equal(result.deviationKm, 18);
      // 18 km * 30 L/100km = 5.4 L
      assert.equal(result.deviationLiters, 5.4);
      // 5.4 L * 1.70 EUR = 9.18 EUR
      assert.equal(result.deviationCostEur, 9.18);
      assert.deepEqual(result.missing, []);
    });

    it('keeps a negative deviation negative when less was driven than planned', () => {
      // Mutlak deger alinsaydi rapor gercekte olmayan bir kayip gosterirdi.
      const result = computeDeviation({ ...FULL, actualKm: 70 });
      assert.equal(result.deviationKm, -6);
      assert.equal(result.deviationLiters, -1.8);
      assert.ok((result.deviationCostEur ?? 0) < 0);
    });

    it('still reports the kilometre gap when consumption is unknown', () => {
      const result = computeDeviation({ ...FULL, consumptionLPer100Km: null });
      assert.equal(result.deviationKm, 18);
      assert.equal(result.deviationLiters, null);
      assert.equal(result.deviationCostEur, null);
      assert.ok(result.missing.includes('consumption'));
    });

    it('reports litres but no cost when the fuel price is unknown', () => {
      const result = computeDeviation({ ...FULL, pricePerLiter: null });
      assert.equal(result.deviationLiters, 5.4);
      assert.equal(result.deviationCostEur, null);
      assert.ok(result.missing.includes('price'));
    });

    it('computes nothing without both distances, and says which is missing', () => {
      const noPlan = computeDeviation({ ...FULL, plannedKm: null });
      assert.equal(noPlan.deviationKm, null);
      assert.ok(noPlan.missing.includes('planned'));

      const noActual = computeDeviation({ ...FULL, actualKm: null });
      assert.equal(noActual.deviationKm, null);
      assert.ok(noActual.missing.includes('actual'));
    });

    it('treats a zero planned distance as missing rather than dividing by it', () => {
      const result = computeDeviation({ ...FULL, plannedKm: 0 });
      assert.equal(result.deviationKm, null);
      assert.ok(result.missing.includes('planned'));
    });

    it('rejects negative inputs instead of producing nonsense', () => {
      const result = computeDeviation({ ...FULL, actualKm: -5 });
      assert.equal(result.deviationKm, null);
      assert.ok(result.missing.includes('actual'));
    });
  });

  describe('deviationRatio / isSuspicious', () => {
    it('computes the ratio against the plan', () => {
      assert.equal(deviationRatio(100, 115), 0.15);
      assert.equal(deviationRatio(100, 90), -0.1);
    });

    it('flags only deviations above the threshold', () => {
      assert.equal(isSuspicious(100, 111), true);
      assert.equal(isSuspicious(100, 109), false);
      // Esik tam sinirda dahil degil
      assert.equal(isSuspicious(100, 100 * (1 + SUSPICIOUS_DEVIATION_RATIO)), false);
    });

    it('never flags a shorter-than-planned trip', () => {
      assert.equal(isSuspicious(100, 50), false);
    });

    it('returns null ratio when data is missing', () => {
      assert.equal(deviationRatio(null, 100), null);
      assert.equal(deviationRatio(100, null), null);
      assert.equal(deviationRatio(0, 100), null);
    });
  });

  describe('sumDeviations', () => {
    it('nets positive and negative deviations against each other', () => {
      const totals = sumDeviations([
        computeDeviation({ ...FULL, plannedKm: 100, actualKm: 110 }),
        computeDeviation({ ...FULL, plannedKm: 100, actualKm: 90 }),
      ]);
      assert.equal(totals.totalDeviationKm, 0);
      assert.equal(totals.computable, 2);
    });

    it('counts rows it could not compute separately', () => {
      const totals = sumDeviations([
        computeDeviation(FULL),
        computeDeviation({ ...FULL, actualKm: null }),
      ]);
      assert.equal(totals.assignments, 2);
      assert.equal(totals.computable, 1);
      assert.equal(totals.totalDeviationKm, 18);
    });

    it('adds up a realistic month', () => {
      const rows = Array.from({ length: 47 }, () =>
        computeDeviation({ ...FULL, plannedKm: 100, actualKm: 126.4 }),
      );
      const totals = sumDeviations(rows);
      assert.equal(totals.assignments, 47);
      assert.equal(totals.totalDeviationKm, 1240.8);
      assert.ok(totals.totalDeviationCostEur > 600);
    });
  });
});
