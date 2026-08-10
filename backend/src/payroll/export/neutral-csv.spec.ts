import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import type { NormalizedPayrollMovement } from '../core/payroll-movement';
import type { PayrollExportContext } from '../core/payroll-export.types';
import { centsToAmount, minutesToDecimalHours, neutralCsvWriter } from './neutral-csv';

const CONTEXT: PayrollExportContext = {
  targetSystem: 'datev_lodas',
  consultantNumber: '12345',
  clientNumber: '54321',
  year: 2026,
  month: 8,
  generatedAt: new Date('2026-09-01T10:00:00.000Z'),
};

function movement(overrides: Partial<NormalizedPayrollMovement> = {}): NormalizedPayrollMovement {
  return {
    driverId: 'driver-a',
    personnelNumber: '1001',
    payrollPeriod: '2026-08',
    type: 'regular_hours',
    quantity: 10_080,
    unit: 'minutes',
    wageType: '1000',
    costCenter: 'KST-1',
    sourceId: 'entry-1',
    ...overrides,
  };
}

describe('miktar bicimlendirme', () => {
  it('dakikayi Alman ondalik saatine cevirir', () => {
    assert.equal(minutesToDecimalHours(495), '8,25');
    assert.equal(minutesToDecimalHours(480), '8,00');
  });

  it('NEGATIF miktarda isareti korur — Ruckrechnung eksi olabilir', () => {
    assert.equal(minutesToDecimalHours(-120), '-2,00');
  });

  it('centi tutara cevirir', () => {
    assert.equal(centsToAmount(12_345), '123,45');
  });
});

describe('neutralCsvWriter', () => {
  it('golden dosyayla birebir ayni cikti uretir', () => {
    const csv = neutralCsvWriter.render(
      [
        movement(),
        movement({ type: 'overtime_hours', wageType: '1100', quantity: 360 }),
        movement({ type: 'vacation', wageType: '2000', quantity: 2, unit: 'days' }),
        movement({
          personnelNumber: '1002',
          type: 'overtime_hours',
          wageType: '1100',
          quantity: -120,
          costCenter: 'KST-2',
          sourceId: 'corr-1',
        }),
      ],
      CONTEXT,
    );

    const golden = readFileSync(join(__dirname, '__fixtures__', 'neutral-payroll-golden.csv'), 'utf8');
    assert.equal(csv, golden);
  });

  it('ayirici iceren alani temizler', () => {
    const csv = neutralCsvWriter.render([movement({ costCenter: 'A;B\nC' })], CONTEXT);
    const dataLine = csv.split('\r\n')[2];

    assert.equal(dataLine.split(';').length, 10);
    assert.match(dataLine, /A B C/);
  });

  it('bos donemde yalnizca ust bilgi ve baslik yazar', () => {
    assert.equal(neutralCsvWriter.render([], CONTEXT).split('\r\n').filter(Boolean).length, 2);
  });

  it('dosya adini donemden turetir', () => {
    assert.equal(neutralCsvWriter.fileName(CONTEXT), 'lohn-neutral-202608.csv');
  });
});
