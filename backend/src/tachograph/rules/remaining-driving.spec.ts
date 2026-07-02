import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mapActivitiesToLike } from '../tachograph-rules.runner';
import { computeDriverRemainingSnapshot } from './remaining-driving';
import { BREAK, DAILY_DRIVING } from './constants';

const AT_MS = new Date('2026-06-15T15:00:00Z').getTime();

function act(
  id: string,
  workState: 'driving' | 'rest' | 'work' | 'available',
  startedAt: string,
  durationS: number,
) {
  const startedAtMs = new Date(startedAt).getTime();
  return {
    id,
    driverId: 'driver-1',
    startedAt: new Date(startedAtMs),
    endedAt: new Date(startedAtMs + durationS * 1000),
    durationS,
    workState,
  };
}

describe('computeDriverRemainingSnapshot', () => {
  it('matches rule-engine constants for daily remaining and break counters', () => {
    const rows = [
      act('1', 'driving', '2026-06-15T06:00:00Z', 8 * 3600 + 45 * 60),
    ];
    const mapped = mapActivitiesToLike(rows);
    const snapshot = computeDriverRemainingSnapshot(mapped, AT_MS);

    assert.equal(snapshot.todayDrivingS, 8 * 3600 + 45 * 60);
    assert.equal(snapshot.todayRemainingDrivingS, DAILY_DRIVING.EXTENDED - (8 * 3600 + 45 * 60));
    assert.equal(snapshot.todayContinuousDrivingS, 8 * 3600 + 45 * 60);
    assert.equal(snapshot.nextMandatoryBreakInS, 0);
    assert.equal(snapshot.extensionsMax, DAILY_DRIVING.MAX_EXTENSIONS_PER_WEEK);
    assert.equal(snapshot.currentStatus, 'driving');
  });

  it('resets continuous driving after a valid 45-minute break', () => {
    const rows = [
      act('1', 'driving', '2026-06-15T06:00:00Z', 4 * 3600),
      act('2', 'rest', '2026-06-15T10:00:00Z', 45 * 60),
      act('3', 'driving', '2026-06-15T10:45:00Z', 2 * 3600),
    ];
    const mapped = mapActivitiesToLike(rows);
    const snapshot = computeDriverRemainingSnapshot(mapped, AT_MS);

    assert.equal(snapshot.todayContinuousDrivingS, 2 * 3600);
    assert.equal(snapshot.nextMandatoryBreakInS, BREAK.MAX_CONTINUOUS_DRIVING - 2 * 3600);
  });
});

describe('remaining endpoint rule reuse', () => {
  it('produces the same snapshot as direct rules helper for mock activities', () => {
    const rows = [
      act('1', 'driving', '2026-06-15T06:00:00Z', 3 * 3600),
      act('2', 'rest', '2026-06-15T09:00:00Z', 11 * 3600),
      act('3', 'driving', '2026-06-15T20:00:00Z', 1 * 3600),
    ];
    const mapped = mapActivitiesToLike(rows);
    const direct = computeDriverRemainingSnapshot(mapped, AT_MS);
    const viaRunner = computeDriverRemainingSnapshot(mapActivitiesToLike(rows), AT_MS);
    assert.deepEqual(viaRunner, direct);
  });
});
