import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildNormalizedMovements,
  resolveWageTypeRule,
  summarizeMovements,
  type DriverPayrollIdentity,
  type MappableEntry,
  type WageTypeRule,
} from './payroll-movement.mapper';

function rule(overrides: Partial<WageTypeRule> = {}): WageTypeRule {
  return {
    payrollSystem: 'lodas',
    movementType: 'overtime_hours',
    externalWageType: '1100',
    enabled: true,
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
    validTo: null,
    costCenter: null,
    costUnit: null,
    ...overrides,
  };
}

function entry(overrides: Partial<MappableEntry> = {}): MappableEntry {
  return {
    id: 'entry-1',
    driverId: 'driver-a',
    kind: 'regular',
    regularMinutes: 0,
    overtimeMinutes: 0,
    nightMinutes: 0,
    nightCoreMinutes: 0,
    sundayMinutes: 0,
    holidayMinutes: 0,
    vacationDays: 0,
    sickDays: 0,
    unpaidAbsenceDays: 0,
    ...overrides,
  };
}

const IDENTITY: DriverPayrollIdentity = {
  driverId: 'driver-a',
  personnelNumber: '1001',
  costCenter: 'KST-1',
  costUnit: null,
};

function identities(...rows: DriverPayrollIdentity[]) {
  return new Map(rows.map((row) => [row.driverId, row]));
}

const ALL_RULES: WageTypeRule[] = [
  rule({ movementType: 'regular_hours', externalWageType: '1000' }),
  rule({ movementType: 'overtime_hours', externalWageType: '1100' }),
  rule({ movementType: 'night_hours', externalWageType: '1200' }),
  rule({ movementType: 'vacation', externalWageType: '2000' }),
];

const ASOF = new Date('2026-08-31T00:00:00.000Z');

describe('resolveWageTypeRule', () => {
  it('o tarihte gecerli olan plani secer, en sonuncuyu degil', () => {
    // Temmuz'u yeniden ihrac ederken Agustos'un plani kullanilmamali.
    const rules = [
      rule({ externalWageType: 'ESKI', validFrom: new Date('2026-01-01T00:00:00.000Z'), validTo: new Date('2026-07-31T00:00:00.000Z') }),
      rule({ externalWageType: 'YENI', validFrom: new Date('2026-08-01T00:00:00.000Z') }),
    ];

    assert.equal(
      resolveWageTypeRule(rules, 'lodas', 'overtime_hours', new Date('2026-07-15T00:00:00.000Z'))
        ?.externalWageType,
      'ESKI',
    );
    assert.equal(
      resolveWageTypeRule(rules, 'lodas', 'overtime_hours', ASOF)?.externalWageType,
      'YENI',
    );
  });

  it('LODAS ile Lohn und Gehalt eslemesini karistirmaz', () => {
    const rules = [
      rule({ payrollSystem: 'lodas', externalWageType: 'L' }),
      rule({ payrollSystem: 'lohn_und_gehalt', externalWageType: 'G' }),
    ];

    assert.equal(resolveWageTypeRule(rules, 'lodas', 'overtime_hours', ASOF)?.externalWageType, 'L');
    assert.equal(
      resolveWageTypeRule(rules, 'lohn_und_gehalt', 'overtime_hours', ASOF)?.externalWageType,
      'G',
    );
  });

  it('kapali eslemeyi secmez', () => {
    assert.equal(resolveWageTypeRule([rule({ enabled: false })], 'lodas', 'overtime_hours', ASOF), null);
  });
});

describe('buildNormalizedMovements', () => {
  it('dolu kovalari harekete cevirir, sifirlari atlar', () => {
    const result = buildNormalizedMovements({
      entries: [entry({ regularMinutes: 9_600, overtimeMinutes: 120, nightMinutes: 0 })],
      identities: identities(IDENTITY),
      rules: ALL_RULES,
      payrollSystem: 'lodas',
      year: 2026,
      month: 8,
      asOf: ASOF,
    });

    assert.deepEqual(
      result.movements.map((m) => [m.type, m.quantity, m.wageType]),
      [
        ['regular_hours', 9_600, '1000'],
        ['overtime_hours', 120, '1100'],
      ],
    );
    // Sifir kova YAZILMIYOR: DATEV'de sifirlik Lohnart satiri mevcut degeri
    // sifirlayabiliyor.
    assert.equal(result.movements.some((m) => m.type === 'night_hours'), false);
  });

  it('NEGATIF miktari tasir — Ruckrechnung farki eksi olabilir', () => {
    const result = buildNormalizedMovements({
      entries: [entry({ id: 'corr-1', kind: 'correction', overtimeMinutes: -120 })],
      identities: identities(IDENTITY),
      rules: ALL_RULES,
      payrollSystem: 'lodas',
      year: 2026,
      month: 8,
      asOf: ASOF,
    });

    assert.equal(result.movements.length, 1);
    assert.equal(result.movements[0].quantity, -120);
  });

  it('saat ve gun birimlerini ayirir', () => {
    const result = buildNormalizedMovements({
      entries: [entry({ overtimeMinutes: 60, vacationDays: 2 })],
      identities: identities(IDENTITY),
      rules: ALL_RULES,
      payrollSystem: 'lodas',
      year: 2026,
      month: 8,
      asOf: ASOF,
    });

    assert.deepEqual(
      result.movements.map((m) => [m.type, m.unit]),
      [
        ['overtime_hours', 'minutes'],
        ['vacation', 'days'],
      ],
    );
  });

  it('kova bazli masraf yeri surucununkini ezer', () => {
    const result = buildNormalizedMovements({
      entries: [entry({ regularMinutes: 480, nightMinutes: 120 })],
      identities: identities(IDENTITY),
      rules: [
        rule({ movementType: 'regular_hours', externalWageType: '1000' }),
        rule({ movementType: 'night_hours', externalWageType: '1200', costCenter: 'KST-NACHT' }),
      ],
      payrollSystem: 'lodas',
      year: 2026,
      month: 8,
      asOf: ASOF,
    });

    assert.equal(result.movements.find((m) => m.type === 'regular_hours')?.costCenter, 'KST-1');
    assert.equal(result.movements.find((m) => m.type === 'night_hours')?.costCenter, 'KST-NACHT');
  });

  it('eslenmemis kovayi hareket yapmaz, ayrica raporlar', () => {
    const result = buildNormalizedMovements({
      entries: [entry({ regularMinutes: 480, sundayMinutes: 300 })],
      identities: identities(IDENTITY),
      rules: [rule({ movementType: 'regular_hours', externalWageType: '1000' })],
      payrollSystem: 'lodas',
      year: 2026,
      month: 8,
      asOf: ASOF,
    });

    assert.equal(result.movements.length, 1);
    assert.deepEqual(result.unmapped, [
      { driverId: 'driver-a', type: 'sunday_hours', quantity: 300 },
    ]);
  });

  it('personel numarasi olmayan surucuyu hareket yapmaz, ayrica raporlar', () => {
    const result = buildNormalizedMovements({
      entries: [entry({ driverId: 'driver-x', regularMinutes: 480 })],
      identities: identities(IDENTITY),
      rules: ALL_RULES,
      payrollSystem: 'lodas',
      year: 2026,
      month: 8,
      asOf: ASOF,
    });

    assert.deepEqual(result.movements, []);
    assert.deepEqual(result.missingIdentity, ['driver-x']);
  });

  it('donem etiketini iki haneli ay ile yazar', () => {
    const result = buildNormalizedMovements({
      entries: [entry({ regularMinutes: 480 })],
      identities: identities(IDENTITY),
      rules: ALL_RULES,
      payrollSystem: 'lodas',
      year: 2026,
      month: 3,
      asOf: new Date('2026-03-31T00:00:00.000Z'),
    });

    assert.equal(result.movements[0].payrollPeriod, '2026-03');
  });
});

describe('summarizeMovements', () => {
  it('tur bazinda kayit ve miktar toplar', () => {
    const result = buildNormalizedMovements({
      entries: [
        entry({ id: 'e1', overtimeMinutes: 60 }),
        entry({ id: 'e2', driverId: 'driver-b', overtimeMinutes: 90 }),
      ],
      identities: identities(IDENTITY, {
        driverId: 'driver-b',
        personnelNumber: '1002',
        costCenter: null,
        costUnit: null,
      }),
      rules: ALL_RULES,
      payrollSystem: 'lodas',
      year: 2026,
      month: 8,
      asOf: ASOF,
    });

    assert.deepEqual(summarizeMovements(result.movements), [
      { type: 'overtime_hours', recordCount: 2, totalQuantity: 150 },
    ]);
  });
});
