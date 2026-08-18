import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Prisma } from '@prisma/client';
import { evaluateFuelReconciliation } from './fuel-reconciliation.engine';
import type {
  FuelLevelSampleInput,
  FuelReconciliationInput,
} from './fuel-reconciliation.types';

const RECEIPT_AT = new Date('2026-08-14T10:00:00.000Z');
const NOW = new Date('2026-08-14T12:00:00.000Z');

function dec(value: number | string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function sample(minutesFromReceipt: number, pct: number): FuelLevelSampleInput {
  return {
    recordedAt: new Date(RECEIPT_AT.getTime() + minutesFromReceipt * 60_000),
    fuelLevelPct: dec(pct),
    ignition: minutesFromReceipt < 0,
    odometerKm: null,
  };
}

/** 80 litrelik depo, 50 litrelik fis, seviye 20 -> 82.5 (= tam 50 litre). */
function baseInput(overrides: Partial<FuelReconciliationInput> = {}): FuelReconciliationInput {
  return {
    receipt: {
      enteredAt: RECEIPT_AT,
      liters: dec(50),
      pricePerLiter: dec('1.7500'),
      totalCost: dec('87.50'),
      fuelProduct: 'diesel',
      compatibilityMismatch: false,
    },
    vehicle: {
      fuelTankCapacityLiters: dec(80),
      avgConsumptionLPer100Km: dec('7.50'),
    },
    fuelingIntent: {
      stationLatitude: dec('52.5200000'),
      stationLongitude: dec('13.4050000'),
      quotedPricePerLitre: dec('1.7400'),
      priceRetrievedAt: new Date(RECEIPT_AT.getTime() - 20 * 60_000),
    },
    fuelLevelSamples: [sample(-20, 20), sample(-5, 20), sample(5, 82.5), sample(30, 82.5)],
    positions: [
      { recordedAt: RECEIPT_AT, latitude: dec('52.5201000'), longitude: dec('13.4051000') },
    ],
    siblingReceipts: [],
    distanceSincePreviousReceiptKm: dec(600),
    now: NOW,
    ...overrides,
  };
}

function codes(outcome: ReturnType<typeof evaluateFuelReconciliation>): string[] {
  return outcome.signals.map((signal) => signal.code).sort();
}

describe('fuel-reconciliation.engine', () => {
  it('normal fill: no signals, primary evidence measured', () => {
    const outcome = evaluateFuelReconciliation(baseInput());

    assert.deepEqual(codes(outcome), []);
    assert.equal(outcome.riskLevel, 'normal');
    assert.equal(outcome.riskScore, 0);
    assert.equal(outcome.evidence.observedIncreaseLiters, 50);
    assert.equal(outcome.evidence.absoluteDifferenceLiters, 0);
    assert.ok(outcome.dataQuality.evaluatedRules.includes('fuel_level_increase'));
    assert.ok(outcome.dataQuality.evaluatedRules.includes('vehicle_at_station'));
  });

  it('no telematics data at all stays insufficient_data instead of normal', () => {
    const outcome = evaluateFuelReconciliation(
      baseInput({ fuelLevelSamples: [], positions: [], fuelingIntent: null }),
    );

    assert.deepEqual(codes(outcome), []);
    assert.equal(outcome.riskLevel, 'insufficient_data');
    assert.ok(
      outcome.dataQuality.skippedRules.some(
        (rule) => rule.code === 'fuel_level_increase' && rule.reason === 'no_usable_fuel_level_samples',
      ),
    );
    assert.ok(outcome.dataQuality.missing.includes('missing_station_location'));
  });

  it('missing tank capacity disables the capacity and level rules but keeps the rest', () => {
    const outcome = evaluateFuelReconciliation(
      baseInput({
        vehicle: { fuelTankCapacityLiters: null, avgConsumptionLPer100Km: dec('7.50') },
        // Kapasite bilinmese bile asim iddiasi URETILMEMELI.
        receipt: { ...baseInput().receipt, liters: dec(400) },
        // Tuketim kurali bu senaryonun konusu degil; mesafe verisi cikarildi.
        distanceSincePreviousReceiptKm: null,
      }),
    );

    assert.deepEqual(codes(outcome), []);
    assert.equal(outcome.dataQuality.hasTankCapacity, false);
    assert.ok(
      outcome.dataQuality.skippedRules.some(
        (rule) => rule.code === 'tank_capacity' && rule.reason === 'missing_tank_capacity',
      ),
    );
    // Konum olculebildi, o yuzden "veri yok" degil.
    assert.equal(outcome.riskLevel, 'normal');
  });

  it('receipt above tank capacity is a strong signal even without telematics', () => {
    const outcome = evaluateFuelReconciliation(
      baseInput({
        receipt: { ...baseInput().receipt, liters: dec(140) },
        fuelLevelSamples: [],
        positions: [],
        fuelingIntent: null,
        distanceSincePreviousReceiptKm: null,
      }),
    );

    assert.deepEqual(codes(outcome), ['receipt_exceeds_tank_capacity']);
    assert.equal(outcome.riskLevel, 'high_attention');
  });

  it('no observed level rise is a strong signal', () => {
    const outcome = evaluateFuelReconciliation(
      baseInput({ fuelLevelSamples: [sample(-20, 40), sample(-5, 40), sample(20, 40)] }),
    );

    assert.ok(codes(outcome).includes('no_fuel_level_increase'));
    assert.equal(outcome.riskLevel, 'high_attention');
    assert.equal(outcome.evidence.observedIncreaseLiters, 0);
  });

  it('a large but not extreme litre gap is a moderate signal, not high attention', () => {
    // 50 litrelik fis, gozlenen artis 32 litre (%40 = tam esikte, asmiyor).
    const outcome = evaluateFuelReconciliation(
      baseInput({ fuelLevelSamples: [sample(-10, 20), sample(10, 60), sample(30, 60)] }),
    );

    assert.deepEqual(codes(outcome), ['fuel_level_increase_deviation']);
    assert.equal(outcome.riskLevel, 'review_required');
    assert.equal(outcome.evidence.observedIncreaseLiters, 32);
    assert.equal(outcome.evidence.absoluteDifferenceLiters, 18);
  });

  it('an extreme litre gap is strong', () => {
    // Gozlenen artis 8 litre, fis 50 litre.
    const outcome = evaluateFuelReconciliation(
      baseInput({ fuelLevelSamples: [sample(-10, 20), sample(10, 30), sample(30, 30)] }),
    );

    assert.ok(codes(outcome).includes('fuel_level_increase_mismatch'));
    assert.equal(outcome.riskLevel, 'high_attention');
  });

  it('a rise smaller than the sensor can show does not fire anything', () => {
    // 900 litrelik depoya 12 litre: beklenen artis %1.33, cozunurluk adiminin
    // (2 x %1) altinda. "Artis yok" demek yanlis alarm olurdu.
    const outcome = evaluateFuelReconciliation(
      baseInput({
        vehicle: { fuelTankCapacityLiters: dec(900), avgConsumptionLPer100Km: dec('7.50') },
        receipt: { ...baseInput().receipt, liters: dec(12), totalCost: dec('21.00') },
        fuelLevelSamples: [sample(-10, 40), sample(10, 40), sample(30, 40)],
        distanceSincePreviousReceiptKm: null,
      }),
    );

    assert.deepEqual(codes(outcome), []);
    assert.ok(
      outcome.dataQuality.skippedRules.some(
        (rule) => rule.reason === 'expected_rise_below_sensor_resolution',
      ),
    );
  });

  it('vehicle far away from the station is strong; the mid range stays silent', () => {
    const far = evaluateFuelReconciliation(
      baseInput({
        positions: [
          { recordedAt: RECEIPT_AT, latitude: dec('52.6000000'), longitude: dec('13.4050000') },
        ],
      }),
    );
    assert.ok(codes(far).includes('vehicle_far_from_station'));
    assert.equal(far.riskLevel, 'high_attention');
    assert.ok((far.evidence.stationDistanceMeters ?? 0) > 2000);

    const midRange = evaluateFuelReconciliation(
      baseInput({
        positions: [
          { recordedAt: RECEIPT_AT, latitude: dec('52.5290000'), longitude: dec('13.4050000') },
        ],
      }),
    );
    assert.deepEqual(codes(midRange), []);
    assert.equal(midRange.riskLevel, 'normal');
  });

  it('positions far from the receipt time are not used at all', () => {
    const outcome = evaluateFuelReconciliation(
      baseInput({
        positions: [
          {
            recordedAt: new Date(RECEIPT_AT.getTime() + 90 * 60_000),
            latitude: dec('53.0000000'),
            longitude: dec('13.4050000'),
          },
        ],
      }),
    );

    assert.deepEqual(codes(outcome), []);
    assert.ok(
      outcome.dataQuality.skippedRules.some(
        (rule) => rule.code === 'vehicle_at_station' && rule.reason === 'no_positions_near_receipt',
      ),
    );
  });

  it('a level rise far away in time from the receipt is a moderate signal', () => {
    const outcome = evaluateFuelReconciliation(
      baseInput({
        fuelLevelSamples: [sample(-80, 20), sample(-70, 82.5), sample(20, 82.5)],
      }),
    );

    assert.deepEqual(codes(outcome), ['receipt_time_differs_from_level_rise']);
    assert.equal(outcome.riskLevel, 'review_required');
    assert.equal(outcome.evidence.receiptToRiseMinutes, 70);
  });

  it('incompatible fuel product is strong', () => {
    const outcome = evaluateFuelReconciliation(
      baseInput({
        receipt: { ...baseInput().receipt, compatibilityMismatch: true, fuelProduct: 'e10' },
      }),
    );

    assert.ok(codes(outcome).includes('fuel_product_not_compatible'));
    assert.equal(outcome.riskLevel, 'high_attention');
  });

  it('a near-identical receipt within the window is a duplicate candidate', () => {
    const outcome = evaluateFuelReconciliation(
      baseInput({
        siblingReceipts: [
          {
            id: 'twin-1',
            enteredAt: new Date(RECEIPT_AT.getTime() + 12 * 60_000),
            liters: dec(50),
            totalCost: dec('87.40'),
            receiptNumber: 'R-2',
          },
        ],
      }),
    );

    assert.ok(codes(outcome).includes('possible_duplicate_receipt'));
    assert.equal(outcome.evidence.duplicateCandidateId, 'twin-1');
    assert.equal(outcome.riskLevel, 'high_attention');
  });

  it('a same-amount receipt outside the window is not a duplicate', () => {
    const outcome = evaluateFuelReconciliation(
      baseInput({
        siblingReceipts: [
          {
            id: 'twin-1',
            enteredAt: new Date(RECEIPT_AT.getTime() + 8 * 60 * 60_000),
            liters: dec(50),
            totalCost: dec('87.50'),
            receiptNumber: 'R-2',
          },
        ],
      }),
    );

    assert.deepEqual(codes(outcome), []);
  });

  it('a stale price snapshot is never compared against the receipt', () => {
    const outcome = evaluateFuelReconciliation(
      baseInput({
        receipt: { ...baseInput().receipt, pricePerLiter: dec('2.6000') },
        fuelingIntent: {
          ...baseInput().fuelingIntent!,
          // Fisten 3 gun once alinmis fiyat: sapma degil, takvim farki.
          priceRetrievedAt: new Date(RECEIPT_AT.getTime() - 3 * 24 * 60 * 60_000),
        },
      }),
    );

    assert.deepEqual(codes(outcome), []);
    assert.equal(outcome.dataQuality.hasFreshPriceSnapshot, false);
    assert.equal(outcome.evidence.priceDeviationRatio, null);
    assert.ok(
      outcome.dataQuality.skippedRules.some((rule) => rule.reason === 'price_snapshot_too_old'),
    );
  });

  it('a fresh price snapshot far off the receipt price is a moderate signal', () => {
    const outcome = evaluateFuelReconciliation(
      baseInput({ receipt: { ...baseInput().receipt, pricePerLiter: dec('2.6000') } }),
    );

    assert.deepEqual(codes(outcome), ['unit_price_differs_from_quote']);
    assert.equal(outcome.riskLevel, 'review_required');
  });

  it('the distance/consumption signal alone never reaches high attention', () => {
    const outcome = evaluateFuelReconciliation(
      baseInput({
        // 100 km x 7.5 l/100km = 7.5 litre beklenir, fis 50 litre.
        distanceSincePreviousReceiptKm: dec(100),
      }),
    );

    assert.deepEqual(codes(outcome), ['consumption_out_of_range']);
    assert.equal(outcome.riskLevel, 'review_required');
    assert.equal(outcome.evidence.expectedLitersFromDistance, 7.5);
  });

  it('two independent moderate signals reach high attention', () => {
    const outcome = evaluateFuelReconciliation(
      baseInput({
        receipt: { ...baseInput().receipt, pricePerLiter: dec('2.6000') },
        distanceSincePreviousReceiptKm: dec(100),
      }),
    );

    assert.deepEqual(codes(outcome), ['consumption_out_of_range', 'unit_price_differs_from_quote']);
    assert.equal(outcome.riskLevel, 'high_attention');
  });

  it('two moderate findings from the same measurement stay one group', () => {
    // Seviye farki (quantity) + zaman farki (time) ayri gruplar; ayni
    // olcumden dogan iki quantity kusuru ayni gruptur ve tek sayilir.
    const outcome = evaluateFuelReconciliation(
      baseInput({ fuelLevelSamples: [sample(-10, 20), sample(10, 60), sample(30, 60)] }),
    );
    const groups = new Set(outcome.signals.map((signal) => signal.group));
    assert.equal(groups.size, 1);
    assert.equal(outcome.riskLevel, 'review_required');
  });

  it('drops future-dated samples and duplicate device timestamps', () => {
    const duplicate = sample(5, 82.5);
    const outcome = evaluateFuelReconciliation(
      baseInput({
        fuelLevelSamples: [
          sample(-20, 20),
          duplicate,
          { ...duplicate, fuelLevelPct: dec(10) },
          sample(30, 82.5),
          // Cihaz saati 5 saat ileride: olcum degil, saat hatasi.
          { ...sample(300, 5), recordedAt: new Date(NOW.getTime() + 5 * 60 * 60_000) },
        ],
      }),
    );

    assert.deepEqual(codes(outcome), []);
    assert.equal(outcome.evidence.observedIncreaseLiters, 50);
  });

  it('out-of-order samples are ordered by device time before measuring', () => {
    const outcome = evaluateFuelReconciliation(
      baseInput({ fuelLevelSamples: [sample(30, 82.5), sample(5, 82.5), sample(-20, 20)] }),
    );

    assert.deepEqual(codes(outcome), []);
    assert.equal(outcome.evidence.observedIncreaseLiters, 50);
    assert.equal(outcome.riskLevel, 'normal');
  });

  it('a rise that only exists before the receipt is not counted as measured', () => {
    const outcome = evaluateFuelReconciliation(
      baseInput({ fuelLevelSamples: [sample(-40, 20), sample(-10, 82.5)] }),
    );

    assert.ok(
      outcome.dataQuality.skippedRules.some(
        (rule) => rule.code === 'fuel_level_increase' && rule.reason === 'no_usable_fuel_level_samples',
      ),
    );
  });
});
