import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sampleTrailPoints } from './trail-sampling.util';

describe('sampleTrailPoints', () => {
  it('samples 201 points down to <= 200 while keeping first and last', () => {
    const source = Array.from({ length: 201 }, (_, index) => ({ at: index }));
    const sampled = sampleTrailPoints(source, 200);

    assert.ok(sampled.length <= 200);
    assert.equal(sampled[0]?.at, 0);
    assert.equal(sampled[sampled.length - 1]?.at, 200);
  });
});
