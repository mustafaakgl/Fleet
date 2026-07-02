import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateDailyRestRules } from './daily-rest';
import { activity, fullRange, hours } from './test-helpers';

describe('daily-rest (Art. 8/1-2)', () => {
  it('art8_11h_rest_clean', () => {
    const activities = [activity('rest', '2026-06-01T20:00:00.000Z', hours(11))];
    const result = evaluateDailyRestRules(activities, fullRange(activities));
    assert.equal(result.length, 0);
  });

  it('art8_reduced_9h_clean_within_allowance', () => {
    const activities = [activity('rest', '2026-06-01T20:00:00.000Z', hours(9))];
    const result = evaluateDailyRestRules(activities, fullRange(activities), {
      reducedDailyRestCount: 2,
    });
    assert.equal(result.length, 0);
  });

  it('art8_fourth_reduced_rest_is_infringement', () => {
    const activities = [activity('rest', '2026-06-01T20:00:00.000Z', hours(9) + 1)];
    const result = evaluateDailyRestRules(activities, fullRange(activities), {
      reducedDailyRestCount: 3,
    });
    assert.equal(result.length, 1);
    assert.equal(result[0]?.type, 'insufficient_daily_rest');
    assert.equal(result[0]?.severity, 'medium');
  });

  it('art8_under_9h_rest_is_critical', () => {
    const activities = [activity('rest', '2026-06-01T20:00:00.000Z', hours(8))];
    const result = evaluateDailyRestRules(activities, fullRange(activities));
    assert.equal(result[0]?.severity, 'critical');
  });
});
