import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  calculateInvoiceTotals,
  calculateLine,
  formatMilliunits,
  parseQuantityToMilliunits,
} from './money';

describe('invoicing money', () => {
  it('parses German and invariant quantities without floating-point math', () => {
    assert.equal(parseQuantityToMilliunits('1'), 1_000);
    assert.equal(parseQuantityToMilliunits('12,345'), 12_345);
    assert.equal(parseQuantityToMilliunits('0.5'), 500);
    assert.equal(formatMilliunits(12_340), '12.34');
  });

  it('calculates a standard 19 percent line in integer cents', () => {
    assert.deepEqual(
      calculateLine({
        quantityMilliunits: 1_000,
        unitPriceCents: 10_000,
        taxRateBasisPoints: 1_900,
        taxCategory: 'standard',
      }),
      {
        quantityMilliunits: 1_000,
        unitPriceCents: 10_000,
        taxRateBasisPoints: 1_900,
        taxCategory: 'standard',
        netCents: 10_000,
        taxCents: 1_900,
        grossCents: 11_900,
      },
    );
  });

  it('uses kaufmaennisches Runden at half-cent boundaries', () => {
    const roundedDown = calculateLine({
      quantityMilliunits: 333,
      unitPriceCents: 100,
      taxRateBasisPoints: 0,
      taxCategory: 'exempt',
    });
    const roundedUp = calculateLine({
      quantityMilliunits: 335,
      unitPriceCents: 100,
      taxRateBasisPoints: 0,
      taxCategory: 'exempt',
    });

    assert.equal(roundedDown.netCents, 33);
    assert.equal(roundedUp.netCents, 34);
  });

  it('sums tax per line rather than recalculating at document level', () => {
    const totals = calculateInvoiceTotals([
      {
        quantityMilliunits: 1_000,
        unitPriceCents: 1,
        taxRateBasisPoints: 1_900,
        taxCategory: 'standard',
      },
      {
        quantityMilliunits: 1_000,
        unitPriceCents: 1,
        taxRateBasisPoints: 1_900,
        taxCategory: 'standard',
      },
    ]);

    assert.equal(totals.netCents, 2);
    assert.equal(totals.taxCents, 0);
    assert.equal(totals.grossCents, 2);
  });

  it('builds separate tax buckets for 19 percent, exempt and reverse charge', () => {
    const totals = calculateInvoiceTotals([
      {
        quantityMilliunits: 1_000,
        unitPriceCents: 10_000,
        taxRateBasisPoints: 1_900,
        taxCategory: 'standard',
      },
      {
        quantityMilliunits: 1_000,
        unitPriceCents: 5_000,
        taxRateBasisPoints: 0,
        taxCategory: 'exempt',
      },
      {
        quantityMilliunits: 1_000,
        unitPriceCents: 2_500,
        taxRateBasisPoints: 0,
        taxCategory: 'reverse_charge',
      },
    ]);

    assert.equal(totals.netCents, 17_500);
    assert.equal(totals.taxCents, 1_900);
    assert.equal(totals.grossCents, 19_400);
    assert.equal(totals.taxBreakdown.length, 3);
  });

  it('rejects VAT on exempt and reverse-charge lines', () => {
    assert.throws(
      () =>
        calculateLine({
          quantityMilliunits: 1_000,
          unitPriceCents: 100,
          taxRateBasisPoints: 1_900,
          taxCategory: 'reverse_charge',
        }),
      /zero tax rate/,
    );
  });

  it('rejects empty invoices and invalid quantities', () => {
    assert.throws(() => calculateInvoiceTotals([]), /at least one line/);
    assert.throws(() => parseQuantityToMilliunits('1.2345'), /at most three/);
    assert.throws(() => parseQuantityToMilliunits('0'), /greater than zero/);
  });
});
