import { Prisma } from '@prisma/client';
import { haversineMeters } from '../../../routing/core/geo-distance.util';
import {
  FUEL_RECONCILIATION_ALGORITHM_VERSION,
  FUEL_RECONCILIATION_THRESHOLDS as T,
} from './fuel-reconciliation-config';
import { selectFuelLevelWindow } from './fuel-level-window';
import type {
  FuelReconciliationEvidence,
  FuelReconciliationInput,
  FuelReconciliationOutcome,
  FuelReconciliationRisk,
  FuelReconciliationSignal,
  SkippedRule,
} from './fuel-reconciliation.types';

const ZERO = new Prisma.Decimal(0);
const HUNDRED = new Prisma.Decimal(100);

function toNumber(value: Prisma.Decimal | null | undefined): number | null {
  return value === null || value === undefined ? null : Number(value);
}

/** Kullaniciya sunulacak sayilarda YANLIS KESINLIK uretmemek icin. */
function round(value: Prisma.Decimal, decimals: number): number {
  return Number(value.toDecimalPlaces(decimals));
}

function minutesBetween(left: Date, right: Date): number {
  return Math.abs(left.getTime() - right.getTime()) / 60_000;
}

/**
 * Yakit fisi / telematik mutabakatinin SAF kural motoru.
 *
 * Veritabani, saat, rastgelelik yok: ayni girdi her zaman ayni sonucu verir.
 * Testler bu yuzden gercek bir kurulum gerektirmiyor ve bir esik degistiginde
 * hangi senaryonun kaydigi tek tek gorulebiliyor.
 *
 * URETTIGI SEY BIR HUKUM DEGIL: en agir sonuc bile "insan baksin" demektir.
 * Kodda "hirsizlik", "hile", "dolandiricilik" gibi bir sinif YOKTUR.
 */
export function evaluateFuelReconciliation(
  input: FuelReconciliationInput,
): FuelReconciliationOutcome {
  const signals: FuelReconciliationSignal[] = [];
  const evaluatedRules: string[] = [];
  const skippedRules: SkippedRule[] = [];

  const strong = (
    code: string,
    group: FuelReconciliationSignal['group'],
    values: FuelReconciliationSignal['values'],
  ) => {
    signals.push({ code, severity: 'strong', group, weight: T.weights.strong, values });
  };
  const moderate = (
    code: string,
    group: FuelReconciliationSignal['group'],
    values: FuelReconciliationSignal['values'],
  ) => {
    signals.push({ code, severity: 'moderate', group, weight: T.weights.moderate, values });
  };
  const skip = (code: string, reason: string) => skippedRules.push({ code, reason });

  const receiptLiters = input.receipt.liters;
  const capacity = input.vehicle.fuelTankCapacityLiters;
  const hasCapacity = capacity !== null && capacity.greaterThan(ZERO);

  const evidence: FuelReconciliationEvidence = {
    receiptLiters: toNumber(receiptLiters),
    observedIncreaseLiters: null,
    observedIncreasePct: null,
    absoluteDifferenceLiters: null,
    percentageDifference: null,
    tankCapacityLiters: toNumber(capacity),
    levelRiseAt: null,
    receiptToRiseMinutes: null,
    stationDistanceMeters: null,
    closestPositionAt: null,
    quotedPricePerLitre: toNumber(input.fuelingIntent?.quotedPricePerLitre ?? null),
    receiptPricePerLiter: toNumber(input.receipt.pricePerLiter),
    priceDeviationRatio: null,
    distanceSincePreviousReceiptKm: toNumber(input.distanceSincePreviousReceiptKm),
    expectedLitersFromDistance: null,
    duplicateCandidateId: null,
  };

  // ---------------------------------------------------------------------
  // 1) Fis litresi depo kapasitesini asiyor mu
  // ---------------------------------------------------------------------
  if (!receiptLiters || receiptLiters.lessThanOrEqualTo(ZERO)) {
    skip('tank_capacity', 'missing_receipt_liters');
  } else if (!hasCapacity) {
    // Kapasite bilinmiyorsa kural HIC CALISMAZ — tahmini bir depo hacmi
    // uydurmak, olculmus gibi gorunen sahte bir asim uretirdi.
    skip('tank_capacity', 'missing_tank_capacity');
  } else {
    evaluatedRules.push('tank_capacity');
    const limit = capacity!.times(1 + T.capacityToleranceRatio);
    if (receiptLiters.greaterThan(limit)) {
      strong('receipt_exceeds_tank_capacity', 'quantity', {
        receiptLiters: round(receiptLiters, 2),
        tankCapacityLiters: round(capacity!, 2),
        toleranceRatio: T.capacityToleranceRatio,
      });
    }
  }

  // ---------------------------------------------------------------------
  // 2) Telematik yakit seviyesi artisi
  // ---------------------------------------------------------------------
  const window = selectFuelLevelWindow(input.fuelLevelSamples, input.receipt.enteredAt, input.now);
  let levelRiseAt: Date | null = null;

  if (!receiptLiters || receiptLiters.lessThanOrEqualTo(ZERO)) {
    skip('fuel_level_increase', 'missing_receipt_liters');
  } else if (!hasCapacity) {
    skip('fuel_level_increase', 'missing_tank_capacity');
  } else if (window.observedIncreasePct === null) {
    // Bir taraf bos: "artis yok" DEMIYORUZ, "olcemedik" diyoruz.
    skip('fuel_level_increase', 'no_usable_fuel_level_samples');
  } else {
    const expectedRisePct = receiptLiters.div(capacity!).times(HUNDRED);
    const resolutionFloor = T.sensorResolutionPct * T.minExpectedRiseResolutionSteps;

    if (expectedRisePct.lessThan(resolutionFloor)) {
      // 800 litrelik depoya 15 litre: beklenen artis sensorun adiminin
      // altinda. Burada "artis gormedik" demek yanlis alarmdir.
      skip('fuel_level_increase', 'expected_rise_below_sensor_resolution');
    } else {
      evaluatedRules.push('fuel_level_increase');
      const observedPct = window.observedIncreasePct;
      const observedLiters = observedPct.div(HUNDRED).times(capacity!);
      const difference = receiptLiters.minus(observedLiters).abs();
      const ratio = difference.div(receiptLiters);
      levelRiseAt = window.peak?.recordedAt ?? null;

      evidence.observedIncreasePct = round(observedPct, 1);
      evidence.observedIncreaseLiters = round(observedLiters, 1);
      evidence.absoluteDifferenceLiters = round(difference, 1);
      evidence.percentageDifference = round(ratio.times(HUNDRED), 1);
      evidence.levelRiseAt = levelRiseAt?.toISOString() ?? null;

      const noRise = observedPct.lessThan(T.sensorResolutionPct);
      const tolerated =
        difference.lessThanOrEqualTo(T.levelDiffAbsoluteToleranceLiters) ||
        ratio.lessThanOrEqualTo(T.levelDiffModerateRatio);

      if (noRise) {
        strong('no_fuel_level_increase', 'quantity', {
          receiptLiters: round(receiptLiters, 2),
          observedIncreasePct: round(observedPct, 1),
          sensorResolutionPct: T.sensorResolutionPct,
        });
      } else if (!tolerated && ratio.greaterThan(T.levelDiffStrongRatio)) {
        strong('fuel_level_increase_mismatch', 'quantity', {
          receiptLiters: round(receiptLiters, 2),
          observedIncreaseLiters: round(observedLiters, 1),
          absoluteDifferenceLiters: round(difference, 1),
          percentageDifference: round(ratio.times(HUNDRED), 1),
        });
      } else if (!tolerated) {
        moderate('fuel_level_increase_deviation', 'quantity', {
          receiptLiters: round(receiptLiters, 2),
          observedIncreaseLiters: round(observedLiters, 1),
          absoluteDifferenceLiters: round(difference, 1),
          percentageDifference: round(ratio.times(HUNDRED), 1),
        });
      }
    }
  }

  // ---------------------------------------------------------------------
  // 3) Fis zamani ile seviye artisinin zamani
  // ---------------------------------------------------------------------
  if (!levelRiseAt) {
    skip('receipt_time_vs_level_rise', 'no_measured_level_rise');
  } else {
    evaluatedRules.push('receipt_time_vs_level_rise');
    const diffMinutes = minutesBetween(levelRiseAt, input.receipt.enteredAt);
    evidence.receiptToRiseMinutes = Math.round(diffMinutes);
    if (diffMinutes > T.receiptToRiseModerateMinutes) {
      moderate('receipt_time_differs_from_level_rise', 'time', {
        receiptToRiseMinutes: Math.round(diffMinutes),
        thresholdMinutes: T.receiptToRiseModerateMinutes,
      });
    }
  }

  // ---------------------------------------------------------------------
  // 4) Arac fis aninda istasyonun civarinda miydi
  // ---------------------------------------------------------------------
  const intent = input.fuelingIntent;
  if (!intent) {
    // Fis icin yakit niyeti ZORUNLU DEGIL (Faz 5). Niyet yoksa istasyonun
    // koordinati da yok; fisteki istasyon ADINI koordinata cevirmek yeni bir
    // tahmin katmani olurdu ve bu fazin kapsami disinda.
    skip('vehicle_at_station', 'missing_station_location');
  } else {
    const windowMs = T.positionWindowMinutes * 60_000;
    const receiptMs = input.receipt.enteredAt.getTime();
    const nearby = input.positions.filter(
      (position) => Math.abs(position.recordedAt.getTime() - receiptMs) <= windowMs,
    );

    if (nearby.length === 0) {
      skip('vehicle_at_station', 'no_positions_near_receipt');
    } else {
      evaluatedRules.push('vehicle_at_station');
      let closest: { meters: number; at: Date } | null = null;
      for (const position of nearby) {
        const meters = haversineMeters(
          { latitude: Number(position.latitude), longitude: Number(position.longitude) },
          { latitude: Number(intent.stationLatitude), longitude: Number(intent.stationLongitude) },
        );
        if (!closest || meters < closest.meters) {
          closest = { meters, at: position.recordedAt };
        }
      }

      evidence.stationDistanceMeters = Math.round(closest!.meters);
      evidence.closestPositionAt = closest!.at.toISOString();

      // 500 m ile 2 km ARASI sinyal uretmiyor: park alani, GPS sapmasi ve
      // adres merkezi farki bu araligi tek basina aciklayabilir.
      if (closest!.meters > T.stationFarMeters) {
        strong('vehicle_far_from_station', 'location', {
          distanceMeters: Math.round(closest!.meters),
          thresholdMeters: T.stationFarMeters,
        });
      }
    }
  }

  // ---------------------------------------------------------------------
  // 5) Birim fiyat — YALNIZCA fis zamanina yakin snapshot ile
  // ---------------------------------------------------------------------
  const quoted = intent?.quotedPricePerLitre ?? null;
  const quotedAt = intent?.priceRetrievedAt ?? null;
  const receiptPrice = input.receipt.pricePerLiter;
  let hasFreshPriceSnapshot = false;

  if (!quoted || !quotedAt) {
    skip('unit_price', 'missing_price_snapshot');
  } else if (!receiptPrice || receiptPrice.lessThanOrEqualTo(ZERO)) {
    skip('unit_price', 'missing_receipt_price');
  } else if (minutesBetween(quotedAt, input.receipt.enteredAt) > T.priceSnapshotMaxAgeMinutes) {
    // GUNCEL fiyati gecmis bir fisle karsilastirmak sapma degil takvim
    // farkidir. Eski snapshot KULLANILMAZ.
    skip('unit_price', 'price_snapshot_too_old');
  } else {
    evaluatedRules.push('unit_price');
    hasFreshPriceSnapshot = true;
    const deviation = receiptPrice.minus(quoted).abs().div(quoted);
    evidence.priceDeviationRatio = round(deviation, 3);
    if (deviation.greaterThan(T.priceDeviationRatio)) {
      moderate('unit_price_differs_from_quote', 'price', {
        receiptPricePerLiter: round(receiptPrice, 4),
        quotedPricePerLitre: round(quoted, 4),
        deviationPercent: round(deviation.times(HUNDRED), 1),
      });
    }
  }

  // ---------------------------------------------------------------------
  // 6) Olasi tekrar gonderim
  // ---------------------------------------------------------------------
  if (input.siblingReceipts.length === 0) {
    skip('possible_duplicate', 'no_sibling_receipts');
  } else {
    evaluatedRules.push('possible_duplicate');
    const windowMs = T.duplicateWindowMinutes * 60_000;
    const twin = input.siblingReceipts.find((sibling) => {
      if (Math.abs(sibling.enteredAt.getTime() - input.receipt.enteredAt.getTime()) > windowMs) {
        return false;
      }
      const amount = input.receipt.totalCost;
      if (amount && sibling.totalCost && amount.greaterThan(ZERO)) {
        return sibling.totalCost.minus(amount).abs().div(amount).lessThanOrEqualTo(
          T.duplicateAmountRatio,
        );
      }
      const litres = receiptLiters;
      if (litres && sibling.liters && litres.greaterThan(ZERO)) {
        return sibling.liters.minus(litres).abs().div(litres).lessThanOrEqualTo(
          T.duplicateAmountRatio,
        );
      }
      return false;
    });

    if (twin) {
      evidence.duplicateCandidateId = twin.id;
      strong('possible_duplicate_receipt', 'duplicate', {
        otherReceiptId: twin.id,
        otherReceiptNumber: twin.receiptNumber,
        minutesApart: Math.round(minutesBetween(twin.enteredAt, input.receipt.enteredAt)),
      });
    }
  }

  // ---------------------------------------------------------------------
  // 7) Yakit turu uyumlulugu
  // ---------------------------------------------------------------------
  evaluatedRules.push('fuel_product_compatibility');
  if (input.receipt.compatibilityMismatch) {
    strong('fuel_product_not_compatible', 'product', {
      fuelProduct: input.receipt.fuelProduct,
    });
  }

  // ---------------------------------------------------------------------
  // 8) Mesafe / ortalama tuketim — TEK BASINA yuksek risk URETMEZ
  // ---------------------------------------------------------------------
  const distance = input.distanceSincePreviousReceiptKm;
  const avgConsumption = input.vehicle.avgConsumptionLPer100Km;

  if (!receiptLiters || receiptLiters.lessThanOrEqualTo(ZERO)) {
    skip('consumption_plausibility', 'missing_receipt_liters');
  } else if (!avgConsumption || avgConsumption.lessThanOrEqualTo(ZERO)) {
    skip('consumption_plausibility', 'missing_average_consumption');
  } else if (!distance) {
    skip('consumption_plausibility', 'missing_closed_trip_distance');
  } else if (distance.lessThan(T.consumptionMinDistanceKm)) {
    skip('consumption_plausibility', 'distance_too_short');
  } else {
    evaluatedRules.push('consumption_plausibility');
    const expected = distance.div(HUNDRED).times(avgConsumption);
    evidence.expectedLitersFromDistance = round(expected, 1);
    // YALNIZCA "beklenenden cok fazla" yonu: kismi dolum normaldir, az almak
    // bir kusur degildir.
    if (
      expected.greaterThan(ZERO) &&
      receiptLiters.minus(expected).div(expected).greaterThan(T.consumptionDeviationRatio)
    ) {
      moderate('consumption_out_of_range', 'consumption', {
        receiptLiters: round(receiptLiters, 2),
        expectedLiters: round(expected, 1),
        distanceKm: round(distance, 1),
        avgConsumptionLPer100Km: round(avgConsumption, 2),
      });
    }
  }

  // ---------------------------------------------------------------------
  // Sonuc
  // ---------------------------------------------------------------------
  const strongGroups = new Set(
    signals.filter((signal) => signal.severity === 'strong').map((signal) => signal.group),
  );
  const moderateGroups = new Set(
    signals.filter((signal) => signal.severity === 'moderate').map((signal) => signal.group),
  );

  const measuredPrimaryEvidence =
    evaluatedRules.includes('fuel_level_increase') || evaluatedRules.includes('vehicle_at_station');

  let riskLevel: FuelReconciliationRisk;
  if (strongGroups.size >= 1) {
    // Guclu sinyal, kanit eksigine ragmen gecerlidir: kapasiteyi asan bir
    // litre ya da uyumsuz yakit turu telematik gerektirmez.
    riskLevel = 'high_attention';
  } else if (!measuredPrimaryEvidence) {
    // Ne seviye ne konum olculebildi: "normal" demek, kontrol edilmis
    // izlenimi verirdi. Acikca veri yok denir.
    riskLevel = 'insufficient_data';
  } else if (moderateGroups.size >= 2) {
    riskLevel = 'high_attention';
  } else if (moderateGroups.size === 1) {
    riskLevel = 'review_required';
  } else {
    riskLevel = 'normal';
  }

  const missing = [...new Set(skippedRules.map((rule) => rule.reason))];

  return {
    riskLevel,
    riskScore: signals.reduce((total, signal) => total + signal.weight, 0),
    signals,
    dataQuality: {
      evaluatedRules,
      skippedRules,
      fuelLevelSamplesBefore: window.samplesBefore,
      fuelLevelSamplesAfter: window.samplesAfter,
      hasTankCapacity: hasCapacity,
      hasStationLocation: intent !== null,
      hasPositions: input.positions.length > 0,
      hasFreshPriceSnapshot,
      missing,
    },
    evidence,
    algorithmVersion: FUEL_RECONCILIATION_ALGORITHM_VERSION,
  };
}
