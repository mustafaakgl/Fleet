import { WEEKLY_DRIVING } from './constants';
import { isoWeekKey, isoWeekStartMs } from './time';
import { sortActivities, sumDrivingSeconds, isDriving } from './activity-utils';
import type { EvaluationRange, InfringementCandidate, TachoActivityLike } from './types';
import { filterActivitiesInRange } from './activity-utils';

function drivingByIsoWeek(activities: TachoActivityLike[]): Map<string, { drivingS: number; weekStartMs: number }> {
  const totals = new Map<string, { drivingS: number; weekStartMs: number }>();
  const sorted = sortActivities(activities);

  for (const activity of sorted) {
    if (!isDriving(activity.workState)) {
      continue;
    }
    const key = isoWeekKey(activity.startedAtMs);
    const existing = totals.get(key);
    if (existing) {
      existing.drivingS += activity.durationS;
      continue;
    }
    totals.set(key, {
      drivingS: activity.durationS,
      weekStartMs: isoWeekStartMs(activity.startedAtMs),
    });
  }

  return totals;
}

/**
 * Art. 6/2-3 — Weekly and fortnightly driving limits (ISO week, Mon 00:00 UTC).
 */
export function evaluateWeeklyDrivingRules(
  activities: TachoActivityLike[],
  range: EvaluationRange,
): InfringementCandidate[] {
  const scoped = filterActivitiesInRange(activities, range);
  const weekly = drivingByIsoWeek(scoped);
  const candidates: InfringementCandidate[] = [];

  for (const [weekKey, entry] of weekly.entries()) {
    const { drivingS, weekStartMs } = entry;
    if (drivingS > WEEKLY_DRIVING.STANDARD) {
      candidates.push({
        type: 'exceeded_weekly_driving',
        severity: drivingS > WEEKLY_DRIVING.MEDIUM_CAP ? 'critical' : 'medium',
        occurredAtMs: weekStartMs,
        evidence: {
          rule: 'weekly-driving',
          article: 'Art. 6/2',
          calculatedValues: {
            weekKey,
            drivingS,
            thresholdS: WEEKLY_DRIVING.STANDARD,
          },
        },
      });
    }
  }

  const weekKeys = Array.from(weekly.keys()).sort();
  for (let i = 1; i < weekKeys.length; i += 1) {
    const prev = weekKeys[i - 1]!;
    const curr = weekKeys[i]!;
    const total = (weekly.get(prev)?.drivingS ?? 0) + (weekly.get(curr)?.drivingS ?? 0);
    if (total > WEEKLY_DRIVING.TWO_WEEK_STANDARD) {
      const weekStart = weekly.get(curr)!.weekStartMs;
      candidates.push({
        type: 'exceeded_two_week_driving',
        severity: total > WEEKLY_DRIVING.TWO_WEEK_CRITICAL ? 'critical' : 'medium',
        occurredAtMs: weekStart,
        evidence: {
          rule: 'weekly-driving',
          article: 'Art. 6/3',
          calculatedValues: {
            weekKey: curr,
            previousWeekKey: prev,
            drivingS: total,
            thresholdS: WEEKLY_DRIVING.TWO_WEEK_STANDARD,
          },
        },
      });
    }
  }

  return candidates;
}

/** @internal test helper */
export function totalDrivingSeconds(activities: TachoActivityLike[]): number {
  return sumDrivingSeconds(activities);
}
