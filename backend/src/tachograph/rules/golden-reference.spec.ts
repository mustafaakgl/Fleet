import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GOLDEN_SCENARIOS } from './demo-scenarios';
import { evaluateBreakRules } from './breaks';
import { evaluateDailyDrivingRules } from './daily-driving';
import { evaluateDailyRestRules } from './daily-rest';
import { evaluateWeeklyDrivingRules } from './weekly-driving';
import { evaluateWeeklyRestRules } from './weekly-rest';
import { evaluateCardEventRules } from './card-events';
import type { GoldenScenario } from './demo-scenarios';
import type { InfringementCandidate } from './types';
import { fullRange } from './test-helpers';

function runScenarioEvaluators(scenario: GoldenScenario): InfringementCandidate[] {
  const activities = scenario.activities.map((row) => ({
    ...row,
    driverId: scenario.driverId,
  }));
  const range = fullRange(activities);
  const merged: InfringementCandidate[] = [];

  for (const evaluator of scenario.evaluators) {
    if (evaluator === 'breaks') {
      merged.push(...evaluateBreakRules(activities, range));
    }
    if (evaluator === 'daily-driving') {
      merged.push(...evaluateDailyDrivingRules(activities, range));
    }
    if (evaluator === 'daily-rest') {
      merged.push(...evaluateDailyRestRules(activities, range));
    }
    if (evaluator === 'weekly-driving') {
      merged.push(...evaluateWeeklyDrivingRules(activities, range));
    }
    if (evaluator === 'weekly-rest') {
      merged.push(...evaluateWeeklyRestRules(activities, range));
    }
    if (evaluator === 'card-events') {
      merged.push(...evaluateCardEventRules([], scenario.driverId));
    }
  }

  return merged;
}

function countByType(candidates: Array<{ type: string }>, type: string): number {
  return candidates.filter((candidate) => candidate.type === type).length;
}

describe('golden-reference scenarios', () => {
  for (const scenario of GOLDEN_SCENARIOS) {
    it(`golden:${scenario.name}`, () => {
      const candidates = runScenarioEvaluators(scenario);

      if (scenario.expected.length === 0) {
        assert.equal(candidates.length, 0, `expected no infringements for ${scenario.name}`);
        return;
      }

      for (const expected of scenario.expected) {
        assert.equal(
          countByType(candidates, expected.type),
          expected.count,
          `${scenario.name} ${expected.type}`,
        );
      }
    });
  }

  it('golden_total_matches_seed_table', () => {
    const totals = new Map<string, number>();
    for (const scenario of GOLDEN_SCENARIOS) {
      const candidates = runScenarioEvaluators(scenario);
      for (const candidate of candidates) {
        totals.set(candidate.type, (totals.get(candidate.type) ?? 0) + 1);
      }
    }

    assert.equal(totals.get('daily_driving_exceeded') ?? 0, 1);
    assert.equal(totals.get('insufficient_break') ?? 0, 1);
    assert.equal(totals.get('exceeded_weekly_driving') ?? 0, 1);
  });
});
