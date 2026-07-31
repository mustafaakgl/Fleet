import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isGeocodeFallbackConsistent } from './geocode-consistency.util';

describe('geocode-consistency.util', () => {
  it('accepts when the returned city appears in the original address', () => {
    assert.equal(
      isGeocodeFallbackConsistent('Hamburg', 'DHL Hub Hamburg-Billbrook, Halskestraße 48'),
      true,
    );
    assert.equal(
      isGeocodeFallbackConsistent('Potsdam', 'Hermes Depot Potsdam, Wetzlarer Straße 54'),
      true,
    );
    assert.equal(
      isGeocodeFallbackConsistent('Hannover', 'Amazon FC HAM2, Hannover-Anderten'),
      true,
    );
  });

  it('rejects the wrong-city case that motivated this guard', () => {
    // On ek atilinca Photon Bremen'deki Hamburger Straße'yi donduruyor.
    // Kabul edilseydi planlanan mesafe yuzlerce km sapardi.
    assert.equal(
      isGeocodeFallbackConsistent(
        'Bremen',
        'DB Schenker Terminal Dresden, Hamburger Straße 19',
      ),
      false,
    );
  });

  it('matches the first part of a compound city name', () => {
    assert.equal(isGeocodeFallbackConsistent('Hamburg-Billbrook', 'Lager Hamburg, Tor 4'), true);
    assert.equal(isGeocodeFallbackConsistent('Frankfurt am Main', 'Depot Frankfurt'), true);
  });

  it('is case insensitive', () => {
    assert.equal(isGeocodeFallbackConsistent('köln', 'LAGER KÖLN, Rampe 2'), true);
  });

  it('rejects blank input', () => {
    assert.equal(isGeocodeFallbackConsistent(null, 'Lager Köln'), false);
    assert.equal(isGeocodeFallbackConsistent('Köln', ''), false);
    assert.equal(isGeocodeFallbackConsistent('', 'Lager Köln'), false);
  });

  it('ignores city names shorter than three characters to avoid accidental substring hits', () => {
    // "Au" gercek bir Alman belediyesi; esik olmasa "Bahnhofstraße" icinde eslesirdi
    assert.equal(isGeocodeFallbackConsistent('Au', 'Bahnhofstraße 1, Dresden'), false);
  });

  it('does not match an unrelated city', () => {
    assert.equal(isGeocodeFallbackConsistent('München', 'Lager Köln, Rampe 2'), false);
  });
});
