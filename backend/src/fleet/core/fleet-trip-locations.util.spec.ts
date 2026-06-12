import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FleetTelemetrySource } from '@prisma/client';
import {
  dedupeNormalizedLocationPoints,
  locationPointIdentityKey,
  normalizeFleetTripLocationPoints,
  parseFleetTripRecordedAt,
} from './fleet-trip-locations.util';

describe('fleet-trip-locations.util', () => {
  const now = new Date('2026-06-12T12:00:00.000Z');

  it('parses valid recordedAt timestamps', () => {
    const parsed = parseFleetTripRecordedAt('2026-06-12T11:59:00.000Z', now);
    assert.equal(parsed.toISOString(), '2026-06-12T11:59:00.000Z');
  });

  it('rejects timestamps too far in the future', () => {
    assert.throws(
      () => parseFleetTripRecordedAt('2026-06-12T12:10:00.000Z', now),
      /future/,
    );
  });

  it('normalizes location points with optional telemetry fields', () => {
    const normalized = normalizeFleetTripLocationPoints(
      [
        {
          recordedAt: '2026-06-12T11:58:00.000Z',
          lat: 52.52,
          lng: 13.405,
          speedKmh: 48.5,
          heading: 90,
          accuracyM: 12,
        },
      ],
      FleetTelemetrySource.phone,
      now,
    );

    assert.equal(normalized.length, 1);
    assert.equal(normalized[0]?.latitude, 52.52);
    assert.equal(normalized[0]?.speedKmh, 48.5);
    assert.equal(normalized[0]?.source, FleetTelemetrySource.phone);
  });

  it('deduplicates points by trip identity key', () => {
    const points = normalizeFleetTripLocationPoints(
      [
        {
          recordedAt: '2026-06-12T11:58:00.000Z',
          lat: 52.52,
          lng: 13.405,
        },
        {
          recordedAt: '2026-06-12T11:58:00.000Z',
          lat: 52.52,
          lng: 13.405,
        },
      ],
      FleetTelemetrySource.phone,
      now,
    );

    const deduped = dedupeNormalizedLocationPoints(points);
    assert.equal(deduped.length, 1);
    assert.equal(locationPointIdentityKey(deduped[0]!), '2026-06-12T11:58:00.000Z|52.5200000|13.4050000');
  });
});
