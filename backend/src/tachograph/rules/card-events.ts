import type { CardEventLike, InfringementCandidate } from './types';

/**
 * VU card events — driving without card is critical when driver is known.
 * Caller must drop driver-less candidates (unique constraint requires driverId).
 */
export function evaluateCardEventRules(
  events: CardEventLike[],
  driverId?: string,
): InfringementCandidate[] {
  const candidates: InfringementCandidate[] = [];

  for (const event of events) {
    if (event.type !== 'driving_without_card') {
      continue;
    }

    candidates.push({
      type: 'driving_without_card',
      severity: 'critical',
      occurredAtMs: event.occurredAtMs,
      driverId,
      evidence: {
        rule: 'card-events',
        calculatedValues: {
          eventType: event.type,
          durationS: event.durationS ?? null,
        },
      },
    });
  }

  return candidates;
}
