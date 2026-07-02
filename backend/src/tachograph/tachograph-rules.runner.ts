import type { TachoWorkState } from '@prisma/client';
import type { ParsedDddEvent } from './ddd/ddd-parser';
import { evaluateTachographRules } from './rules/evaluate';
import type {
  CardEventLike,
  EvaluationRange,
  InfringementCandidate,
  TachoActivityLike,
} from './rules/types';

export type PersistableActivityRow = {
  id: string;
  driverId: string | null;
  startedAt: Date;
  endedAt: Date;
  durationS: number;
  workState: TachoWorkState;
};

export function mapActivitiesToLike(rows: PersistableActivityRow[]): TachoActivityLike[] {
  return rows.map((row) => ({
    id: row.id,
    driverId: row.driverId ?? undefined,
    startedAtMs: row.startedAt.getTime(),
    endedAtMs: row.endedAt.getTime(),
    durationS: row.durationS,
    workState: row.workState,
  }));
}

export function mapParserEventsToCardEvents(events: ParsedDddEvent[]): CardEventLike[] {
  const mapped: CardEventLike[] = [];

  for (const event of events) {
    if (event.code !== 'driving_without_card') {
      continue;
    }

    mapped.push({
      type: 'driving_without_card',
      occurredAtMs: new Date(event.occurredAt).getTime(),
      durationS: event.durationS,
      severity: event.severity,
    });
  }

  return mapped;
}

export function runTachographRuleEngine(
  activities: TachoActivityLike[],
  range: EvaluationRange,
  options?: { driverId?: string; cardEvents?: CardEventLike[] },
): InfringementCandidate[] {
  return evaluateTachographRules(activities, range, options);
}
