import { evaluateBreakRules } from './breaks';
import { evaluateCardEventRules } from './card-events';
import { evaluateDailyDrivingRules } from './daily-driving';
import { evaluateDailyRestRules } from './daily-rest';
import { evaluateWeeklyDrivingRules } from './weekly-driving';
import { evaluateWeeklyRestRules } from './weekly-rest';
import type {
  CardEventLike,
  EvaluationRange,
  InfringementCandidate,
  ReducedRestContext,
  TachoActivityLike,
} from './types';

export type EvaluateRulesOptions = {
  cardEvents?: CardEventLike[];
  reducedRestContext?: ReducedRestContext;
  driverId?: string;
};

function dedupeCandidates(candidates: InfringementCandidate[]): InfringementCandidate[] {
  const seen = new Set<string>();
  const result: InfringementCandidate[] = [];

  for (const candidate of candidates) {
    const key = `${candidate.driverId ?? 'none'}|${candidate.type}|${candidate.occurredAtMs}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(candidate);
  }

  return result;
}

/** Run all 561/2006 rule evaluators for an activity set and UTC evaluation window. */
export function evaluateTachographRules(
  activities: TachoActivityLike[],
  range: EvaluationRange,
  options: EvaluateRulesOptions = {},
): InfringementCandidate[] {
  const withDriver = options.driverId
    ? activities.map((activity) => ({ ...activity, driverId: activity.driverId ?? options.driverId }))
    : activities;

  const merged: InfringementCandidate[] = [
    ...evaluateBreakRules(withDriver, range),
    ...evaluateDailyDrivingRules(withDriver, range),
    ...evaluateDailyRestRules(withDriver, range, options.reducedRestContext),
    ...evaluateWeeklyDrivingRules(withDriver, range),
    ...evaluateWeeklyRestRules(withDriver, range),
    ...evaluateCardEventRules(options.cardEvents ?? [], options.driverId),
  ];

  return dedupeCandidates(
    merged.map((candidate) => ({
      ...candidate,
      driverId: candidate.driverId ?? options.driverId,
    })),
  );
}

export {
  evaluateBreakRules,
  evaluateDailyDrivingRules,
  evaluateDailyRestRules,
  evaluateWeeklyDrivingRules,
  evaluateWeeklyRestRules,
  evaluateCardEventRules,
};
