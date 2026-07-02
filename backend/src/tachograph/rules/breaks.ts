import { BREAK } from './constants';
import { addSecondsMs } from './time';
import type { EvaluationRange, InfringementCandidate, TachoActivityLike } from './types';
import { filterActivitiesInRange, isDriving, isRest, sortActivities } from './activity-utils';

type SplitBreakState = {
  firstPartSatisfied: boolean;
};

function resetSplitState(): SplitBreakState {
  return { firstPartSatisfied: false };
}

function applyRestBlock(durationS: number, split: SplitBreakState): 'full' | 'split_complete' | 'partial' | 'invalid_order' | 'ignored' {
  if (durationS < BREAK.SPLIT_FIRST_MIN) {
    return 'ignored';
  }

  if (durationS >= BREAK.FULL_BREAK) {
    return 'full';
  }

  if (!split.firstPartSatisfied) {
    if (durationS >= BREAK.SPLIT_SECOND_MIN) {
      // 30+15 order: a ≥30 block before the mandatory ≥15 first block is invalid.
      return 'invalid_order';
    }
    split.firstPartSatisfied = true;
    return 'partial';
  }

  if (durationS >= BREAK.SPLIT_SECOND_MIN) {
    split.firstPartSatisfied = false;
    return 'split_complete';
  }

  return 'partial';
}

/**
 * Art. 7 — Breaks after 4.5h continuous driving.
 * Valid break: ≥45min uninterrupted rest OR split ≥15min then ≥30min (not 30+15).
 */
export function evaluateBreakRules(
  activities: TachoActivityLike[],
  range: EvaluationRange,
): InfringementCandidate[] {
  const scoped = filterActivitiesInRange(activities, range);
  const sorted = sortActivities(scoped);
  const candidates: InfringementCandidate[] = [];

  let continuousDrivingS = 0;
  let split = resetSplitState();
  let drivingBlockStartedAtMs = sorted[0]?.startedAtMs ?? range.fromMs;
  let drivingActivityIds: string[] = [];

  const emitIfExceeded = (atMs: number, overrunS: number, activityIds: string[]) => {
    if (overrunS <= 0) {
      return;
    }
    candidates.push({
      type: 'insufficient_break',
      severity: overrunS >= BREAK.OVERRUN_CRITICAL ? 'critical' : 'medium',
      occurredAtMs: atMs,
      evidence: {
        rule: 'breaks',
        article: 'Art. 7',
        activityIds,
        calculatedValues: {
          continuousDrivingS,
          overrunS,
          thresholdS: BREAK.MAX_CONTINUOUS_DRIVING,
        },
      },
    });
  };

  for (const activity of sorted) {
    if (isDriving(activity.workState)) {
      const activityId = activity.id ?? `${activity.startedAtMs}`;

      if (continuousDrivingS === 0) {
        drivingBlockStartedAtMs = activity.startedAtMs;
        drivingActivityIds = [activityId];
      } else {
        drivingActivityIds.push(activityId);
      }

      const before = continuousDrivingS;
      continuousDrivingS += activity.durationS;

      if (before < BREAK.MAX_CONTINUOUS_DRIVING && continuousDrivingS > BREAK.MAX_CONTINUOUS_DRIVING) {
        const overrunS = continuousDrivingS - BREAK.MAX_CONTINUOUS_DRIVING;
        const exceedAtMs = addSecondsMs(
          drivingBlockStartedAtMs,
          BREAK.MAX_CONTINUOUS_DRIVING - before,
        );
        emitIfExceeded(exceedAtMs, overrunS, drivingActivityIds);
      } else if (before >= BREAK.MAX_CONTINUOUS_DRIVING) {
        emitIfExceeded(activity.startedAtMs, activity.durationS, [activityId]);
      }
      continue;
    }

    if (!isRest(activity.workState)) {
      continue;
    }

    const outcome = applyRestBlock(activity.durationS, split);
    if (outcome === 'full' || outcome === 'split_complete') {
      continuousDrivingS = 0;
      drivingActivityIds = [];
      split = resetSplitState();
      continue;
    }

    if (outcome === 'invalid_order') {
      split = resetSplitState();
    }
  }

  return candidates;
}
