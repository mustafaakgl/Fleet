import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { queryHasHouseNumber } from './house-number.util';

describe('queryHasHouseNumber', () => {
  it('detects a plain house number', () => {
    assert.equal(queryHasHouseNumber('Stralauer Allee 24'), true);
    assert.equal(queryHasHouseNumber('Hauptstr 5'), true);
  });

  it('detects suffixed and ranged numbers', () => {
    assert.equal(queryHasHouseNumber('Musterweg 12a'), true);
    assert.equal(queryHasHouseNumber('Musterweg 12-14'), true);
    assert.equal(queryHasHouseNumber('Musterweg 3/5'), true);
  });

  it('does not treat a postal code as a house number', () => {
    // Photon zaten posta kodunu bulanik metin gibi isliyor; ayrica bunu ev
    // numarasi sayip kisiti kaldirmak sonucu daha da bozar.
    assert.equal(queryHasHouseNumber('Hauptstrasse 47059'), false);
    assert.equal(queryHasHouseNumber('Stralauer Allee 10245'), false);
  });

  it('is false for a street without a number', () => {
    assert.equal(queryHasHouseNumber('Stralauer Allee'), false);
    assert.equal(queryHasHouseNumber('Bahnhofstr'), false);
    assert.equal(queryHasHouseNumber(''), false);
  });

  it('ignores a leading number', () => {
    assert.equal(queryHasHouseNumber('24'), false);
    assert.equal(queryHasHouseNumber('10245 Berlin'), false);
  });

  it('handles comma separated input', () => {
    assert.equal(queryHasHouseNumber('Stralauer Allee 24, Berlin'), true);
  });
});
