import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildDriverFuelBreakdown, buildWeeklyFuelTrend } from './fleet-fuel-analytics.util';
import {
  aggregateEstimatedLiters,
  computeFuelBehaviorFactor,
  estimateTripLiters,
} from './fleet-fuel-estimation.util';

describe('fleet-fuel-estimation.util', () => {
  it('applies behavior factor from events per 100 km and idle ratio', () => {
    const calmTrip = computeFuelBehaviorFactor({
      distanceKm: 100,
      durationS: 3600,
      idleS: 100,
      eventCount: 0,
    });
    const harshTrip = computeFuelBehaviorFactor({
      distanceKm: 100,
      durationS: 3600,
      idleS: 600,
      eventCount: 10,
    });

    assert.ok(harshTrip > calmTrip);
    assert.equal(calmTrip, 1);
  });

  it('estimates trip liters from distance and average consumption', () => {
    const liters = estimateTripLiters(
      {
        distanceKm: 200,
        durationS: 7200,
        idleS: 200,
        eventCount: 2,
      },
      10,
    );

    assert.ok(liters > 20);
    assert.ok(liters < 25);
  });

  it('aggregates estimated liters across trips', () => {
    const summary = aggregateEstimatedLiters(
      [
        { distanceKm: 100, durationS: 3600, idleS: 0, eventCount: 0 },
        { distanceKm: 50, durationS: 1800, idleS: 0, eventCount: 0 },
      ],
      10,
    );

    assert.equal(summary.totalDistanceKm, 150);
    assert.equal(summary.totalEstimatedLiters, 15);
    assert.equal(summary.avgEstimatedLitersPer100Km, 10);
  });
});

describe('fleet-fuel-analytics.util', () => {
  it('builds weekly trend buckets for estimated and real consumption', () => {
    const trend = buildWeeklyFuelTrend(
      [
        {
          startEntryId: 'a',
          endEntryId: 'b',
          startAt: '2026-06-01T08:00:00.000Z',
          endAt: '2026-06-03T08:00:00.000Z',
          litersTotal: 40,
          costTotal: 80,
          distanceKm: 500,
          litersPer100Km: 8,
          distanceSource: 'odometer',
        },
      ],
      [
        {
          driverId: 'd1',
          startedAt: new Date('2026-06-02T08:00:00.000Z'),
          distanceKm: 120,
          estimatedLiters: 12,
          eventCount: 1,
        },
      ],
    );

    assert.equal(trend.length, 1);
    assert.equal(trend[0]?.realLiters, 40);
    assert.equal(trend[0]?.estimatedLiters, 12);
  });

  it('builds driver breakdown from trips and fuel entries', () => {
    const breakdown = buildDriverFuelBreakdown(
      [
        {
          driverId: 'd1',
          startedAt: new Date('2026-06-02T08:00:00.000Z'),
          distanceKm: 100,
          estimatedLiters: 10,
          eventCount: 2,
        },
        {
          driverId: 'd2',
          startedAt: new Date('2026-06-03T08:00:00.000Z'),
          distanceKm: 50,
          estimatedLiters: 6,
          eventCount: 0,
        },
      ],
      [
        {
          driverId: 'd1',
          enteredAt: new Date('2026-06-04T08:00:00.000Z'),
          liters: 45,
        },
      ],
    );

    assert.equal(breakdown.length, 2);
    assert.equal(breakdown[0]?.driverId, 'd1');
    assert.equal(breakdown[0]?.realLiters, 45);
    assert.equal(breakdown[0]?.estimatedLiters, 10);
  });
});
