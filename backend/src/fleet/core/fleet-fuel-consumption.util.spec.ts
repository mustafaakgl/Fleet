import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeFuelConsumptionIntervals,
  computeWeightedAverageLitersPer100Km,
} from './fleet-fuel-consumption.util';

describe('fleet-fuel-consumption.util', () => {
  it('computes lt/100km between two full tank entries using odometer distance', () => {
    const intervals = computeFuelConsumptionIntervals(
      [
        {
          id: 'a',
          enteredAt: new Date('2026-06-01T08:00:00.000Z'),
          liters: 52,
          totalCost: 90,
          odometerKm: 10000,
          isFullTank: true,
        },
        {
          id: 'b',
          enteredAt: new Date('2026-06-05T08:00:00.000Z'),
          liters: 20,
          totalCost: 35,
          odometerKm: 10400,
          isFullTank: false,
        },
        {
          id: 'c',
          enteredAt: new Date('2026-06-10T08:00:00.000Z'),
          liters: 48,
          totalCost: 84,
          odometerKm: 10800,
          isFullTank: true,
        },
      ],
      [],
    );

    assert.equal(intervals.length, 1);
    assert.equal(intervals[0]?.distanceKm, 800);
    assert.equal(intervals[0]?.litersTotal, 68);
    assert.equal(intervals[0]?.litersPer100Km, 8.5);
    assert.equal(intervals[0]?.distanceSource, 'odometer');
  });

  it('falls back to GPS trip distance when odometer is missing', () => {
    const intervals = computeFuelConsumptionIntervals(
      [
        {
          id: 'a',
          enteredAt: new Date('2026-06-01T08:00:00.000Z'),
          liters: 50,
          totalCost: 90,
          odometerKm: null,
          isFullTank: true,
        },
        {
          id: 'b',
          enteredAt: new Date('2026-06-10T08:00:00.000Z'),
          liters: 45,
          totalCost: 84,
          odometerKm: null,
          isFullTank: true,
        },
      ],
      [
        {
          startedAt: new Date('2026-06-02T08:00:00.000Z'),
          endedAt: new Date('2026-06-02T10:00:00.000Z'),
          distanceKm: 120,
        },
        {
          startedAt: new Date('2026-06-05T08:00:00.000Z'),
          endedAt: new Date('2026-06-05T11:00:00.000Z'),
          distanceKm: 80,
        },
      ],
    );

    assert.equal(intervals.length, 1);
    assert.equal(intervals[0]?.distanceKm, 200);
    assert.equal(intervals[0]?.litersPer100Km, 22.5);
    assert.equal(intervals[0]?.distanceSource, 'gps');
  });

  it('computes a weighted average across intervals', () => {
    const intervals = computeFuelConsumptionIntervals(
      [
        {
          id: 'a',
          enteredAt: new Date('2026-06-01T08:00:00.000Z'),
          liters: 50,
          totalCost: 90,
          odometerKm: 1000,
          isFullTank: true,
        },
        {
          id: 'b',
          enteredAt: new Date('2026-06-05T08:00:00.000Z'),
          liters: 40,
          totalCost: 72,
          odometerKm: 1500,
          isFullTank: true,
        },
        {
          id: 'c',
          enteredAt: new Date('2026-06-10T08:00:00.000Z'),
          liters: 50,
          totalCost: 90,
          odometerKm: 2000,
          isFullTank: true,
        },
      ],
      [],
    );

    const average = computeWeightedAverageLitersPer100Km(intervals);
    assert.equal(average, 9);
  });
});
