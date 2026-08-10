import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_GEOCODING_BBOX, readGeocodingBbox } from './geocode-bbox.util';

/** Kutu icinde mi? bbox "minLon,minLat,maxLon,maxLat" bicimindedir. */
function contains(bbox: string, point: { lat: number; lon: number }): boolean {
  const [minLon, minLat, maxLon, maxLat] = bbox.split(',').map(Number);
  return (
    point.lon >= minLon && point.lon <= maxLon && point.lat >= minLat && point.lat <= maxLat
  );
}

describe('DEFAULT_GEOCODING_BBOX', () => {
  it('covers the DACH + BeNeLux cities the old Germany box cut off', () => {
    // Eski kutu (5.87,47.27,15.04,55.06) bu dortunu de disarida birakiyordu;
    // "Meir Antwerpen" olcumde bos donuyordu.
    for (const city of [
      { name: 'Amsterdam', lat: 52.37, lon: 4.9 },
      { name: 'Rotterdam', lat: 51.92, lon: 4.48 },
      { name: 'Brüssel', lat: 50.85, lon: 4.35 },
      { name: 'Antwerpen', lat: 51.22, lon: 4.4 },
    ]) {
      assert.ok(contains(DEFAULT_GEOCODING_BBOX, city), `${city.name} must be inside the box`);
    }
  });

  it('still covers Germany end to end plus the DACH corners', () => {
    for (const city of [
      { name: 'List/Sylt', lat: 55.02, lon: 8.44 },
      { name: 'Görlitz', lat: 51.15, lon: 15.0 },
      { name: 'Wien', lat: 48.21, lon: 16.37 },
      { name: 'Genf', lat: 46.2, lon: 6.14 },
      { name: 'Luxemburg', lat: 49.61, lon: 6.13 },
    ]) {
      assert.ok(contains(DEFAULT_GEOCODING_BBOX, city), `${city.name} must be inside the box`);
    }
  });

  it('stays a box, not the whole continent', () => {
    // Sinirsiz arama olmasin: capa (bias) uzak kitasal adaylari toparlayamiyor.
    for (const city of [
      { name: 'Madrid', lat: 40.42, lon: -3.7 },
      { name: 'Istanbul', lat: 41.01, lon: 28.98 },
      { name: 'Oslo', lat: 59.91, lon: 10.75 },
    ]) {
      assert.ok(!contains(DEFAULT_GEOCODING_BBOX, city), `${city.name} must be outside the box`);
    }
  });
});

describe('readGeocodingBbox', () => {
  it('falls back to the default when unset', () => {
    assert.deepEqual(readGeocodingBbox(undefined), {
      kind: 'bbox',
      value: DEFAULT_GEOCODING_BBOX,
    });
    assert.deepEqual(readGeocodingBbox('   '), { kind: 'bbox', value: DEFAULT_GEOCODING_BBOX });
  });

  it('accepts a widened box and normalises the spacing', () => {
    assert.deepEqual(readGeocodingBbox(' -5, 35 , 25,60 '), { kind: 'bbox', value: '-5,35,25,60' });
  });

  it('turns the restriction off on request', () => {
    for (const raw of ['off', 'OFF', 'none', 'global', 'world']) {
      assert.deepEqual(readGeocodingBbox(raw), { kind: 'global' }, raw);
    }
  });

  it('rejects a reversed box instead of silently returning nothing', () => {
    // Ters kutuda Photon bos liste donerdi ve arayuz bunu "adres bulunamadi"
    // sanardi — sessiz kayip.
    assert.deepEqual(readGeocodingBbox('17.2,55.1,2.5,45.8'), {
      kind: 'invalid',
      raw: '17.2,55.1,2.5,45.8',
    });
  });

  it('rejects malformed input', () => {
    for (const raw of ['2.5,45.8,17.2', '2.5,45.8,17.2,55.1,9', 'a,b,c,d', '2.5,45.8,17.2,']) {
      assert.equal(readGeocodingBbox(raw).kind, 'invalid', raw);
    }
  });

  it('rejects out-of-range coordinates', () => {
    assert.equal(readGeocodingBbox('-181,45,17,55').kind, 'invalid');
    assert.equal(readGeocodingBbox('2.5,-91,17,55').kind, 'invalid');
    assert.equal(readGeocodingBbox('2.5,45,17,91').kind, 'invalid');
  });
});
