import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PayrollDayType, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_DAY_TYPE_MAPPINGS } from './core/day-type-mapping';
import { PayrollSettingsService } from './payroll-settings.service';

type MappingRow = { id: string; tenantId: string; calendarCode: string; dayType: PayrollDayType; paid: boolean };
type ProfileRow = {
  id: string;
  tenantId: string;
  driverId: string;
  externalPersonnelNumber: string;
  validFrom: Date;
  validTo: Date | null;
  costCenter: string | null;
  costUnit: string | null;
} & Record<string, unknown>;
type HolidayRow = { id: string; tenantId: string; date: Date; name: string; bundesland: string | null };
type CalendarRow = { status: string; uiStatus: string | null; date: Date };

type Store = {
  tenantProfiles: Array<Record<string, unknown>>;
  driverProfiles: ProfileRow[];
  drivers: Array<{ id: string; firstName: string; lastName: string; employeeNumber: string }>;
  mappings: MappingRow[];
  holidays: HolidayRow[];
  calendar: CalendarRow[];
};

function createFakePrisma(store: Store) {
  let sequence = 0;
  const nextId = (prefix: string) => `${prefix}-${(sequence += 1)}`;

  const client = {
    tenantPayrollProfile: {
      findFirst: async () => store.tenantProfiles[0] ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: nextId('tenant-profile'), ...data };
        store.tenantProfiles.push(row);
        return row;
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(store.tenantProfiles[0], data);
        return store.tenantProfiles[0];
      },
    },
    driver: {
      findMany: async () => store.drivers,
      findUnique: async ({ where }: { where: { id: string } }) =>
        store.drivers.find((driver) => driver.id === where.id) ?? null,
    },
    driverPayrollProfile: {
      findMany: async ({ where }: { where?: { driverId?: string } } = {}) =>
        store.driverProfiles.filter((row) => !where?.driverId || row.driverId === where.driverId),
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const number = where.externalPersonnelNumber as string | undefined;
        const notDriver = (where.driverId as { not?: string } | undefined)?.not;
        return (
          store.driverProfiles.find(
            (row) =>
              (number === undefined || row.externalPersonnelNumber === number) &&
              (notDriver === undefined || row.driverId !== notDriver),
          ) ?? null
        );
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: nextId('driver-profile'),
          validTo: null,
          ...data,
        } as unknown as ProfileRow;
        store.driverProfiles.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = store.driverProfiles.find((entry) => entry.id === where.id);
        if (!row) throw new Error('no row');
        Object.assign(row, data);
        return row;
      },
    },
    payrollDayTypeMapping: {
      findMany: async (args?: { select?: unknown }) =>
        args?.select ? store.mappings.map((row) => ({ calendarCode: row.calendarCode })) : store.mappings,
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
        for (const entry of data) {
          store.mappings.push({ id: nextId('mapping'), ...entry } as MappingRow);
        }
        return { count: data.length };
      },
      findFirst: async ({ where }: { where: { calendarCode: string } }) =>
        store.mappings.find((row) => row.calendarCode === where.calendarCode) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: nextId('mapping'), ...data } as MappingRow;
        store.mappings.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = store.mappings.find((entry) => entry.id === where.id);
        if (!row) throw new Error('no row');
        Object.assign(row, data);
        return row;
      },
    },
    calendarEvent: {
      findMany: async () => store.calendar,
    },
    publicHoliday: {
      findMany: async () => [...store.holidays].sort((a, b) => a.date.getTime() - b.date.getTime()),
      findFirst: async ({ where }: { where: { date: Date } }) =>
        store.holidays.find((row) => row.date.getTime() === where.date.getTime()) ?? null,
      findUnique: async ({ where }: { where: { id: string } }) =>
        store.holidays.find((row) => row.id === where.id) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: nextId('holiday'), ...data } as HolidayRow;
        store.holidays.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = store.holidays.find((entry) => entry.id === where.id);
        if (!row) throw new Error('no row');
        Object.assign(row, data);
        return row;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const index = store.holidays.findIndex((entry) => entry.id === where.id);
        const [removed] = store.holidays.splice(index, 1);
        return removed;
      },
    },
  };

  return {
    ...client,
    $transaction: async (fn: (tx: typeof client) => Promise<unknown>) => fn(client),
  };
}

function createStore(overrides: Partial<Store> = {}): Store {
  return {
    tenantProfiles: [],
    driverProfiles: [],
    drivers: [
      { id: 'driver-a', firstName: 'Dieter', lastName: 'Albrecht', employeeNumber: 'P-001' },
      { id: 'driver-b', firstName: 'Adar', lastName: 'Yilmaz', employeeNumber: 'P-002' },
    ],
    mappings: [],
    holidays: [],
    calendar: [],
    ...overrides,
  };
}

function createService(store: Store): PayrollSettingsService {
  return new PayrollSettingsService(
    createFakePrisma(store) as unknown as PrismaService,
    { logAction: async () => undefined } as unknown as AuditService,
  );
}

describe('PayrollSettingsService tenant profile', () => {
  it('ilk kayitta olusturur, ikincide gunceller', async () => {
    const store = createStore();
    const service = createService(store);

    await service.upsertTenantProfile('tenant-a', { datevClientNumber: '12345' }, 'user-a');
    await service.upsertTenantProfile('tenant-a', { datevClientNumber: '54321' }, 'user-a');

    assert.equal(store.tenantProfiles.length, 1);
    assert.equal(store.tenantProfiles[0].datevClientNumber, '54321');
  });

  it('gece penceresi gece yarisini asabilir', async () => {
    const store = createStore();
    const service = createService(store);

    // 20:00 → 06:00: start > end ama gecerli. start<end araniyor olsaydi
    // Almanya'daki standart gece penceresi reddedilirdi.
    const row = await service.upsertTenantProfile(
      'tenant-a',
      { nightWindowStartMinute: 1200, nightWindowEndMinute: 360 },
      'user-a',
    );

    assert.equal((row as { nightWindowStartMinute: number }).nightWindowStartMinute, 1200);
  });

  it("DATEV alanlarini KAYDEDER — DTO'da eksik kalirsa sessizce yutulurdu", async () => {
    // Bu testin sebebi somut: tachoBreakToleranceMinutes ve payrollTargetSystem
    // bir sure DTO'da yoktu; ekran gonderiyordu, sunucu sessizce atiyordu ve ne
    // tsc ne de baska bir test bunu yakaliyordu.
    const store = createStore();
    const service = createService(store);

    await service.upsertTenantProfile(
      'tenant-a',
      { payrollTargetSystem: 'datev_lodas', tachoBreakToleranceMinutes: 25 },
      'user-a',
    );

    assert.equal(store.tenantProfiles[0].payrollTargetSystem, 'datev_lodas');
    assert.equal(store.tenantProfiles[0].tachoBreakToleranceMinutes, 25);
  });

  it('bos gece penceresini reddeder', async () => {
    const service = createService(createStore());

    await assert.rejects(
      service.upsertTenantProfile(
        'tenant-a',
        { nightWindowStartMinute: 1200, nightWindowEndMinute: 1200 },
        'user-a',
      ),
      (error: unknown) => error instanceof BadRequestException,
    );
  });
});

describe('PayrollSettingsService driver profiles', () => {
  it('profili olmayan surucuyu de listeler ve hazir degil isaretler', async () => {
    const store = createStore();
    const service = createService(store);
    await service.upsertDriverProfile('tenant-a', 'driver-a', { externalPersonnelNumber: '1001' }, 'user-a');

    const rows = await service.listDriverProfiles();

    assert.equal(rows.length, 2);
    assert.equal(rows.find((row) => row.driverId === 'driver-a')?.ready, true);
    assert.equal(rows.find((row) => row.driverId === 'driver-b')?.ready, false);
  });

  it('ayni personel numarasini ikinci suruculye vermeyi reddeder', async () => {
    // Izin verilseydi iki kisinin saatleri DATEV'de tek satirda birlesirdi.
    const store = createStore();
    const service = createService(store);
    await service.upsertDriverProfile('tenant-a', 'driver-a', { externalPersonnelNumber: '1001' }, 'user-a');

    await assert.rejects(
      service.upsertDriverProfile('tenant-a', 'driver-b', { externalPersonnelNumber: '1001' }, 'user-a'),
      (error: unknown) => error instanceof ConflictException,
    );

    assert.equal(store.driverProfiles.length, 1);
  });

  it('kendi numarasini korurken profilini guncelleyebilir', async () => {
    const store = createStore();
    const service = createService(store);
    await service.upsertDriverProfile('tenant-a', 'driver-a', { externalPersonnelNumber: '1001' }, 'user-a');

    const updated = await service.upsertDriverProfile(
      'tenant-a',
      'driver-a',
      { externalPersonnelNumber: '1001', costCenter: 'KST-100' },
      'user-a',
    );

    assert.equal(updated.costCenter, 'KST-100');
    assert.equal(store.driverProfiles.length, 1);
  });

  it('bilinmeyen surucuyu reddeder', async () => {
    const service = createService(createStore());

    await assert.rejects(
      service.upsertDriverProfile('tenant-a', 'driver-x', { externalPersonnelNumber: '1001' }, 'user-a'),
      (error: unknown) => error instanceof NotFoundException,
    );
  });
});

describe('PayrollSettingsService profil surumleme', () => {
  const JAN = new Date('2026-01-15T00:00:00.000Z');
  const JUL = new Date('2026-07-15T00:00:00.000Z');

  it('personel numarasi degisince YENI SURUM acar, eskisini kapatir', async () => {
    // Ustune yazmak, gecmis bir donemi yeniden uretirken bugunun numarasini
    // kullanmak demek olurdu.
    const store = createStore();
    const service = createService(store);
    await service.upsertDriverProfile('tenant-a', 'driver-a', { externalPersonnelNumber: '1001' }, 'user-a', JAN);
    await service.upsertDriverProfile('tenant-a', 'driver-a', { externalPersonnelNumber: '2002' }, 'user-a', JUL);

    assert.equal(store.driverProfiles.length, 2);
    const [first, second] = store.driverProfiles;
    assert.equal(first.externalPersonnelNumber, '1001');
    assert.equal(first.validTo?.toISOString().slice(0, 10), '2026-07-14');
    assert.equal(second.externalPersonnelNumber, '2002');
    assert.equal(second.validTo, null);
  });

  it('DATEV disi alan degisiminde surum ACMAZ', async () => {
    // Her hedef sure degisikligi icin surum acmak gecmisi kalabaliklastirirdi.
    const store = createStore();
    const service = createService(store);
    await service.upsertDriverProfile('tenant-a', 'driver-a', { externalPersonnelNumber: '1001' }, 'user-a', JAN);
    await service.upsertDriverProfile(
      'tenant-a',
      'driver-a',
      { externalPersonnelNumber: '1001', weeklyTargetMinutes: 1_800 },
      'user-a',
      JUL,
    );

    assert.equal(store.driverProfiles.length, 1);
    assert.equal(store.driverProfiles[0].weeklyTargetMinutes, 1_800);
  });

  it('ayni gun ikinci duzeltmede aralik cakistirmaz', async () => {
    const store = createStore();
    const service = createService(store);
    await service.upsertDriverProfile('tenant-a', 'driver-a', { externalPersonnelNumber: '1001' }, 'user-a', JAN);
    await service.upsertDriverProfile('tenant-a', 'driver-a', { externalPersonnelNumber: '1009' }, 'user-a', JAN);

    assert.equal(store.driverProfiles.length, 1);
    assert.equal(store.driverProfiles[0].externalPersonnelNumber, '1009');
  });

  it('listede O ANDA gecerli surumu verir', async () => {
    const store = createStore();
    const service = createService(store);
    await service.upsertDriverProfile('tenant-a', 'driver-a', { externalPersonnelNumber: '1001' }, 'user-a', JAN);
    await service.upsertDriverProfile('tenant-a', 'driver-a', { externalPersonnelNumber: '2002' }, 'user-a', JUL);

    const inMarch = await service.listDriverProfiles(new Date('2026-03-01T00:00:00.000Z'));
    const inAugust = await service.listDriverProfiles(new Date('2026-08-01T00:00:00.000Z'));

    assert.equal(inMarch.find((r) => r.driverId === 'driver-a')?.profile?.externalPersonnelNumber, '1001');
    assert.equal(inAugust.find((r) => r.driverId === 'driver-a')?.profile?.externalPersonnelNumber, '2002');
    assert.equal(inAugust.find((r) => r.driverId === 'driver-a')?.versionCount, 2);
  });
});

describe('PayrollSettingsService day type mappings', () => {
  it('ilk okumada varsayilanlari tohumlar', async () => {
    const store = createStore();
    const service = createService(store);

    const result = await service.listDayTypeMappings('tenant-a');

    assert.equal(result.mappings.length, DEFAULT_DAY_TYPE_MAPPINGS.length);
    assert.equal(
      result.mappings.find((row) => row.calendarCode === 'UT')?.dayType,
      PayrollDayType.vacation,
    );
  });

  it('tenant kendi kararini verdiyse varsayilan onu geri almaz', async () => {
    const store = createStore();
    const service = createService(store);
    await service.upsertDayTypeMapping(
      'tenant-a',
      { calendarCode: 'SCH', dayType: PayrollDayType.off, paid: false },
      'user-a',
    );

    const result = await service.listDayTypeMappings('tenant-a');

    assert.equal(result.mappings.find((row) => row.calendarCode === 'SCH')?.dayType, PayrollDayType.off);
    assert.equal(result.mappings.filter((row) => row.calendarCode === 'SCH').length, 1);
  });

  it('takvimde kullanilan ama eslenmemis kodu raporlar', async () => {
    const store = createStore({
      calendar: [
        { status: 'UT', uiStatus: null, date: new Date() },
        { status: 'AB', uiStatus: 'SA', date: new Date() },
      ],
    });
    const service = createService(store);

    const result = await service.listDayTypeMappings('tenant-a');

    // 'SA' → 'AB' zincirinin hicbir halkasi eslenmemis; ince kod raporlanir.
    assert.deepEqual(result.unmappedCodes, ['SA']);
  });

  it('ince kod eslenmese de enum kodu eslesiyorsa eksik saymaz', async () => {
    const store = createStore({
      calendar: [{ status: 'US', uiStatus: 'SU', date: new Date() }],
    });
    const service = createService(store);

    const result = await service.listDayTypeMappings('tenant-a');

    assert.deepEqual(result.unmappedCodes, []);
  });

  it('hesap katmani icin kod → kural haritasi verir', async () => {
    const service = createService(createStore());

    const rules = await service.loadDayTypeRules('tenant-a');

    assert.equal(rules.get('KT')?.dayType, PayrollDayType.sick);
    assert.equal(rules.get('unent.Fehlen')?.paid, false);
    assert.equal(rules.has('AB'), false);
  });
});

describe('PayrollSettingsService holidays', () => {
  it('tarihi gun basina normalize eder ve ayni gunu tekrar yazmaz', async () => {
    const store = createStore();
    const service = createService(store);

    await service.upsertHoliday('tenant-a', { date: '2026-05-01T09:30:00.000Z', name: 'Tag der Arbeit' }, 'user-a');
    await service.upsertHoliday('tenant-a', { date: '2026-05-01', name: 'Maifeiertag' }, 'user-a');

    assert.equal(store.holidays.length, 1);
    assert.equal(store.holidays[0].name, 'Maifeiertag');
    assert.equal(store.holidays[0].date.toISOString(), '2026-05-01T00:00:00.000Z');
  });

  it('gecersiz tarihi reddeder', async () => {
    const service = createService(createStore());

    await assert.rejects(
      service.upsertHoliday('tenant-a', { date: 'kein Datum', name: 'X' }, 'user-a'),
      (error: unknown) => error instanceof BadRequestException,
    );
  });

  it('yila gore filtrelerken gecersiz yili reddeder', async () => {
    const service = createService(createStore());

    await assert.rejects(
      service.listHolidays('abcd'),
      (error: unknown) => error instanceof BadRequestException,
    );
  });

  it('olmayan tatili silmeye calisirsa reddeder', async () => {
    const service = createService(createStore());

    await assert.rejects(
      service.deleteHoliday('holiday-x', 'user-a'),
      (error: unknown) => error instanceof NotFoundException,
    );
  });
});
