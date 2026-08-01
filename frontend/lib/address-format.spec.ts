import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_ADDRESS_COUNTRY,
  formatStructuredAddress,
  parseFormattedAddress,
} from './address-format';

describe('address-format', () => {
  it('survives the format -> parse round trip for a complete address', () => {
    const parts = {
      street: 'Hauptstraße 5',
      zipCode: '47059',
      city: 'Duisburg',
      country: 'Deutschland',
    };
    assert.deepEqual(parseFormattedAddress(formatStructuredAddress(parts)), parts);
  });

  it('does not put the country into the city when only the street is filled', () => {
    // formatStructuredAddress ulkeyi her zaman ekler; "Duisb, Deutschland"
    // ayristirilinca sehir alanina "Deutschland" dusuyordu.
    const formatted = formatStructuredAddress({ street: 'Duisb' });
    assert.equal(formatted, 'Duisb, Deutschland');

    const parsed = parseFormattedAddress(formatted);
    assert.equal(parsed.street, 'Duisb');
    assert.equal(parsed.city, '');
    assert.equal(parsed.country, 'Deutschland');
  });

  it('still reads a real city from a two-part address', () => {
    const parsed = parseFormattedAddress('Hauptstraße 5, Duisburg');
    assert.equal(parsed.city, 'Duisburg');
    assert.equal(parsed.country, DEFAULT_ADDRESS_COUNTRY);
  });

  it('recognises country spellings case-insensitively', () => {
    assert.equal(parseFormattedAddress('Hauptstraße 5, GERMANY').city, '');
    assert.equal(parseFormattedAddress('Hauptstraße 5, deutschland').city, '');
  });

  it('keeps zip and city apart', () => {
    const parsed = parseFormattedAddress('Hauptstraße 5, 47059 Duisburg, Deutschland');
    assert.equal(parsed.zipCode, '47059');
    assert.equal(parsed.city, 'Duisburg');
  });

  it('returns empty parts for blank input', () => {
    const parsed = parseFormattedAddress('   ');
    assert.equal(parsed.street, '');
    assert.equal(parsed.city, '');
    assert.equal(parsed.country, DEFAULT_ADDRESS_COUNTRY);
  });
});
