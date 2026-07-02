import { DAILY_REST } from './constants';
import { addMs } from './time';
import { buildTimelineSegments } from './activity-utils';
import type { EvaluationRange, InfringementCandidate, ReducedRestContext, TachoActivityLike } from './types';
import { filterActivitiesInRange } from './activity-utils';

export type DailyRestAssessment = {
  longestRestS: number;
  windowStartMs: number;
  windowEndMs: number;
  usedReduced: boolean;
};

/**
 * Art. 8/1-2 — Daily rest in a rolling 24h window.
 * LEGAL-REVIEW: split daily rest (3h+9h) is out of scope — see TODO in weekly-rest integration.
 */
export function findLongestRestInWindow(
  activities: TachoActivityLike[],
  windowStartMs: number,
): DailyRestAssessment {
  const windowEndMs = addMs(windowStartMs, DAILY_REST.WINDOW * 1000);
  const segments = buildTimelineSegments(activities);
  let longestRestS = 0;

  for (const segment of segments) {
    if (segment.kind !== 'rest') {
      continue;
    }
    if (segment.endedAtMs <= windowStartMs || segment.startedAtMs >= windowEndMs) {
      continue;
    }

    const overlapStart = Math.max(segment.startedAtMs, windowStartMs);
    const overlapEnd = Math.min(segment.endedAtMs, windowEndMs);
    const overlapS = Math.max(0, Math.floor((overlapEnd - overlapStart) / 1000));
    longestRestS = Math.max(longestRestS, overlapS);
  }

  return {
    longestRestS,
    windowStartMs,
    windowEndMs,
    usedReduced: longestRestS >= DAILY_REST.REDUCED && longestRestS < DAILY_REST.NORMAL,
  };
}

export function evaluateDailyRestRules(
  activities: TachoActivityLike[],
  range: EvaluationRange,
  context: ReducedRestContext = { reducedDailyRestCount: 0 },
): InfringementCandidate[] {
  const scoped = filterActivitiesInRange(activities, range);
  if (scoped.length === 0) {
    return [];
  }

  const candidates: InfringementCandidate[] = [];
  const startMs = scoped[0]!.startedAtMs;
  const endMs = scoped[scoped.length - 1]!.endedAtMs;
  let reducedCount = context.reducedDailyRestCount;

  for (let cursor = startMs; cursor < endMs; cursor += DAILY_REST.WINDOW * 500) {
    const assessment = findLongestRestInWindow(scoped, cursor);
    const { longestRestS } = assessment;

    if (longestRestS >= DAILY_REST.NORMAL) {
      continue;
    }

    if (longestRestS >= DAILY_REST.REDUCED) {
      reducedCount += 1;
      if (reducedCount > DAILY_REST.MAX_REDUCED_BETWEEN_WEEKLY) {
        candidates.push({
          type: 'insufficient_daily_rest',
          severity: 'medium',
          occurredAtMs: assessment.windowEndMs,
          evidence: {
            rule: 'daily-rest',
            article: 'Art. 8/2',
            calculatedValues: {
              longestRestS,
              reducedCount,
              maxReduced: DAILY_REST.MAX_REDUCED_BETWEEN_WEEKLY,
              windowStartMs: assessment.windowStartMs,
            },
          },
        });
      }
      continue;
    }

    if (longestRestS > 0 && longestRestS < DAILY_REST.REDUCED) {
      candidates.push({
        type: 'insufficient_daily_rest',
        severity: 'critical',
        occurredAtMs: assessment.windowEndMs,
        evidence: {
          rule: 'daily-rest',
          article: 'Art. 8/1',
          calculatedValues: {
            longestRestS,
            minimumReducedS: DAILY_REST.REDUCED,
            windowStartMs: assessment.windowStartMs,
          },
        },
      });
    }
  }

  return candidates;
}

/** Exported for daily-driving period splitting. */
export function longestUninterruptedRestMs(activities: TachoActivityLike[]): number {
  const segments = buildTimelineSegments(activities);
  return segments
    .filter((segment) => segment.kind === 'rest')
    .reduce((max, segment) => Math.max(max, segment.durationS), 0);
}
