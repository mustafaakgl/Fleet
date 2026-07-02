import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { downsampleTimeSeries } from './telematics-downsample.util';

const WINDOW_START = new Date('2026-06-15T00:00:00Z');
const WINDOW_END = new Date('2026-06-15T01:00:00Z');
const BUCKET_MS = 5 * 60 * 1000;

describe('downsampleTimeSeries', () => {
  it('averages values into 5-minute buckets without sending raw points', () => {
    const buckets = downsampleTimeSeries(
      [
        { recordedAt: new Date('2026-06-15T00:02:00Z'), value: 40 },
        { recordedAt: new Date('2026-06-15T00:04:00Z'), value: 60 },
        { recordedAt: new Date('2026-06-15T00:07:00Z'), value: 80 },
      ],
      { bucketMs: BUCKET_MS, windowStart: WINDOW_START, windowEnd: WINDOW_END },
    );

    assert.equal(buckets.length, 12);
    assert.equal(buckets[0]?.value, 50);
    assert.equal(buckets[1]?.value, 80);
    assert.equal(buckets[2]?.value, null);
  });

  it('ignores points outside the window', () => {
    const buckets = downsampleTimeSeries(
      [
        { recordedAt: new Date('2026-06-14T23:50:00Z'), value: 99 },
        { recordedAt: new Date('2026-06-15T00:10:00Z'), value: 55 },
      ],
      { bucketMs: BUCKET_MS, windowStart: WINDOW_START, windowEnd: WINDOW_END },
    );

    assert.equal(buckets[0]?.value, null);
    assert.equal(buckets[2]?.value, 55);
  });
});
