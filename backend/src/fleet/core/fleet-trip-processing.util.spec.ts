import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FLEET_TRIP_PROCESSING_CONFIG } from './fleet-trip-processing.config';
import {
  computeTripMetrics,
  filterPointsForProcessing,
  haversineDistanceKm,
  type ProcessableTripPoint,
} from './fleet-trip-processing.util';

function point(
  iso: string,
  latitude: number,
  longitude: number,
  overrides: Partial<ProcessableTripPoint> = {},
): ProcessableTripPoint {
  return {
    recordedAt: new Date(iso),
    latitude,
    longitude,
    speedKmh: null,
    accuracyM: null,
    ...overrides,
  };
}

describe('fleet-trip-processing.util', () => {
  it('filters inaccurate GPS points before processing', () => {
    const filtered = filterPointsForProcessing(
      [
        point('2026-06-12T10:00:00.000Z', 52.52, 13.405, { accuracyM: 12 }),
        point('2026-06-12T10:00:30.000Z', 52.53, 13.405, { accuracyM: 80 }),
      ],
      FLEET_TRIP_PROCESSING_CONFIG.maxAccuracyM,
    );

    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.latitude, 52.52);
  });

  it('sums haversine distance for realistic movement', () => {
    const startedAt = new Date('2026-06-12T10:00:00.000Z');
    const segmentKm = haversineDistanceKm(52.52, 13.405, 52.53, 13.405);

    const metrics = computeTripMetrics(
      [
        point('2026-06-12T10:00:00.000Z', 52.52, 13.405),
        point('2026-06-12T10:04:00.000Z', 52.53, 13.405),
      ],
      startedAt,
      new Date('2026-06-12T10:04:30.000Z'),
    );

    assert.ok(Math.abs(metrics.distanceKm - segmentKm) < 0.01);
    assert.equal(metrics.durationS, 270);
    assert.equal(metrics.hasDataGap, false);
  });

  it('skips impossible GPS jumps when computing distance', () => {
    const metrics = computeTripMetrics(
      [
        point('2026-06-12T10:00:00.000Z', 52.52, 13.405),
        point('2026-06-12T10:00:01.000Z', 53.52, 13.405),
      ],
      new Date('2026-06-12T10:00:00.000Z'),
      new Date('2026-06-12T10:01:00.000Z'),
    );

    assert.equal(metrics.distanceKm, 0);
  });

  it('accumulates idle time when speed stays below threshold', () => {
    const metrics = computeTripMetrics(
      [
        point('2026-06-12T10:00:00.000Z', 52.52, 13.405, { speedKmh: 0 }),
        point('2026-06-12T10:02:00.000Z', 52.52001, 13.405, { speedKmh: 0 }),
        point('2026-06-12T10:05:00.000Z', 52.52002, 13.405, { speedKmh: 0 }),
      ],
      new Date('2026-06-12T10:00:00.000Z'),
      new Date('2026-06-12T10:05:00.000Z'),
    );

    assert.equal(metrics.idleS, 300);
  });

  it('marks data gaps between accepted points', () => {
    const metrics = computeTripMetrics(
      [
        point('2026-06-12T10:00:00.000Z', 52.52, 13.405),
        point('2026-06-12T10:08:00.000Z', 52.53, 13.405),
      ],
      new Date('2026-06-12T10:00:00.000Z'),
      new Date('2026-06-12T10:10:00.000Z'),
    );

    assert.equal(metrics.hasDataGap, true);
  });
});
