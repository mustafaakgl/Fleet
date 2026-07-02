import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyCompensationRepayment,
  createCompensationDebt,
  isCompensationDebtUnpaid,
} from './compensation';
import { evaluateWeeklyRestRules } from './weekly-rest';
import { activity, chain, fullRange, hours } from './test-helpers';
import { WEEKLY_REST } from './constants';

describe('compensation', () => {
  it('art8_compensation_debt_unpaid_after_3_weeks', () => {
    const incurredAtMs = Date.parse('2026-01-01T00:00:00.000Z');
    const debt = createCompensationDebt(6 * 3600, incurredAtMs);
    const dueCheckMs = debt.dueByMs + 1;
    assert.equal(isCompensationDebtUnpaid(debt, dueCheckMs), true);

    const repaid = applyCompensationRepayment(debt, WEEKLY_REST.NORMAL, WEEKLY_REST.REDUCED);
    assert.ok(repaid.repaidSeconds >= debt.owedSeconds);
    assert.equal(isCompensationDebtUnpaid(repaid, dueCheckMs), false);
  });
});

describe('weekly-rest (Art. 8/6)', () => {
  it('art8_weekly_rest_45h_clean', () => {
    const activities = [activity('rest', '2026-06-01T00:00:00.000Z', hours(45))];
    const result = evaluateWeeklyRestRules(activities, fullRange(activities));
    assert.equal(result.length, 0);
  });

  it('art8_weekly_rest_under_24h_critical', () => {
    const activities = chain(
      activity('rest', '2026-06-01T00:00:00.000Z', hours(45)),
      activity('driving', '2026-06-03T00:00:00.000Z', hours(20)),
      activity('rest', '2026-06-03T20:00:00.000Z', hours(20)),
    );
    const result = evaluateWeeklyRestRules(activities, fullRange(activities));
    assert.ok(result.some((row) => row.severity === 'critical'));
  });
});
