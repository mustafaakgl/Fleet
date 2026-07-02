import type { EvaluationRange, TachoActivityLike, TachoWorkStateLike } from './types';
import { overlapsRange } from './time';

export function sortActivities(activities: TachoActivityLike[]): TachoActivityLike[] {
  return [...activities].sort((a, b) => a.startedAtMs - b.startedAtMs || a.endedAtMs - b.endedAtMs);
}

/** Truncate activity durations at a wall-clock instant (for live remaining counters). */
export function clipActivitiesAt(activities: TachoActivityLike[], atMs: number): TachoActivityLike[] {
  return sortActivities(activities)
    .filter((activity) => activity.startedAtMs < atMs)
    .map((activity) => {
      if (activity.endedAtMs <= atMs) {
        return activity;
      }
      const durationS = Math.max(0, Math.floor((atMs - activity.startedAtMs) / 1000));
      return {
        ...activity,
        endedAtMs: atMs,
        durationS,
      };
    });
}

export function filterActivitiesInRange(
  activities: TachoActivityLike[],
  range: EvaluationRange,
): TachoActivityLike[] {
  return sortActivities(activities).filter((activity) =>
    overlapsRange(activity.startedAtMs, activity.endedAtMs, range),
  );
}

export function isDriving(state: TachoWorkStateLike): boolean {
  return state === 'driving';
}

export function isRest(state: TachoWorkStateLike): boolean {
  return state === 'rest';
}

export function sumDrivingSeconds(activities: TachoActivityLike[]): number {
  return activities.reduce(
    (sum, activity) => (isDriving(activity.workState) ? sum + activity.durationS : sum),
    0,
  );
}

export type TimelineSegment =
  | { kind: 'driving'; startedAtMs: number; endedAtMs: number; durationS: number; activityIds: string[] }
  | { kind: 'rest'; startedAtMs: number; endedAtMs: number; durationS: number; activityIds: string[] };

/** Merge consecutive activities with the same driving/rest class into uninterrupted blocks. */
export function buildTimelineSegments(activities: TachoActivityLike[]): TimelineSegment[] {
  const sorted = sortActivities(activities);
  const segments: TimelineSegment[] = [];

  for (const activity of sorted) {
    const kind = isDriving(activity.workState) ? 'driving' : isRest(activity.workState) ? 'rest' : null;
    if (!kind) {
      continue;
    }

    const last = segments[segments.length - 1];
    const activityId = activity.id ?? `${activity.startedAtMs}`;

    if (last && last.kind === kind && last.endedAtMs === activity.startedAtMs) {
      last.endedAtMs = activity.endedAtMs;
      last.durationS += activity.durationS;
      last.activityIds.push(activityId);
      continue;
    }

    segments.push({
      kind,
      startedAtMs: activity.startedAtMs,
      endedAtMs: activity.endedAtMs,
      durationS: activity.durationS,
      activityIds: [activityId],
    });
  }

  return segments;
}

/** Split activities at daily-rest boundaries (uninterrupted rest ≥ reduced daily rest minimum). */
export function splitAtDailyRestBoundaries(
  activities: TachoActivityLike[],
  minRestS: number,
): TachoActivityLike[][] {
  const segments = buildTimelineSegments(activities);
  const periods: TachoActivityLike[][] = [];
  let current: TachoActivityLike[] = [];

  for (const segment of segments) {
    if (segment.kind === 'rest' && segment.durationS >= minRestS) {
      if (current.length > 0) {
        periods.push(current);
        current = [];
      }
      continue;
    }

    // Re-expand segment into synthetic activity for period accumulation
    current.push({
      id: segment.activityIds.join('+'),
      startedAtMs: segment.startedAtMs,
      endedAtMs: segment.endedAtMs,
      durationS: segment.durationS,
      workState: segment.kind,
    });
  }

  if (current.length > 0) {
    periods.push(current);
  }

  return periods.length > 0 ? periods : [activities];
}
