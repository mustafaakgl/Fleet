import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatCiiDate,
  formatGermanAmount,
  formatGermanCurrency,
  formatGermanDate,
  formatGermanPercent,
  formatGermanQuantity,
  formatXmlAmount,
  formatXmlDate,
  formatXmlPercent,
  formatXmlQuantity,
} from './format';

describe('German invoice formatting', () => {
  it('writes amounts with a dot as thousands separator and a comma as decimal mark', () => {
    assert.equal(formatGermanAmount(123_456), '1.234,56');
    assert.equal(formatGermanAmount(0), '0,00');
    assert.equal(formatGermanAmount(5), '0,05');
    assert.equal(formatGermanAmount(100), '1,00');
    assert.equal(formatGermanAmount(99_999_999), '999.999,99');
    assert.equal(formatGermanAmount(100_000_000), '1.000.000,00');
    assert.equal(formatGermanAmount(-123_456), '-1.234,56');
  });

  it('appends the euro sign', () => {
    assert.equal(formatGermanCurrency(172_500), '1.725,00 €');
    assert.equal(formatGermanCurrency(172_500, 'CHF'), '1.725,00 CHF');
  });

  it('writes dates as DD.MM.YYYY', () => {
    assert.equal(formatGermanDate(new Date('2026-07-27T00:00:00.000Z')), '27.07.2026');
    assert.equal(formatGermanDate(new Date('2026-01-01T00:00:00.000Z')), '01.01.2026');
    assert.equal(formatGermanDate(new Date('2026-12-31T00:00:00.000Z')), '31.12.2026');
  });

  it('writes tax rates without trailing zeros', () => {
    assert.equal(formatGermanPercent(1_900), '19');
    assert.equal(formatGermanPercent(700), '7');
    assert.equal(formatGermanPercent(0), '0');
    assert.equal(formatGermanPercent(750), '7,5');
  });

  it('writes quantities with a decimal comma', () => {
    assert.equal(formatGermanQuantity(1_000), '1');
    assert.equal(formatGermanQuantity(2_500), '2,5');
    assert.equal(formatGermanQuantity(1_250), '1,25');
  });

  it('rejects amounts that cannot be represented exactly', () => {
    assert.throws(() => formatGermanAmount(1.5), /safe integer/);
    assert.throws(() => formatGermanAmount(Number.MAX_SAFE_INTEGER + 2), /safe integer/);
  });
});

describe('XML invoice formatting', () => {
  it('writes amounts with exactly two decimals and a decimal point', () => {
    assert.equal(formatXmlAmount(123_456), '1234.56');
    assert.equal(formatXmlAmount(100_000), '1000.00');
    assert.equal(formatXmlAmount(0), '0.00');
    assert.equal(formatXmlAmount(5), '0.05');
  });

  it('writes tax rates with two decimals', () => {
    assert.equal(formatXmlPercent(1_900), '19.00');
    assert.equal(formatXmlPercent(700), '7.00');
    assert.equal(formatXmlPercent(0), '0.00');
  });

  it('writes quantities with three decimals', () => {
    assert.equal(formatXmlQuantity(1_000), '1.000');
    assert.equal(formatXmlQuantity(2_500), '2.500');
    assert.equal(formatXmlQuantity(1), '0.001');
  });

  it('writes ISO dates for UBL and basic dates for CII', () => {
    const date = new Date('2026-07-27T00:00:00.000Z');
    assert.equal(formatXmlDate(date), '2026-07-27');
    assert.equal(formatCiiDate(date), '20260727');
  });
});
