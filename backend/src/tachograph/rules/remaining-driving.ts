import { BREAK, DAILY_DRIVING, DAILY_REST, WEEKLY_DRIVING } from './constants';
import { isoWeekKey, isoWeekStartMs } from './time';
import {
  clipActivitiesAt,
  filterActivitiesInRange,
  isDriving,
  isRest,
  sortActivities,
  splitAtDailyRestBoundaries,
  sumDrivingSeconds,
} from './activity-utils';
import { findLongestRestInWindow } from './daily-rest';
import type { EvaluationRange, TachoActivityLike, TachoWorkStateLike } from './types';

export type DriverCurrentStatus = 'driving' | 'rest' | 'work' | 'available';

export type DriverRemainingSnapshot = {
  todayDrivingS: number;
  todayRemainingDrivingS: number;
  todayContinuousDrivingS: number;
  nextMandatoryBreakInS: number;
  weekUsedS: number;
  weekLimitS: number;
  twoWeekUsedS: number;
  twoWeekLimitS: number;
  extensionsUsed: number;
  extensionsMax: number;
  reducedRestUsed: number;
  reducedRestMax: number;
  currentStatus: DriverCurrentStatus;
};

function mapWorkStateToStatus(state: TachoWorkStateLike): DriverCurrentStatus {
  if (state === 'driving') return 'driving';
  if (state === 'rest') return 'rest';
  if (state === 'work') return 'work';
  return 'available';
}

/** Mirrors Art. 7 break state machine — returns continuous driving seconds at evaluation time. */
export function computeContinuousDrivingSeconds(
  activities: TachoActivityLike[],
  atMs: number,
): number {
  const scoped = clipActivitiesAt(activities, atMs);
  const sorted = sortActivities(scoped);
  let continuousDrivingS = 0;
  let splitFirstSatisfied = false;

  const applyRest = (durationS: number): 'reset' | 'noop' => {
    if (durationS < BREAK.SPLIT_FIRST_MIN) {
      return 'noop';
    }
    if (durationS >= BREAK.FULL_BREAK) {
      splitFirstSatisfied = false;
      return 'reset';
    }
    if (!splitFirstSatisfied) {
      if (durationS >= BREAK.SPLIT_SECOND_MIN) {
        splitFirstSatisfied = false;
        return 'noop';
      }
      splitFirstSatisfied = true;
      return 'noop';
    }
    if (durationS >= BREAK.SPLIT_SECOND_MIN) {
      splitFirstSatisfied = false;
      return 'reset';
    }
    return 'noop';
  };

  for (const activity of sorted) {
    if (isDriving(activity.workState)) {
      continuousDrivingS += activity.durationS;
      continue;
    }
    if (isRest(activity.workState)) {
      const outcome = applyRest(activity.durationS);
      if (outcome === 'reset') {
        continuousDrivingS = 0;
      }
    }
  }

  return continuousDrivingS;
}

/** Counts weekly 9h→10h extensions consumed (same logic as daily-driving evaluator). */
export function countWeeklyDrivingExtensions(
  activities: TachoActivityLike[],
  weekKey: string,
): number {
  const weekStart = isoWeekStartMs(
    activities.find((a) => isoWeekKey(a.startedAtMs) === weekKey)?.startedAtMs ?? Date.now(),
  );
  const weekEnd = weekStart + 7 * 24 * 3600 * 1000;
  const range: EvaluationRange = { fromMs: weekStart, toMs: weekEnd };
  const scoped = filterActivitiesInRange(activities, range);
  const periods = splitAtDailyRestBoundaries(scoped, DAILY_REST.REDUCED);
  let used = 0;

  for (const period of periods) {
    const drivingS = sumDrivingSeconds(period);
    if (drivingS <= DAILY_DRIVING.STANDARD) {
      continue;
    }
    if (drivingS > DAILY_DRIVING.EXTENDED) {
      continue;
    }
    if (isoWeekKey(period[0]?.startedAtMs ?? weekStart) !== weekKey) {
      continue;
    }
    used += 1;
  }

  return Math.min(used, DAILY_DRIVING.MAX_EXTENSIONS_PER_WEEK);
}

function countReducedDailyRests(activities: TachoActivityLike[], range: EvaluationRange): number {
  const scoped = filterActivitiesInRange(activities, range);
  if (scoped.length === 0) {
    return 0;
  }

  const startMs = scoped[0]!.startedAtMs;
  const endMs = scoped[scoped.length - 1]!.endedAtMs;
  let reducedCount = 0;

  for (let cursor = startMs; cursor < endMs; cursor += DAILY_REST.WINDOW * 500) {
    const assessment = findLongestRestInWindow(scoped, cursor);
    if (assessment.usedReduced) {
      reducedCount += 1;
    }
  }

  return Math.min(reducedCount, DAILY_REST.MAX_REDUCED_BETWEEN_WEEKLY);
}

function drivingInIsoWeek(activities: TachoActivityLike[], weekKey: string, atMs: number): number {
  const clipped = clipActivitiesAt(activities, atMs);
  return sumDrivingSeconds(
    clipped.filter((activity) => isDriving(activity.workState) && isoWeekKey(activity.startedAtMs) === weekKey),
  );
}

function previousIsoWeekKey(atMs: number): string {
  const weekStart = isoWeekStartMs(atMs);
  return isoWeekKey(weekStart - 7 * 24 * 3600 * 1000);
}

function currentDailyPeriod(activities: TachoActivityLike[], atMs: number): TachoActivityLike[] {
  const clipped = clipActivitiesAt(activities, atMs);
  const periods = splitAtDailyRestBoundaries(clipped, DAILY_REST.REDUCED);
  return periods[periods.length - 1] ?? [];
}

function resolveCurrentStatus(activities: TachoActivityLike[], atMs: number): DriverCurrentStatus {
  const clipped = clipActivitiesAt(activities, atMs);
  const last = clipped[clipped.length - 1];
  if (!last) {
    return 'available';
  }
  return mapWorkStateToStatus(last.workState);
}

/**
 * Computes live remaining-driving counters by reusing 2A rule constants and activity helpers.
 */
export function computeDriverRemainingSnapshot(
  activities: TachoActivityLike[],
  atMs: number = Date.now(),
): DriverRemainingSnapshot {
  const clipped = clipActivitiesAt(activities, atMs);
  const weekKey = isoWeekKey(atMs);
  const prevWeekKey = previousIsoWeekKey(atMs);
  const weekStart = isoWeekStartMs(atMs);
  const twoWeekRange: EvaluationRange = {
    fromMs: weekStart - 7 * 24 * 3600 * 1000,
    toMs: atMs,
  };

  const todayPeriod = currentDailyPeriod(clipped, atMs);
  const todayDrivingS = sumDrivingSeconds(todayPeriod);
  const extensionsUsed = countWeeklyDrivingExtensions(clipped, weekKey);
  const extensionsRemaining = Math.max(0, DAILY_DRIVING.MAX_EXTENSIONS_PER_WEEK - extensionsUsed);
  const todayLimitS =
    extensionsRemaining > 0 ? DAILY_DRIVING.EXTENDED : DAILY_DRIVING.STANDARD;
  const todayRemainingDrivingS = Math.max(0, todayLimitS - todayDrivingS);

  const todayContinuousDrivingS = computeContinuousDrivingSeconds(clipped, atMs);
  const nextMandatoryBreakInS = Math.max(0, BREAK.MAX_CONTINUOUS_DRIVING - todayContinuousDrivingS);

  const weekUsedS = drivingInIsoWeek(clipped, weekKey, atMs);
  const twoWeekUsedS =
    drivingInIsoWeek(clipped, weekKey, atMs) + drivingInIsoWeek(clipped, prevWeekKey, atMs);

  const reducedRestUsed = countReducedDailyRests(clipped, twoWeekRange);

  return {
    todayDrivingS,
    todayRemainingDrivingS,
    todayContinuousDrivingS,
    nextMandatoryBreakInS,
    weekUsedS,
    weekLimitS: WEEKLY_DRIVING.STANDARD,
    twoWeekUsedS,
    twoWeekLimitS: WEEKLY_DRIVING.TWO_WEEK_STANDARD,
    extensionsUsed,
    extensionsMax: DAILY_DRIVING.MAX_EXTENSIONS_PER_WEEK,
    reducedRestUsed,
    reducedRestMax: DAILY_REST.MAX_REDUCED_BETWEEN_WEEKLY,
    currentStatus: resolveCurrentStatus(clipped, atMs),
  };
}
