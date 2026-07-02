import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatDurationS, parseInfringementEvidence } from './tachograph-format.util';
import { getInfringementMeta } from './tachograph-infringement-meta';

describe('tachograph-format.util', () => {
  it('formats duration without decimal hours', () => {
    assert.equal(formatDurationS(9 * 3600 + 42 * 60), '9 h 42 min');
    assert.equal(formatDurationS(42), '42 s');
  });

  it('parses infringement evidence JSON', () => {
    const evidence = parseInfringementEvidence(
      JSON.stringify({ rule: 'weekly-driving', calculatedValues: { drivingS: 3600 } }),
    );
    assert.equal(evidence?.rule, 'weekly-driving');
  });
});

describe('tachograph-infringement-meta', () => {
  it('maps all infringement types to articles', () => {
    const types = [
      'daily_driving_exceeded',
      'insufficient_daily_rest',
      'insufficient_break',
      'exceeded_weekly_driving',
      'exceeded_two_week_driving',
      'insufficient_weekly_rest',
      'driving_without_card',
    ] as const;

    for (const type of types) {
      const meta = getInfringementMeta(type);
      assert.ok(meta.article.startsWith('Art.'));
      assert.ok(meta.labelKey.includes('tachograph.infringements.types'));
    }
  });
});
