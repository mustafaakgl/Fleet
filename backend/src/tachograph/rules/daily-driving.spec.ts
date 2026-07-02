import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateDailyDrivingRules } from './daily-driving';
import { activity, chain, fullRange, hours, minutes } from './test-helpers';

describe('daily-driving (Art. 6/1)', () => {
  it('art6_exactly_9h_clean', () => {
    const activities = [activity('driving', '2026-06-01T08:00:00.000Z', hours(9))];
    const result = evaluateDailyDrivingRules(activities, fullRange(activities));
    assert.equal(result.length, 0);
  });

  it('art6_first_extension_to_10h_clean', () => {
    const activities = [activity('driving', '2026-06-01T08:00:00.000Z', hours(10))];
    const result = evaluateDailyDrivingRules(activities, fullRange(activities));
    assert.equal(result.length, 0);
  });

  it('art6_third_extension_is_infringement', () => {
    const activities = chain(
      activity('driving', '2026-06-02T06:00:00.000Z', hours(9) + minutes(30)),
      activity('rest', '2026-06-02T15:30:00.000Z', hours(11)),
      activity('driving', '2026-06-03T06:00:00.000Z', hours(9) + minutes(30)),
      activity('rest', '2026-06-03T15:30:00.000Z', hours(11)),
      activity('driving', '2026-06-04T06:00:00.000Z', hours(9) + minutes(1)),
    );
    const result = evaluateDailyDrivingRules(activities, fullRange(activities));
    assert.equal(result.length, 1);
    assert.equal(result[0]?.type, 'daily_driving_exceeded');
    assert.equal(result[0]?.severity, 'medium');
  });

  it('art6_over_10h_is_critical', () => {
    const activities = [activity('driving', '2026-06-01T08:00:00.000Z', hours(10) + minutes(1))];
    const result = evaluateDailyDrivingRules(activities, fullRange(activities));
    assert.equal(result[0]?.severity, 'critical');
  });
});
