import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateWeeklyDrivingRules } from './weekly-driving';
import { activity, chain, fullRange, hours, minutes } from './test-helpers';

describe('weekly-driving (Art. 6/2-3)', () => {
  it('art6_weekly_56h00s_clean', () => {
    const activities = [activity('driving', '2026-06-09T06:00:00.000Z', hours(56))];
    const result = evaluateWeeklyDrivingRules(activities, fullRange(activities));
    assert.equal(result.filter((row) => row.type === 'exceeded_weekly_driving').length, 0);
  });

  it('art6_weekly_56h01s_infringement', () => {
    const activities = [activity('driving', '2026-06-09T06:00:00.000Z', hours(56) + minutes(1))];
    const result = evaluateWeeklyDrivingRules(activities, fullRange(activities));
    assert.equal(result[0]?.type, 'exceeded_weekly_driving');
    assert.equal(result[0]?.severity, 'medium');
  });

  it('art6_weekly_over_60h_critical', () => {
    const activities = [activity('driving', '2026-06-09T06:00:00.000Z', hours(60) + minutes(1))];
    const result = evaluateWeeklyDrivingRules(activities, fullRange(activities));
    assert.equal(result[0]?.severity, 'critical');
  });

  it('art6_two_week_90h_boundary', () => {
    const activities = chain(
      activity('driving', '2026-06-02T06:00:00.000Z', hours(45)),
      activity('rest', '2026-06-02T21:00:00.000Z', hours(30)),
      activity('driving', '2026-06-09T06:00:00.000Z', hours(45)),
    );
    const result = evaluateWeeklyDrivingRules(activities, fullRange(activities));
    assert.equal(result.filter((row) => row.type === 'exceeded_two_week_driving').length, 0);
  });

  it('art6_iso_week_transition_counts_in_week', () => {
    const activities = chain(
      activity('driving', '2025-12-29T06:00:00.000Z', hours(30)),
      activity('rest', '2025-12-30T12:00:00.000Z', hours(10)),
      activity('driving', '2026-01-01T06:00:00.000Z', hours(27)),
    );
    const result = evaluateWeeklyDrivingRules(activities, fullRange(activities));
    assert.ok(result.some((row) => row.type === 'exceeded_weekly_driving'));
  });
});
