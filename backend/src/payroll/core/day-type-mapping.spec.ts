import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PayrollDayType } from '@prisma/client';
import {
  calendarCodesOf,
  DEFAULT_DAY_TYPE_MAPPINGS,
  resolveCalendarDayType,
  type DayTypeRule,
} from './day-type-mapping';

function defaultRules(): Map<string, DayTypeRule> {
  return new Map(
    DEFAULT_DAY_TYPE_MAPPINGS.map((entry) => [
      entry.calendarCode,
      { dayType: entry.dayType, paid: entry.paid },
    ]),
  );
}

describe('DEFAULT_DAY_TYPE_MAPPINGS', () => {
  it('AB kodunu BILEREK eslemez', () => {
    // Bes ayri seyin cop kutusu; ucretli ya da ucretsiz varsaymak iki yone de
    // yanlis duser. Ekranda "eslenmemis" uyarisi olarak cikmali.
    assert.equal(
      DEFAULT_DAY_TYPE_MAPPINGS.some((entry) => entry.calendarCode === 'AB'),
      false,
    );
  });

  it('ayni kodu iki kez tanimlamaz', () => {
    const codes = DEFAULT_DAY_TYPE_MAPPINGS.map((entry) => entry.calendarCode);
    assert.equal(new Set(codes).size, codes.length);
  });

  it('ucretsiz sayilan yalnizca off ve izinsiz devamsizliktir', () => {
    const unpaid = DEFAULT_DAY_TYPE_MAPPINGS.filter((entry) => !entry.paid).map(
      (entry) => entry.dayType,
    );
    assert.deepEqual(
      [...new Set(unpaid)].sort(),
      [PayrollDayType.absence_unpaid, PayrollDayType.off].sort(),
    );
  });
});

describe('resolveCalendarDayType', () => {
  it('izin gununu takvim kodundan cozer', () => {
    const resolved = resolveCalendarDayType({ status: 'UT' }, defaultRules());

    assert.deepEqual(resolved, {
      dayType: PayrollDayType.vacation,
      paid: true,
      calendarCode: 'UT',
      matchedOn: 'status',
    });
  });

  it('izinsiz devamsizligi hafta sonundan uiStatus ile ayirir', () => {
    // Ikisi de CalendarStatus.WE tasiyor; ayirt eden tek sey uiStatus.
    const rules = defaultRules();

    const weekend = resolveCalendarDayType({ status: 'WE' }, rules);
    const unexcused = resolveCalendarDayType({ status: 'WE', uiStatus: 'unent.Fehlen' }, rules);

    assert.equal(weekend?.dayType, PayrollDayType.off);
    assert.equal(weekend?.paid, false);
    assert.equal(unexcused?.dayType, PayrollDayType.absence_unpaid);
    assert.equal(unexcused?.paid, false);
    assert.equal(unexcused?.matchedOn, 'ui_status');
  });

  it('eslenmemis uiStatus icin enum koduna duser', () => {
    // UI 'SU' (Sonderurlaub) gonderir, kalici kod 'US'. Tohumda 'SU' yok ama
    // 'US' var; dusme olmasa bu gun eslenmemis gorunurdu.
    const resolved = resolveCalendarDayType({ status: 'US', uiStatus: 'SU' }, defaultRules());

    assert.equal(resolved?.dayType, PayrollDayType.vacation);
    assert.equal(resolved?.calendarCode, 'US');
    assert.equal(resolved?.matchedOn, 'status');
  });

  it('hicbir kod eslesmezse null doner, varsayilana dusmez', () => {
    assert.equal(resolveCalendarDayType({ status: 'AB' }, defaultRules()), null);
    assert.equal(resolveCalendarDayType({ status: 'AB', uiStatus: 'SA' }, defaultRules()), null);
  });

  it('tenant kendi eslemesini koyunca varsayilani ezer', () => {
    const rules = defaultRules();
    rules.set('SCH', { dayType: PayrollDayType.off, paid: false });

    const resolved = resolveCalendarDayType({ status: 'SCH' }, rules);
    assert.equal(resolved?.dayType, PayrollDayType.off);
  });
});

describe('calendarCodesOf', () => {
  it('once ince kodu, sonra enum kodunu verir', () => {
    assert.deepEqual(calendarCodesOf({ status: 'WE', uiStatus: 'unent.Fehlen' }), [
      'unent.Fehlen',
      'WE',
    ]);
  });

  it('uiStatus yoksa veya ayniysa tek kod verir', () => {
    assert.deepEqual(calendarCodesOf({ status: 'UT' }), ['UT']);
    assert.deepEqual(calendarCodesOf({ status: 'UT', uiStatus: 'UT' }), ['UT']);
    assert.deepEqual(calendarCodesOf({ status: 'UT', uiStatus: '  ' }), ['UT']);
  });
});
