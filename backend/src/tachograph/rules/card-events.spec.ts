import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateCardEventRules } from './card-events';

describe('card-events', () => {
  it('driving_without_card_with_driver_is_critical', () => {
    const result = evaluateCardEventRules(
      [{ type: 'driving_without_card', occurredAtMs: Date.parse('2026-06-01T08:00:00.000Z') }],
      'driver-1',
    );
    assert.equal(result.length, 1);
    assert.equal(result[0]?.type, 'driving_without_card');
    assert.equal(result[0]?.severity, 'critical');
    assert.equal(result[0]?.driverId, 'driver-1');
  });

  it('driving_without_card_without_driver_still_returns_candidate', () => {
    const result = evaluateCardEventRules(
      [{ type: 'driving_without_card', occurredAtMs: Date.parse('2026-06-01T08:00:00.000Z') }],
      undefined,
    );
    assert.equal(result.length, 1);
    assert.equal(result[0]?.driverId, undefined);
  });
});
