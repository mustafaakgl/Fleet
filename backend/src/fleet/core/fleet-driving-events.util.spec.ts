import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectDrivingEvents } from './fleet-driving-events.util';
import { computeDriverScoreFromTrips, computeTripScore } from './fleet-driver-score.util';
import { analyzeTripPoints } from './fleet-trip-analysis.util';
import type { ProcessableTripPoint } from './fleet-trip-processing.util';

function point(
  iso: string,
  latitude: number,
  longitude: number,
  speedKmh: number | null,
): ProcessableTripPoint {
  return {
    recordedAt: new Date(iso),
    latitude,
    longitude,
    speedKmh,
    accuracyM: 10,
  };
}

describe('fleet-driving-events.util', () => {
  it('detects a speeding episode lasting at least 10 seconds', () => {
    const points = [
      point('2026-06-12T10:00:00.000Z', 52.52, 13.405, 125),
      point('2026-06-12T10:00:05.000Z', 52.521, 13.405, 130),
      point('2026-06-12T10:00:12.000Z', 52.522, 13.405, 128),
      point('2026-06-12T10:00:20.000Z', 52.523, 13.405, 90),
    ];

    const events = detectDrivingEvents(points);
    assert.equal(events.filter((event) => event.type === 'speeding').length, 1);
    assert.equal(events[0]?.value, 130);
  });

  it('detects harsh acceleration and harsh braking', () => {
    const points = [
      point('2026-06-12T10:00:00.000Z', 52.52, 13.405, 30),
      point('2026-06-12T10:00:01.000Z', 52.521, 13.405, 50),
      point('2026-06-12T10:00:02.000Z', 52.522, 13.405, 20),
    ];

    const events = detectDrivingEvents(points);
    assert.equal(events.some((event) => event.type === 'harsh_accel'), true);
    assert.equal(events.some((event) => event.type === 'harsh_brake'), true);
  });
});

describe('fleet-driver-score.util', () => {
  it('computes a trip score with penalties normalized per 100 km', () => {
    const startedAt = new Date('2026-06-12T10:00:00.000Z');
    const endedAt = new Date('2026-06-12T11:00:00.000Z');
    const points = [
      point('2026-06-12T10:00:00.000Z', 52.52, 13.405, 125),
      point('2026-06-12T10:00:12.000Z', 52.53, 13.405, 128),
      point('2026-06-12T10:30:00.000Z', 52.54, 13.405, 90),
    ];

    const analysis = analyzeTripPoints(points, startedAt, endedAt);
    const score = computeTripScore(analysis.metrics, analysis.events);

    assert.ok(score < 100);
    assert.ok(score >= 0);
  });

  it('aggregates driver score across multiple trips', () => {
    const score = computeDriverScoreFromTrips([
      {
        distanceKm: 50,
        durationS: 3600,
        idleS: 100,
        events: { speeding: 1, harsh_accel: 0, harsh_brake: 0 },
      },
      {
        distanceKm: 50,
        durationS: 3600,
        idleS: 100,
        events: { speeding: 0, harsh_accel: 1, harsh_brake: 1 },
      },
    ]);

    assert.ok(score < 100);
    assert.ok(score >= 0);
  });
});
