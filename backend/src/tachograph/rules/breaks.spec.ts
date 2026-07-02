import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateBreakRules } from './breaks';
import { activity, chain, fullRange, hours, minutes, seconds } from './test-helpers';

describe('breaks (Art. 7)', () => {
  it('art7_break_at_4h30m00s_clean', () => {
    const activities = [activity('driving', '2026-06-01T08:00:00.000Z', hours(4.5))];
    const result = evaluateBreakRules(activities, fullRange(activities));
    assert.equal(result.length, 0);
  });

  it('art7_break_at_4h30m01s_infringement', () => {
    const activities = [activity('driving', '2026-06-01T08:00:00.000Z', hours(4.5) + seconds(1))];
    const result = evaluateBreakRules(activities, fullRange(activities));
    assert.equal(result.length, 1);
    assert.equal(result[0]?.type, 'insufficient_break');
    assert.equal(result[0]?.severity, 'medium');
  });

  it('art7_break_30m_overrun_is_critical', () => {
    const activities = [activity('driving', '2026-06-01T08:00:00.000Z', hours(5))];
    const result = evaluateBreakRules(activities, fullRange(activities));
    assert.equal(result[0]?.severity, 'critical');
  });

  it('art7_full_45m_break_resets_counter', () => {
    const activities = chain(
      activity('driving', '2026-06-01T08:00:00.000Z', hours(4)),
      activity('rest', '2026-06-01T12:00:00.000Z', minutes(45)),
      activity('driving', '2026-06-01T12:45:00.000Z', hours(4)),
    );
    const result = evaluateBreakRules(activities, fullRange(activities));
    assert.equal(result.length, 0);
  });

  it('art7_split_15_then_30_valid', () => {
    const activities = chain(
      activity('driving', '2026-06-01T08:00:00.000Z', hours(4)),
      activity('rest', '2026-06-01T12:00:00.000Z', minutes(15)),
      activity('rest', '2026-06-01T12:15:00.000Z', minutes(30)),
      activity('driving', '2026-06-01T12:45:00.000Z', hours(4)),
    );
    const result = evaluateBreakRules(activities, fullRange(activities));
    assert.equal(result.length, 0);
  });

  it('art7_split_30_then_15_invalid', () => {
    const activities = chain(
      activity('driving', '2026-06-01T08:00:00.000Z', hours(4)),
      activity('rest', '2026-06-01T12:00:00.000Z', minutes(30)),
      activity('rest', '2026-06-01T12:30:00.000Z', minutes(15)),
      activity('driving', '2026-06-01T12:45:00.000Z', hours(1) + minutes(1)),
    );
    const result = evaluateBreakRules(activities, fullRange(activities));
    assert.equal(result.length, 1);
    assert.equal(result[0]?.type, 'insufficient_break');
  });
});
