import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  formatExtfAmount,
  renderDebtorMasterCsv,
  renderExtfBuchungsstapelCsv,
  type DatevInvoiceExportInput,
} from './extf';

const FIXTURE_PATH = join(__dirname, '__fixtures__', 'extf-golden.csv');

describe('DATEV EXTF rendering', () => {
  it('renders Buchungsstapel exactly like golden fixture', () => {
    const invoices: DatevInvoiceExportInput[] = [
      {
        invoiceId: 'invoice-a',
        invoiceNumber: 'RE-2026-00001',
        invoiceDate: new Date('2026-07-30T00:00:00.000Z'),
        companyName: 'Acme Logistik GmbH',
        debtorNumber: 10000,
        kind: 'invoice',
        taxBuckets: [
          { taxCategory: 'standard', taxRateBasisPoints: 1900, grossCents: 119_000 },
          { taxCategory: 'reduced', taxRateBasisPoints: 700, grossCents: 10_700 },
          { taxCategory: 'exempt', taxRateBasisPoints: 0, grossCents: 10_000 },
          { taxCategory: 'reverse_charge', taxRateBasisPoints: 0, grossCents: 13_000 },
        ],
      },
      {
        invoiceId: 'invoice-b',
        invoiceNumber: 'ST-2026-00002',
        invoiceDate: new Date('2026-07-30T00:00:00.000Z'),
        companyName: 'Beta Transport AG',
        debtorNumber: 10001,
        kind: 'cancellation',
        taxBuckets: [{ taxCategory: 'standard', taxRateBasisPoints: 1900, grossCents: 119_000 }],
      },
    ];

    const actual = renderExtfBuchungsstapelCsv({
      profile: {
        consultantNumber: '12345',
        clientNumber: '54321',
        chart: 'SKR03',
        revenueAccount19: '8400',
        revenueAccount7: '8300',
        revenueAccount0: '8125',
        revenueAccountReverseCharge: '8337',
      },
      createdAt: new Date('2026-07-30T11:00:00.000Z'),
      invoices,
    });

    const expected = readFileSync(FIXTURE_PATH, 'utf8');
    assert.equal(actual, expected);
  });

  it('formats German decimal comma without thousand separators', () => {
    assert.equal(formatExtfAmount(123_456_789), '1234567,89');
    assert.equal(formatExtfAmount(-5), '-0,05');
  });

  it('renders empty debtor master with header only', () => {
    assert.equal(renderDebtorMasterCsv([]), 'Debitor;Name\n');
  });
});
