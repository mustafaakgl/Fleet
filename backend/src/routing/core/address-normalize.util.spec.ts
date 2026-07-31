import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addressHash, isSameAddress, normalizeAddress } from './address-normalize.util';

describe('address-normalize.util', () => {
  it('treats str. and strasse and straße as the same street', () => {
    const canonical = normalizeAddress('Hauptstraße 5, 47059 Duisburg');
    assert.equal(normalizeAddress('Hauptstr. 5, 47059 Duisburg'), canonical);
    assert.equal(normalizeAddress('Hauptstrasse 5, 47059 Duisburg'), canonical);
    assert.equal(normalizeAddress('HAUPTSTR 5 / 47059 DUISBURG'), canonical);
  });

  it('folds umlauts and eszett to ASCII', () => {
    assert.equal(normalizeAddress('Grünstraße'), 'gruenstrasse');
    assert.equal(normalizeAddress('Königsallee'), 'koenigsallee');
    assert.equal(normalizeAddress('Weißenburg'), 'weissenburg');
  });

  it('drops country suffixes that carry no distinguishing information', () => {
    assert.equal(
      normalizeAddress('Hauptstr. 5, 47059 Duisburg, Deutschland'),
      normalizeAddress('Hauptstr. 5, 47059 Duisburg'),
    );
    assert.equal(
      normalizeAddress('Hauptstr. 5, 47059 Duisburg, Germany'),
      normalizeAddress('Hauptstr. 5, 47059 Duisburg'),
    );
  });

  it('collapses punctuation and repeated whitespace', () => {
    assert.equal(
      normalizeAddress('  Hauptstr.  5 ,,  47059   Duisburg  '),
      'hauptstrasse 5 47059 duisburg',
    );
  });

  it('expands platz and weg abbreviations', () => {
    assert.equal(normalizeAddress('Rathauspl. 1'), 'rathausplatz 1');
    assert.equal(normalizeAddress('Buchenwg 12'), 'buchenweg 12');
  });

  it('keeps genuinely different addresses distinct', () => {
    assert.notEqual(
      normalizeAddress('Hauptstr. 5, 47059 Duisburg'),
      normalizeAddress('Hauptstr. 6, 47059 Duisburg'),
    );
    assert.notEqual(
      normalizeAddress('Hauptstr. 5, 47059 Duisburg'),
      normalizeAddress('Hauptstr. 5, 50667 Köln'),
    );
  });

  it('returns an empty key for blank input', () => {
    assert.equal(normalizeAddress(''), '');
    assert.equal(normalizeAddress('   '), '');
    assert.equal(normalizeAddress(',,, ...'), '');
  });

  it('produces a stable 64-char hash and matches on equivalent input', () => {
    const hash = addressHash('Hauptstr. 5, 47059 Duisburg');
    assert.equal(hash.length, 64);
    assert.equal(hash, addressHash('Hauptstraße 5, 47059 Duisburg'));
    assert.notEqual(hash, addressHash('Hauptstr. 6, 47059 Duisburg'));
  });

  it('isSameAddress rejects blank input even when both sides are blank', () => {
    assert.equal(isSameAddress('Hauptstr. 5', 'Hauptstraße 5'), true);
    assert.equal(isSameAddress('', ''), false);
    assert.equal(isSameAddress('Hauptstr. 5', 'Nebenstr. 5'), false);
  });
});
