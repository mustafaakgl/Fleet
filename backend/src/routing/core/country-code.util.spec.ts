import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toCountryCode } from './country-code.util';

describe('toCountryCode', () => {
  it('maps the form default', () => {
    assert.equal(toCountryCode('Deutschland'), 'DE');
  });

  it('accepts German, English and local spellings of the same country', () => {
    for (const raw of ['Niederlande', 'Netherlands', 'Nederland', 'Holland', 'NL', 'nl']) {
      assert.equal(toCountryCode(raw), 'NL', raw);
    }
    for (const raw of ['Belgien', 'Belgium', 'België', 'Belgique', 'BE']) {
      assert.equal(toCountryCode(raw), 'BE', raw);
    }
  });

  it('treats umlauts, ae-spellings and casing as the same input', () => {
    // Disponent klavyesine gore "Österreich" veya "Oesterreich" yaziyor;
    // ikisi de ayni ulke.
    assert.equal(toCountryCode('Österreich'), 'AT');
    assert.equal(toCountryCode('OESTERREICH'), 'AT');
    assert.equal(toCountryCode('österreich'), 'AT');
  });

  it('tolerates stray whitespace and dots', () => {
    assert.equal(toCountryCode('  D.E.  '), 'DE');
    assert.equal(toCountryCode('Czech  Republic'), 'CZ');
  });

  it('returns null for anything it does not know', () => {
    // Kritik: taninmayan metin filtreyi HIC uygulatmamali. "Freedonia" yuzunden
    // oneri listesini bosaltmak, filtrelememekten kotu.
    assert.equal(toCountryCode('Freedonia'), null);
    assert.equal(toCountryCode('Duisburg'), null);
    assert.equal(toCountryCode(''), null);
    assert.equal(toCountryCode(null), null);
    assert.equal(toCountryCode(undefined), null);
  });
});
