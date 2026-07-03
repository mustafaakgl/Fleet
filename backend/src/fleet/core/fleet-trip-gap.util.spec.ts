import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findLargestTripDataGap } from './fleet-trip-gap.util';

describe('fleet-trip-gap.util', () => {
  it('returns null when there are fewer than two points', () => {
    assert.equal(findLargestTripDataGap([{ recordedAt: new Date('2026-06-12T10:00:00.000Z') }]), null);
  });

  it('returns the largest gap window', () => {
    const result = findLargestTripDataGap([
      { recordedAt: new Date('2026-06-12T10:00:00.000Z') },
      { recordedAt: new Date('2026-06-12T10:03:00.000Z') },
      { recordedAt: new Date('2026-06-12T10:14:00.000Z') },
      { recordedAt: new Date('2026-06-12T10:15:00.000Z') },
    ]);

    assert.ok(result);
    assert.equal(result?.startedAt.toISOString(), '2026-06-12T10:03:00.000Z');
    assert.equal(result?.endedAt.toISOString(), '2026-06-12T10:14:00.000Z');
    assert.equal(result?.durationS, 660);
  });
});