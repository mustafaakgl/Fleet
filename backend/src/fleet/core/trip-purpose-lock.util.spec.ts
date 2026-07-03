import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatTripPurposeLockAt, getTripPurposeLockAt, isTripPurposeLocked } from './trip-purpose-lock.util';

describe('trip-purpose-lock.util', () => {
  it('keeps the trip unlocked until the 7 day window passes', () => {
    const endedAt = new Date('2026-06-01T12:00:00.000Z');
    const lockAt = getTripPurposeLockAt(endedAt);

    assert.equal(lockAt.toISOString(), '2026-06-08T12:00:00.000Z');
    assert.equal(formatTripPurposeLockAt(endedAt).toISOString(), '2026-06-08T12:00:00.000Z');
    assert.equal(isTripPurposeLocked(endedAt, new Date('2026-06-08T11:59:59.000Z')), false);
    assert.equal(isTripPurposeLocked(endedAt, new Date('2026-06-08T12:00:01.000Z')), true);
  });
});
