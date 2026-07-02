import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatEvidenceLineText } from './tachograph-evidence';

const t = (key: string, opts?: Record<string, string | number>) => {
  if (key === 'tachograph.infringements.evidence.dailyDriving' && opts) {
    return `calc ${opts.calculated} · limit ${opts.limit} · ${opts.extensions ?? ''}`;
  }
  if (key.includes('duration')) return String(opts?.hours ?? opts?.minutes ?? '');
  return key;
};

describe('formatEvidenceLineText', () => {
  it('formats daily driving with limit and extensions', () => {
    const text = formatEvidenceLineText(
      'daily_driving_exceeded',
      {
        calculatedValues: {
          drivingS: 10 * 3600 + 24 * 60,
          thresholdS: 9 * 3600,
          extensionsUsed: 2,
          extensionsMax: 2,
        },
      },
      t,
    );
    assert.match(text, /calc/);
    assert.match(text, /limit/);
  });

  it('falls back when evidence is missing', () => {
    assert.equal(
      formatEvidenceLineText('insufficient_break', null, t),
      'tachograph.infringements.evidence.fallback',
    );
  });
});
