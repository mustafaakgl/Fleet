import { WEEKLY_REST } from './constants';
import { buildTimelineSegments } from './activity-utils';
import {
  applyCompensationRepayment,
  createCompensationDebt,
  isCompensationDebtUnpaid,
} from './compensation';
import type { EvaluationRange, InfringementCandidate, TachoActivityLike } from './types';
import { filterActivitiesInRange } from './activity-utils';

type WeeklyRestBlock = {
  startedAtMs: number;
  endedAtMs: number;
  durationS: number;
};

function findWeeklyRestBlocks(activities: TachoActivityLike[]): WeeklyRestBlock[] {
  const segments = buildTimelineSegments(activities);
  return segments
    .filter((segment) => segment.kind === 'rest')
    .filter((segment) => segment.durationS >= 9 * 3600)
    .map((segment) => ({
      startedAtMs: segment.startedAtMs,
      endedAtMs: segment.endedAtMs,
      durationS: segment.durationS,
    }));
}

/**
 * Art. 8/6 — Weekly rest and compensation.
 * TODO: split weekly rest (3h+9h) — out of scope this iteration.
 */
export function evaluateWeeklyRestRules(
  activities: TachoActivityLike[],
  range: EvaluationRange,
): InfringementCandidate[] {
  const scoped = filterActivitiesInRange(activities, range);
  const rests = findWeeklyRestBlocks(scoped);
  const candidates: InfringementCandidate[] = [];
  const debts: ReturnType<typeof createCompensationDebt>[] = [];

  for (let i = 1; i < rests.length; i += 1) {
    const prev = rests[i - 1]!;
    const curr = rests[i]!;
    const gapS = Math.floor((curr.startedAtMs - prev.endedAtMs) / 1000);

    if (gapS > WEEKLY_REST.MAX_GAP) {
      candidates.push({
        type: 'insufficient_weekly_rest',
        severity: 'medium',
        occurredAtMs: curr.startedAtMs,
        evidence: {
          rule: 'weekly-rest',
          article: 'Art. 8/6',
          calculatedValues: {
            gapS,
            maxGapS: WEEKLY_REST.MAX_GAP,
          },
        },
      });
    }

    if (curr.durationS < WEEKLY_REST.REDUCED) {
      candidates.push({
        type: 'insufficient_weekly_rest',
        severity: 'critical',
        occurredAtMs: curr.startedAtMs,
        evidence: {
          rule: 'weekly-rest',
          article: 'Art. 8/6',
          calculatedValues: {
            restS: curr.durationS,
            minimumReducedS: WEEKLY_REST.REDUCED,
          },
        },
      });
      continue;
    }

    if (curr.durationS < WEEKLY_REST.NORMAL) {
      const owed = WEEKLY_REST.NORMAL - curr.durationS;
      debts.push(createCompensationDebt(owed, curr.endedAtMs));
    }
  }

  let openDebts = [...debts];
  for (const rest of rests) {
    if (rest.durationS >= WEEKLY_REST.NORMAL) {
      openDebts = openDebts.map((debt) =>
        applyCompensationRepayment(debt, rest.durationS, WEEKLY_REST.REDUCED),
      );
    }
  }

  for (const debt of openDebts) {
    if (isCompensationDebtUnpaid(debt, range.toMs)) {
      candidates.push({
        type: 'insufficient_weekly_rest',
        severity: 'medium',
        occurredAtMs: debt.dueByMs,
        evidence: {
          rule: 'weekly-rest',
          article: 'Art. 8/6 compensation',
          calculatedValues: {
            owedSeconds: debt.owedSeconds,
            repaidSeconds: debt.repaidSeconds,
            dueByMs: debt.dueByMs,
          },
        },
      });
    }
  }

  return candidates;
}
