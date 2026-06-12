import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeCurrentOdometerKm } from './fleet-odometer.util';

describe('fleet-odometer.util', () => {
  it('uses the latest correction as baseline and adds GPS km after it', () => {
    const result = computeCurrentOdometerKm(
      {
        initialOdometerKm: 10000,
        odometerCorrectedKm: 12000,
        odometerCorrectedAt: new Date('2026-06-01T08:00:00.000Z'),
      },
      [
        {
          startedAt: new Date('2026-05-20T08:00:00.000Z'),
          endedAt: new Date('2026-05-20T10:00:00.000Z'),
          distanceKm: 100,
        },
        {
          startedAt: new Date('2026-06-02T08:00:00.000Z'),
          endedAt: new Date('2026-06-02T10:00:00.000Z'),
          distanceKm: 250,
        },
      ],
    );

    assert.equal(result.currentOdometerKm, 12250);
    assert.equal(result.gpsAccumulatedKm, 250);
    assert.equal(result.baseline.source, 'correction');
  });

  it('falls back to initial odometer when no correction exists', () => {
    const result = computeCurrentOdometerKm(
      {
        initialOdometerKm: 5000,
        odometerCorrectedKm: null,
        odometerCorrectedAt: null,
      },
      [
        {
          startedAt: new Date('2026-06-02T08:00:00.000Z'),
          endedAt: new Date('2026-06-02T10:00:00.000Z'),
          distanceKm: 75,
        },
      ],
    );

    assert.equal(result.currentOdometerKm, 5075);
    assert.equal(result.baseline.source, 'initial');
  });
});
