import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { PayrollWageType } from '@prisma/client';
import {
  minutesToDecimalHours,
  renderNeutralPayrollCsv,
  WAGE_TYPE_SOURCES,
  type NeutralCsvRow,
} from './neutral-csv';

function row(overrides: Partial<NeutralCsvRow> = {}): NeutralCsvRow {
  return {
    personnelNumber: '1001',
    lastName: 'Albrecht',
    firstName: 'Dieter',
    wageType: PayrollWageType.regular,
    datevWageTypeNumber: '1000',
    quantity: 10_080,
    unit: 'hours',
    costCenter: 'KST-1',
    costUnit: null,
    correctsPeriod: null,
    ...overrides,
  };
}

describe('minutesToDecimalHours', () => {
  it('Alman ondalik virguluyle iki basamak verir', () => {
    assert.equal(minutesToDecimalHours(495), '8,25');
    assert.equal(minutesToDecimalHours(480), '8,00');
    assert.equal(minutesToDecimalHours(10), '0,17');
  });
});

describe('renderNeutralPayrollCsv', () => {
  it('golden dosyayla birebir ayni cikti uretir', () => {
    const csv = renderNeutralPayrollCsv({
      year: 2026,
      month: 8,
      profile: { consultantNumber: '12345', clientNumber: '54321' },
      rows: [
        row({ wageType: PayrollWageType.regular, datevWageTypeNumber: '1000', quantity: 10_080 }),
        row({ wageType: PayrollWageType.overtime, datevWageTypeNumber: '1100', quantity: 360 }),
        row({ wageType: PayrollWageType.night, datevWageTypeNumber: '1200', quantity: 420 }),
        row({
          wageType: PayrollWageType.vacation,
          datevWageTypeNumber: '2000',
          quantity: 2,
          unit: 'days',
        }),
        row({
          personnelNumber: '1002',
          lastName: 'Yilmaz',
          firstName: 'Adar',
          wageType: PayrollWageType.regular,
          datevWageTypeNumber: '1000',
          quantity: 9_600,
          costCenter: 'KST-2',
        }),
        row({
          personnelNumber: '1002',
          lastName: 'Yilmaz',
          firstName: 'Adar',
          wageType: PayrollWageType.overtime,
          datevWageTypeNumber: '1100',
          quantity: 120,
          costCenter: 'KST-2',
          correctsPeriod: '2026-07',
        }),
      ],
    });

    const golden = readFileSync(join(__dirname, '__fixtures__', 'neutral-payroll-golden.csv'));
    assert.equal(csv, golden.toString('utf8'));
  });

  it('sifir miktarli kalemi YAZMAZ', () => {
    // DATEV tarafinda sifirlik bir Lohnart satiri mevcut degeri sifirlayabiliyor;
    // "bu ay gece calismasi yok" ile "gece kalemini gonderme" ayni sey degil.
    const csv = renderNeutralPayrollCsv({
      year: 2026,
      month: 8,
      profile: { consultantNumber: null, clientNumber: null },
      rows: [row({ quantity: 0 }), row({ wageType: PayrollWageType.overtime, quantity: 60 })],
    });

    assert.doesNotMatch(csv, /;regular;/);
    assert.match(csv, /;overtime;/);
  });

  it('ayirici iceren alani temizler', () => {
    const csv = renderNeutralPayrollCsv({
      year: 2026,
      month: 8,
      profile: { consultantNumber: null, clientNumber: null },
      rows: [row({ lastName: 'Meier;Schulz', costCenter: 'A\nB' })],
    });

    const dataLine = csv.split('\r\n')[2];
    assert.equal(dataLine.split(';').length, 12);
    assert.match(dataLine, /Meier Schulz/);
    assert.match(dataLine, /A B/);
  });

  it('bos donemde yalnizca ust bilgi ve baslik yazar', () => {
    const csv = renderNeutralPayrollCsv({
      year: 2026,
      month: 8,
      profile: { consultantNumber: null, clientNumber: null },
      rows: [],
    });

    assert.equal(csv.split('\r\n').filter(Boolean).length, 2);
  });
});

describe('WAGE_TYPE_SOURCES', () => {
  it('her kovayi tam bir kez esler', () => {
    const covered = WAGE_TYPE_SOURCES.map((entry) => entry.wageType);
    assert.deepEqual([...covered].sort(), Object.values(PayrollWageType).sort());
    assert.equal(new Set(covered).size, covered.length);
  });

  it('gun kalemlerini saat olarak yazmaz', () => {
    const dayTypes = WAGE_TYPE_SOURCES.filter((entry) => entry.unit === 'days').map(
      (entry) => entry.wageType,
    );
    assert.deepEqual(dayTypes.sort(), [
      PayrollWageType.sick,
      PayrollWageType.unpaid_absence,
      PayrollWageType.vacation,
    ].sort());
  });
});
