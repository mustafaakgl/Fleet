import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildSpeedColoredSegments } from './map-speed-segments';

describe('map-speed-segments', () => {
  it('merges consecutive same-color points into one polyline', () => {
    const segments = buildSpeedColoredSegments([
      { lat: 48.1, lng: 11.5, speedKmh: 40 },
      { lat: 48.11, lng: 11.51, speedKmh: 42 },
      { lat: 48.12, lng: 11.52, speedKmh: 70 },
      { lat: 48.13, lng: 11.53, speedKmh: 72 },
      { lat: 48.14, lng: 11.54, speedKmh: 95 },
    ]);

    assert.equal(segments.length, 3);
    assert.equal(segments[0].color, '#16a34a');
    assert.equal(segments[1].color, '#d97706');
    assert.equal(segments[2].color, '#dc2626');
    assert.equal(segments[0].positions.length, 2);
    assert.equal(segments[1].positions.length, 2);
    assert.equal(segments[2].positions.length, 2);
  });
});
