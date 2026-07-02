import { DAILY_DRIVING } from './constants';
import { isoWeekKey } from './time';
import { splitAtDailyRestBoundaries, sumDrivingSeconds } from './activity-utils';
import { DAILY_REST } from './constants';
import type { EvaluationRange, InfringementCandidate, TachoActivityLike } from './types';
import { filterActivitiesInRange } from './activity-utils';

type WeeklyExtensionTracker = Map<string, number>;

/**
 * Art. 6/1 — Daily driving time between daily rests.
 * ISO week extension counter (Mon 00:00 UTC) — LEGAL-REVIEW: simplified week boundary.
 */
export function evaluateDailyDrivingRules(
  activities: TachoActivityLike[],
  range: EvaluationRange,
): InfringementCandidate[] {
  const scoped = filterActivitiesInRange(activities, range);
  const periods = splitAtDailyRestBoundaries(scoped, DAILY_REST.REDUCED);
  const candidates: InfringementCandidate[] = [];
  const extensionsByWeek: WeeklyExtensionTracker = new Map();

  for (const period of periods) {
    const drivingS = sumDrivingSeconds(period);
    if (drivingS <= DAILY_DRIVING.STANDARD) {
      continue;
    }

    const periodStartMs = period[0]?.startedAtMs ?? range.fromMs;
    const weekKey = isoWeekKey(periodStartMs);

    if (drivingS > DAILY_DRIVING.EXTENDED) {
      candidates.push({
        type: 'daily_driving_exceeded',
        severity: 'critical',
        occurredAtMs: periodStartMs + DAILY_DRIVING.EXTENDED * 1000,
        evidence: {
          rule: 'daily-driving',
          article: 'Art. 6/1',
          calculatedValues: {
            drivingS,
            thresholdS: DAILY_DRIVING.EXTENDED,
            weekKey,
          },
        },
      });
      continue;
    }

    const usedExtensions = extensionsByWeek.get(weekKey) ?? 0;
    if (usedExtensions < DAILY_DRIVING.MAX_EXTENSIONS_PER_WEEK) {
      extensionsByWeek.set(weekKey, usedExtensions + 1);
      continue;
    }

    candidates.push({
      type: 'daily_driving_exceeded',
      severity: 'medium',
      occurredAtMs: periodStartMs + DAILY_DRIVING.STANDARD * 1000,
      evidence: {
        rule: 'daily-driving',
        article: 'Art. 6/1',
        calculatedValues: {
          drivingS,
          thresholdS: DAILY_DRIVING.STANDARD,
          weekKey,
          extensionCount: usedExtensions + 1,
        },
      },
    });
  }

  return candidates;
}
