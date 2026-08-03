import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { haversineMeters, readRegionAnchor } from './geo-distance.util';

const DUISBURG = { latitude: 51.4344, longitude: 6.7623 };
const KOELN = { latitude: 50.9375, longitude: 6.9603 };
const ZUERICH = { latitude: 47.3769, longitude: 8.5417 };

describe('haversineMeters', () => {
  it('measures a known city pair within a percent', () => {
    // Duisburg - Köln is roughly 56 km great-circle.
    const meters = haversineMeters(DUISBURG, KOELN);
    assert.ok(meters > 55_000 && meters < 57_000, `expected ~56 km, got ${Math.round(meters)} m`);
  });

  it('is zero for the same point and symmetric', () => {
    assert.equal(haversineMeters(KOELN, KOELN), 0);
    assert.equal(
      Math.round(haversineMeters(DUISBURG, ZUERICH)),
      Math.round(haversineMeters(ZUERICH, DUISBURG)),
    );
  });

  it('ranks the local street above the foreign one', () => {
    // The case that motivated the ranking: an unanchored "Bahnhofstr" query
    // returns Zürich, which must sort below a German candidate.
    assert.ok(haversineMeters(DUISBURG, KOELN) < haversineMeters(DUISBURG, ZUERICH));
  });
});

describe('readRegionAnchor', () => {
  function withEnv(lat: string | undefined, lon: string | undefined, run: () => void): void {
    const previousLat = process.env.ROUTING_ACCESS_PROBE_LAT;
    const previousLon = process.env.ROUTING_ACCESS_PROBE_LON;

    if (lat === undefined) delete process.env.ROUTING_ACCESS_PROBE_LAT;
    else process.env.ROUTING_ACCESS_PROBE_LAT = lat;
    if (lon === undefined) delete process.env.ROUTING_ACCESS_PROBE_LON;
    else process.env.ROUTING_ACCESS_PROBE_LON = lon;

    try {
      run();
    } finally {
      if (previousLat === undefined) delete process.env.ROUTING_ACCESS_PROBE_LAT;
      else process.env.ROUTING_ACCESS_PROBE_LAT = previousLat;
      if (previousLon === undefined) delete process.env.ROUTING_ACCESS_PROBE_LON;
      else process.env.ROUTING_ACCESS_PROBE_LON = previousLon;
    }
  }

  it('reads a configured anchor', () => {
    withEnv('51.4344', '6.7623', () => {
      assert.deepEqual(readRegionAnchor(), { latitude: 51.4344, longitude: 6.7623 });
    });
  });

  it('treats an unset anchor as absent rather than 0,0', () => {
    withEnv(undefined, undefined, () => assert.equal(readRegionAnchor(), null));
    withEnv('', '', () => assert.equal(readRegionAnchor(), null));
    withEnv('0', '0', () => assert.equal(readRegionAnchor(), null));
  });

  it('rejects out-of-range values', () => {
    withEnv('91', '6.7', () => assert.equal(readRegionAnchor(), null));
    withEnv('51.4', '181', () => assert.equal(readRegionAnchor(), null));
    withEnv('nicht-gesetzt', '6.7', () => assert.equal(readRegionAnchor(), null));
  });
});
