import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  PayrollDayType,
  PayrollDayTypeSource,
  PayrollEntryKind,
  PayrollPeriodStatus,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { PayrollPeriodService } from './payroll-period.service';
import { PayrollSettingsService } from './payroll-settings.service';
import { DEFAULT_DAY_TYPE_MAPPINGS, type DayTypeRule } from './core/day-type-mapping';

type EventRow = {
  id: string;
  type: string;
  occurredAt: Date;
  createdAt: Date;
  supersedesEventId: string | null;
};

type SessionRow = { id: string; driverId: string; timeEvents: EventRow[] };
type CalendarRow = { driverId: string; date: Date; status: string; uiStatus: string | null };

type Store = {
  periods: Array<Record<string, unknown>>;
  sessions: SessionRow[];
  calendar: CalendarRow[];
  holidays: Array<{ date: Date }>;
  driverProfiles: Array<Record<string, unknown>>;
  days: Array<Record<string, unknown>>;
  entries: Array<Record<string, unknown>>;
};

let eventSeq = 0;
function event(type: string, iso: string): EventRow {
  eventSeq += 1;
  return {
    id: `event-${eventSeq}`,
    type,
    occurredAt: new Date(iso),
    createdAt: new Date(1_700_000_000_000 + eventSeq),
    supersedesEventId: null,
  };
}

/** 2026-08-10 Pazartesi, yerel 07:00–16:00, 45 dk mola (UTC+2). */
function weekdayShift(driverId: string, id = 'session-a'): SessionRow {
  return {
    id,
    driverId,
    timeEvents: [
      event('clock_in', '2026-08-10T05:00:00.000Z'),
      event('break_start', '2026-08-10T10:00:00.000Z'),
      event('break_end', '2026-08-10T10:45:00.000Z'),
      event('clock_out', '2026-08-10T14:00:00.000Z'),
    ],
  };
}

/**
 * Prisma `DbNull` sentinel'ini okurken `null` olarak dondurur — gercek istemci
 * de boyle davraniyor. Onay kapisi "profil snapshot'i yok" kontrolunu buna
 * dayandirdigi icin sahte istemcinin bunu taklit etmesi sart.
 */
function normalizeDbNull(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      value === Prisma.DbNull || value === Prisma.JsonNull ? null : value,
    ]),
  );
}

function createFakePrisma(store: Store) {
  let sequence = 0;
  const nextId = () => `row-${(sequence += 1)}`;

  const client = {
    payrollPeriod: {
      findFirst: async ({ where }: { where: { year: number; month: number } }) =>
        store.periods.find((row) => row.year === where.year && row.month === where.month) ?? null,
      findUnique: async ({ where }: { where: { id: string } }) =>
        store.periods.find((row) => row.id === where.id) ?? null,
      findMany: async () => store.periods,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: nextId(), status: PayrollPeriodStatus.draft, ...data };
        store.periods.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = store.periods.find((entry) => entry.id === where.id);
        if (!row) throw new Error('no period');
        const { approvedBy, ...rest } = data as Record<string, unknown> & {
          approvedBy?: { connect: { id: string } };
        };
        Object.assign(row, rest);
        if (approvedBy) row.approvedById = approvedBy.connect.id;
        return row;
      },
    },
    workSession: { findMany: async () => store.sessions },
    calendarEvent: { findMany: async () => store.calendar },
    publicHoliday: { findMany: async () => store.holidays },
    driverPayrollProfile: { findMany: async () => store.driverProfiles },
    payrollDay: {
      findMany: async ({ where }: { where: { periodId: string; driverId: string } }) =>
        store.days.filter(
          (row) => row.periodId === where.periodId && row.driverId === where.driverId,
        ),
      count: async ({ where }: { where: Record<string, unknown> }) =>
        store.days.filter((row) =>
          Object.entries(where).every(([key, value]) => row[key] === value),
        ).length,
      deleteMany: async ({ where }: { where: { periodId: string } }) => {
        store.days = store.days.filter((row) => row.periodId !== where.periodId);
        return { count: 0 };
      },
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
        store.days.push(...data.map(normalizeDbNull));
        return { count: data.length };
      },
    },
    payrollEntry: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        store.entries.filter((row) =>
          Object.entries(where).every(([key, value]) => row[key] === value),
        ),
      deleteMany: async ({ where }: { where: { periodId: string } }) => {
        store.entries = store.entries.filter((row) => row.periodId !== where.periodId);
        return { count: 0 };
      },
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
        store.entries.push(...data.map(normalizeDbNull));
        return { count: data.length };
      },
    },
  };

  return {
    ...client,
    payrollPeriodWithEntries: null,
    $transaction: async (fn: (tx: typeof client) => Promise<unknown>) => fn(client),
  };
}

function createStore(overrides: Partial<Store> = {}): Store {
  return {
    periods: [
      {
        id: 'period-a',
        tenantId: 'tenant-a',
        year: 2026,
        month: 8,
        status: PayrollPeriodStatus.draft,
      },
    ],
    sessions: [],
    calendar: [],
    holidays: [],
    driverProfiles: [
      {
        driverId: 'driver-a',
        datevPersonnelNumber: '1001',
        weeklyTargetMinutes: 2_400,
        monthlyTargetMinutes: null,
        costCenter: 'KST-1',
        costUnit: null,
        employmentType: 'full_time',
      },
    ],
    days: [],
    entries: [],
    ...overrides,
  };
}

function createService(store: Store): PayrollPeriodService {
  const prisma = createFakePrisma(store) as unknown as PrismaService;
  const settings = {
    getTenantProfile: async () => ({
      nightWindowStartMinute: 1_200,
      nightWindowEndMinute: 360,
      nightCoreStartMinute: 0,
      nightCoreEndMinute: 240,
      defaultWeeklyTargetMinutes: 2_400,
    }),
    loadDayTypeRules: async (): Promise<Map<string, DayTypeRule>> =>
      new Map(
        DEFAULT_DAY_TYPE_MAPPINGS.map((entry) => [
          entry.calendarCode,
          { dayType: entry.dayType, paid: entry.paid },
        ]),
      ),
  } as unknown as PayrollSettingsService;

  const service = new PayrollPeriodService(
    prisma,
    { logAction: async () => undefined } as unknown as AuditService,
    settings,
  );
  // getPeriod'un include'unu sahte istemci desteklemiyor; hesaplama sonucu
  // dogrudan store'dan okunuyor.
  service.getPeriod = (async (id: string) =>
    store.periods.find((row) => row.id === id)) as PayrollPeriodService['getPeriod'];
  return service;
}

function dayOf(store: Store, localDate: string, driverId = 'driver-a') {
  return store.days.find(
    (row) =>
      row.driverId === driverId &&
      (row.date as Date).toISOString().slice(0, 10) === localDate,
  );
}

function entryOf(store: Store, driverId = 'driver-a') {
  return store.entries.find((row) => row.driverId === driverId);
}

describe('PayrollPeriodService hesaplama', () => {
  it('vardiyayi gun satirina ve donem kalemine cevirir', async () => {
    const store = createStore({ sessions: [weekdayShift('driver-a')] });
    const service = createService(store);

    await service.recomputePeriod('period-a', 'user-a', new Date('2026-09-01T00:00:00.000Z'));

    // Ayin butun gunleri satirlaniyor, calisilmayanlar dahil.
    assert.equal(store.days.filter((row) => row.driverId === 'driver-a').length, 31);

    const workday = dayOf(store, '2026-08-10');
    assert.equal(workday?.workedMinutes, 495); // 07:00–16:00 eksi 45 dk mola
    assert.equal(workday?.breakMinutes, 45);
    assert.equal(workday?.dayType, PayrollDayType.work);
    assert.equal(workday?.dayTypeSource, PayrollDayTypeSource.events);

    const entry = entryOf(store);
    assert.equal(entry?.workedMinutes, 495);
    assert.equal(entry?.kind, PayrollEntryKind.regular);
    // Agustos 2026'da 21 hafta ici gun × 8 saat.
    assert.equal(entry?.targetMinutes, 21 * 480);
  });

  it('gece yarisini asan vardiyayi iki gune boler ve gece kovasini doldurur', async () => {
    // 2026-08-10 22:00 → 2026-08-11 04:00 yerel.
    const store = createStore({
      sessions: [
        {
          id: 'session-night',
          driverId: 'driver-a',
          timeEvents: [
            event('clock_in', '2026-08-10T20:00:00.000Z'),
            event('clock_out', '2026-08-11T02:00:00.000Z'),
          ],
        },
      ],
    });
    const service = createService(store);

    await service.recomputePeriod('period-a', 'user-a', new Date('2026-09-01T00:00:00.000Z'));

    assert.equal(dayOf(store, '2026-08-10')?.workedMinutes, 120);
    assert.equal(dayOf(store, '2026-08-11')?.workedMinutes, 240);
    assert.equal(dayOf(store, '2026-08-11')?.nightCoreMinutes, 240);
    assert.equal(entryOf(store)?.nightMinutes, 360);
  });

  it('takvim izin gununu okur ve hedefe karsi kredilendirir', async () => {
    const store = createStore({
      calendar: [
        { driverId: 'driver-a', date: new Date('2026-08-10T00:00:00.000Z'), status: 'UT', uiStatus: null },
      ],
    });
    const service = createService(store);

    await service.recomputePeriod('period-a', 'user-a', new Date('2026-09-01T00:00:00.000Z'));

    assert.equal(dayOf(store, '2026-08-10')?.dayType, PayrollDayType.vacation);
    assert.equal(entryOf(store)?.vacationDays, 1);
    assert.equal(entryOf(store)?.creditedMinutes, 480);
  });

  it('yasal tatili takvimin onunde tutar ve hedeften dusurur', async () => {
    const store = createStore({
      holidays: [{ date: new Date('2026-08-10T00:00:00.000Z') }],
    });
    const service = createService(store);

    await service.recomputePeriod('period-a', 'user-a', new Date('2026-09-01T00:00:00.000Z'));

    assert.equal(dayOf(store, '2026-08-10')?.dayTypeSource, PayrollDayTypeSource.holiday_table);
    // 21 hafta ici gunun biri tatil oldu.
    assert.equal(entryOf(store)?.targetMinutes, 20 * 480);
  });

  it('eslenmemis takvim kodunda gun tipini bos birakir', async () => {
    const store = createStore({
      calendar: [
        { driverId: 'driver-a', date: new Date('2026-08-10T00:00:00.000Z'), status: 'AB', uiStatus: 'SA' },
      ],
    });
    const service = createService(store);

    await service.recomputePeriod('period-a', 'user-a', new Date('2026-09-01T00:00:00.000Z'));

    const day = dayOf(store, '2026-08-10');
    assert.equal(day?.dayType, null);
    assert.equal(day?.dayTypeSource, PayrollDayTypeSource.unmapped);
  });

  it('ayni gunun iki vardiyasini toplar', async () => {
    const store = createStore({
      sessions: [
        weekdayShift('driver-a', 'session-1'),
        {
          id: 'session-2',
          driverId: 'driver-a',
          timeEvents: [
            event('clock_in', '2026-08-10T16:00:00.000Z'),
            event('clock_out', '2026-08-10T18:00:00.000Z'),
          ],
        },
      ],
    });
    const service = createService(store);

    await service.recomputePeriod('period-a', 'user-a', new Date('2026-09-01T00:00:00.000Z'));

    assert.equal(dayOf(store, '2026-08-10')?.workedMinutes, 495 + 120);
  });

  it('profili olmayan surucuyu de hesaplar ama snapshot bos kalir', async () => {
    const store = createStore({
      sessions: [weekdayShift('driver-b')],
      driverProfiles: [],
    });
    const service = createService(store);

    await service.recomputePeriod('period-a', 'user-a', new Date('2026-09-01T00:00:00.000Z'));

    const entry = entryOf(store, 'driver-b');
    assert.ok(entry);
    assert.equal(entry?.driverProfileSnapshot, null);
  });

  it('yeniden hesaplama eski satirlari birakmaz', async () => {
    const store = createStore({ sessions: [weekdayShift('driver-a')] });
    const service = createService(store);

    await service.recomputePeriod('period-a', 'user-a', new Date('2026-09-01T00:00:00.000Z'));
    await service.recomputePeriod('period-a', 'user-a', new Date('2026-09-01T00:00:00.000Z'));

    assert.equal(store.days.length, 31);
    assert.equal(store.entries.length, 1);
  });
});

describe('PayrollPeriodService yasam dongusu', () => {
  it('draft → review → approved yolunu izler', async () => {
    const store = createStore({ sessions: [weekdayShift('driver-a')] });
    const service = createService(store);
    await service.recomputePeriod('period-a', 'user-a', new Date('2026-09-01T00:00:00.000Z'));

    await service.submitForReview('period-a', 'user-a');
    assert.equal(store.periods[0].status, PayrollPeriodStatus.review);

    await service.approve('period-a', 'user-a');
    assert.equal(store.periods[0].status, PayrollPeriodStatus.approved);
    assert.equal(store.periods[0].approvedById, 'user-a');
  });

  it('onaylanmis donemi yeniden hesaplamaz', async () => {
    const store = createStore();
    store.periods[0].status = PayrollPeriodStatus.approved;
    const service = createService(store);

    await assert.rejects(
      service.recomputePeriod('period-a', 'user-a'),
      (error: unknown) =>
        error instanceof ConflictException &&
        (error.getResponse() as { code: string }).code === 'payroll_period_frozen',
    );
  });

  it('onaylanmis donemi geri acmaz', async () => {
    const store = createStore();
    store.periods[0].status = PayrollPeriodStatus.approved;
    const service = createService(store);

    await assert.rejects(
      service.reopen('period-a', 'user-a'),
      (error: unknown) =>
        error instanceof ConflictException &&
        (error.getResponse() as { code: string }).code === 'payroll_period_not_reopenable',
    );
  });

  it('eslenmemis gun varken onaylamaz', async () => {
    const store = createStore({
      calendar: [
        { driverId: 'driver-a', date: new Date('2026-08-10T00:00:00.000Z'), status: 'AB', uiStatus: 'SA' },
      ],
    });
    const service = createService(store);
    await service.recomputePeriod('period-a', 'user-a', new Date('2026-09-01T00:00:00.000Z'));
    await service.submitForReview('period-a', 'user-a');

    await assert.rejects(
      service.approve('period-a', 'user-a'),
      (error: unknown) =>
        (error as { getResponse(): { code: string } }).getResponse().code ===
        'payroll_period_has_unmapped_days',
    );

    assert.equal(store.periods[0].status, PayrollPeriodStatus.review);
  });

  it('personel numarasi olmayan surucu varken onaylamaz', async () => {
    // Izin verilseydi DATEV satiri kimsiz kalirdi.
    const store = createStore({ sessions: [weekdayShift('driver-b')], driverProfiles: [] });
    const service = createService(store);
    await service.recomputePeriod('period-a', 'user-a', new Date('2026-09-01T00:00:00.000Z'));
    await service.submitForReview('period-a', 'user-a');

    await assert.rejects(
      service.approve('period-a', 'user-a'),
      (error: unknown) =>
        (error as { getResponse(): { code: string } }).getResponse().code ===
        'payroll_period_driver_profile_missing',
    );
  });

  it('taslak degilken incelemeye gondermez', async () => {
    const store = createStore();
    store.periods[0].status = PayrollPeriodStatus.review;
    const service = createService(store);

    await assert.rejects(
      service.submitForReview('period-a', 'user-a'),
      (error: unknown) => error instanceof ConflictException,
    );
  });

  it('bilinmeyen donemi reddeder', async () => {
    const service = createService(createStore());

    await assert.rejects(
      service.recomputePeriod('period-x', 'user-a'),
      (error: unknown) => error instanceof NotFoundException,
    );
  });
});

