import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deriveTripOdometerRange } from './fleet-trip-odometer.util';

describe('fleet-trip-odometer.util', () => {
  it('returns null when one of the snapshots is missing', () => {
    assert.deepEqual(deriveTripOdometerRange(null, null), {
      odoStartKm: null,
      odoEndKm: null,
    });
  });

  it('returns null when snapshots are inverted', () => {
    assert.deepEqual(
      deriveTripOdometerRange({ odometerKm: 1200 }, { odometerKm: 1100 }),
      {
        odoStartKm: null,
        odoEndKm: null,
      },
    );
  });

  it('returns a rounded odometer range when both snapshots are present', () => {
    assert.deepEqual(
      deriveTripOdometerRange({ odometerKm: 1100.1234 }, { odometerKm: 1122.9876 }),
      {
        odoStartKm: 1100.123,
        odoEndKm: 1122.988,
      },
    );
  });
});