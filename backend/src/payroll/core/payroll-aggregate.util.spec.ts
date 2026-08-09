import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PayrollDayType, PayrollDayTypeSource } from '@prisma/client';
import { DEFAULT_DAY_TYPE_MAPPINGS, type DayTypeRule } from './day-type-mapping';
import {
  buildPayrollDays,
  buildPayrollEntryTotals,
  localDatesOfMonth,
  type BuildDaysInput,
  type PayrollDayDraft,
} from './payroll-aggregate.util';
import type { DayBuckets } from './time-buckets.util';

function rules(): Map<string, DayTypeRule> {
  return new Map(
    DEFAULT_DAY_TYPE_MAPPINGS.map((entry) => [
      entry.calendarCode,
      { dayType: entry.dayType, paid: entry.paid },
    ]),
  );
}

function buckets(localDate: string, overrides: Partial<DayBuckets> = {}): DayBuckets {
  return {
    localDate,
    workedMinutes: 480,
    nightMinutes: 0,
    nightCoreMinutes: 0,
    sundayMinutes: 0,
    holidayMinutes: 0,
    ...overrides,
  };
}

function input(overrides: Partial<BuildDaysInput> = {}): BuildDaysInput {
  return {
    localDates: ['2026-08-10'], // Pazartesi
    buckets: new Map(),
    breakMinutesByDate: new Map(),
    calendarByDate: new Map(),
    holidayDates: new Set(),
    rules: rules(),
    anomaliesByDate: new Map(),
    ...overrides,
  };
}

describe('buildPayrollDays gun tipi sirasi', () => {
  it('yasal tatil tablosu takvimin onunde gelir', () => {
    const days = buildPayrollDays(
      input({
        holidayDates: new Set(['2026-08-10']),
        calendarByDate: new Map([['2026-08-10', { status: 'AT' }]]),
      }),
    );

    assert.equal(days[0].dayType, PayrollDayType.holiday);
    assert.equal(days[0].dayTypeSource, PayrollDayTypeSource.holiday_table);
  });

  it('takvim kodunu cozer ve kaynagini isaretler', () => {
    const days = buildPayrollDays(
      input({ calendarByDate: new Map([['2026-08-10', { status: 'UT' }]]) }),
    );

    assert.equal(days[0].dayType, PayrollDayType.vacation);
    assert.equal(days[0].dayTypeSource, PayrollDayTypeSource.calendar);
    assert.equal(days[0].calendarCode, 'UT');
    assert.equal(days[0].paid, true);
  });

  it('eslenmemis kodda gun tipini BOS birakir ve anomali yazar', () => {
    const days = buildPayrollDays(
      input({ calendarByDate: new Map([['2026-08-10', { status: 'AB', uiStatus: 'SA' }]]) }),
    );

    assert.equal(days[0].dayType, null);
    assert.equal(days[0].dayTypeSource, PayrollDayTypeSource.unmapped);
    assert.equal(days[0].calendarCode, 'SA');
    assert.ok(days[0].anomalies.includes('calendar_code_unmapped'));
  });

  it('takvim yoksa calisma olaylarindan is gunu turetir', () => {
    const days = buildPayrollDays(
      input({ buckets: new Map([['2026-08-10', buckets('2026-08-10')]]) }),
    );

    assert.equal(days[0].dayType, PayrollDayType.work);
    assert.equal(days[0].dayTypeSource, PayrollDayTypeSource.events);
    assert.equal(days[0].workedMinutes, 480);
  });

  it('takvim de olay da yoksa bos gun sayar', () => {
    const days = buildPayrollDays(input());

    assert.equal(days[0].dayType, PayrollDayType.off);
    assert.equal(days[0].dayTypeSource, PayrollDayTypeSource.none);
    assert.equal(days[0].paid, false);
  });
});

describe('buildPayrollDays anomaliler', () => {
  it('takvim FT diyor ama tatil tablosunda yoksa isaretler', () => {
    const days = buildPayrollDays(
      input({ calendarByDate: new Map([['2026-08-10', { status: 'FT' }]]) }),
    );

    assert.ok(days[0].anomalies.includes('calendar_holiday_not_in_table'));
  });

  it('izin gununde calisma varsa isaretler', () => {
    const days = buildPayrollDays(
      input({
        calendarByDate: new Map([['2026-08-10', { status: 'UT' }]]),
        buckets: new Map([['2026-08-10', buckets('2026-08-10')]]),
      }),
    );

    assert.ok(days[0].anomalies.includes('worked_on_absence_day'));
  });

  it('Zeiterfassung anomalilerini tasir', () => {
    const days = buildPayrollDays(
      input({ anomaliesByDate: new Map([['2026-08-10', ['missing_clock_out']]]) }),
    );

    assert.ok(days[0].anomalies.includes('missing_clock_out'));
  });
});

describe('buildPayrollDays hedef gunu', () => {
  it('hafta sonunu ve tatili hedefe saymaz', () => {
    const days = buildPayrollDays(
      input({
        localDates: ['2026-08-08', '2026-08-09', '2026-08-10', '2026-08-11'],
        holidayDates: new Set(['2026-08-11']),
      }),
    );

    assert.deepEqual(
      days.map((day) => day.countsTowardTarget),
      [false, false, true, false], // Cmt, Paz, Pzt, tatil
    );
  });

  it('ofis takvimde Frei isaretlediyse hafta ici gunu hedefe saymaz', () => {
    // Vardiya sisteminde hafta ici serbest gun olabiliyor; duz Pzt–Cum
    // varsayimi o surucuyu her ay eksik gosterirdi.
    const days = buildPayrollDays(
      input({ calendarByDate: new Map([['2026-08-10', { status: 'FR' }]]) }),
    );

    assert.equal(days[0].dayType, PayrollDayType.off);
    assert.equal(days[0].countsTowardTarget, false);
  });

  it('izinsiz devamsizligi hedefe SAYAR', () => {
    const days = buildPayrollDays(
      input({
        calendarByDate: new Map([['2026-08-10', { status: 'WE', uiStatus: 'unent.Fehlen' }]]),
      }),
    );

    assert.equal(days[0].dayType, PayrollDayType.absence_unpaid);
    assert.equal(days[0].countsTowardTarget, true);
  });
});

function day(overrides: Partial<PayrollDayDraft> = {}): PayrollDayDraft {
  return {
    localDate: '2026-08-10',
    dayType: PayrollDayType.work,
    dayTypeSource: PayrollDayTypeSource.events,
    calendarCode: null,
    paid: true,
    workedMinutes: 0,
    breakMinutes: 0,
    nightMinutes: 0,
    nightCoreMinutes: 0,
    sundayMinutes: 0,
    holidayMinutes: 0,
    anomalies: [],
    countsTowardTarget: true,
    ...overrides,
  };
}

describe('buildPayrollEntryTotals', () => {
  const targets = { monthlyTargetMinutes: null, weeklyTargetMinutes: 2_400 }; // 40s → gunluk 480

  it('hedefi hedef gunlerinden turetir', () => {
    const days = [day(), day(), day({ countsTowardTarget: false })];

    const totals = buildPayrollEntryTotals(days, targets);

    assert.equal(totals.targetMinutes, 960); // 2 gun × 8 saat
  });

  it('hedefi asan sureyi fazla mesai, altinda kalani eksi bakiye yapar', () => {
    const over = buildPayrollEntryTotals([day({ workedMinutes: 600 })], targets);
    const under = buildPayrollEntryTotals([day({ workedMinutes: 360 })], targets);

    assert.equal(over.balanceMinutes, 120);
    assert.equal(over.overtimeMinutes, 120);
    assert.equal(over.regularMinutes, 480);

    // Eksi bakiye odenebilir bir sey degil: fazla mesai 0 kalir ama bakiye
    // negatif gorunur — ekrandaki −2h tam olarak bu.
    assert.equal(under.balanceMinutes, -120);
    assert.equal(under.overtimeMinutes, 0);
    assert.equal(under.regularMinutes, 360);
  });

  it('izin ve hastalik gununu hedefe karsi kredilendirir', () => {
    const days = [
      day({ workedMinutes: 480 }),
      day({ dayType: PayrollDayType.vacation, workedMinutes: 0 }),
      day({ dayType: PayrollDayType.sick, workedMinutes: 0 }),
    ];

    const totals = buildPayrollEntryTotals(days, targets);

    assert.equal(totals.targetMinutes, 1_440);
    assert.equal(totals.creditedMinutes, 960);
    // Izne cikan surucu eksi bakiyeyle gorunmemeli.
    assert.equal(totals.balanceMinutes, 0);
    assert.equal(totals.vacationDays, 1);
    assert.equal(totals.sickDays, 1);
  });

  it('izinsiz devamsizligi kredilendirmez, eksi bakiye birakir', () => {
    const days = [day({ dayType: PayrollDayType.absence_unpaid, workedMinutes: 0 })];

    const totals = buildPayrollEntryTotals(days, targets);

    assert.equal(totals.creditedMinutes, 0);
    assert.equal(totals.balanceMinutes, -480);
    assert.equal(totals.unpaidAbsenceDays, 1);
  });

  it('aylik hedef verilmisse gun sayisindan turetmez', () => {
    const days = [day({ workedMinutes: 480 }), day({ workedMinutes: 480 })];

    const totals = buildPayrollEntryTotals(days, {
      monthlyTargetMinutes: 10_080,
      weeklyTargetMinutes: 2_400,
    });

    assert.equal(totals.targetMinutes, 10_080);
  });

  it('gece, Pazar ve tatil kovalarini toplar', () => {
    const days = [
      day({ nightMinutes: 120, nightCoreMinutes: 60, sundayMinutes: 0, holidayMinutes: 0 }),
      day({ nightMinutes: 60, nightCoreMinutes: 0, sundayMinutes: 240, holidayMinutes: 90 }),
    ];

    const totals = buildPayrollEntryTotals(days, targets);

    assert.equal(totals.nightMinutes, 180);
    assert.equal(totals.nightCoreMinutes, 60);
    assert.equal(totals.sundayMinutes, 240);
    assert.equal(totals.holidayMinutes, 90);
  });

  it('eslenmemis gunleri sayar', () => {
    const days = [day(), day({ dayType: null, dayTypeSource: PayrollDayTypeSource.unmapped })];

    assert.equal(buildPayrollEntryTotals(days, targets).unmappedDays, 1);
  });
});

describe('localDatesOfMonth', () => {
  it('ayin butun gunlerini sirali verir', () => {
    const dates = localDatesOfMonth(2026, 2);

    assert.equal(dates.length, 28);
    assert.equal(dates[0], '2026-02-01');
    assert.equal(dates[27], '2026-02-28');
  });

  it('artik yili dogru sayar', () => {
    assert.equal(localDatesOfMonth(2028, 2).length, 29);
  });
});
