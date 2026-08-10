import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  PayrollEntryKind,
  PayrollExportFormat,
  PayrollPeriodStatus,
  PayrollMovementType,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { PayrollExportStorageService } from '../storage/payroll-export-storage.service';
import { PayrollExportService } from './payroll-export.service';
import { PayrollPeriodService } from './payroll-period.service';
import { PayrollSettingsService } from './payroll-settings.service';

type PeriodRow = {
  id: string;
  tenantId: string;
  year: number;
  month: number;
  status: PayrollPeriodStatus;
  approvedAt: Date | null;
  lockedAt: Date | null;
};

type EntryRow = Record<string, unknown> & {
  id: string;
  periodId: string;
  driverId: string;
  kind: PayrollEntryKind;
};

type Store = {
  periods: PeriodRow[];
  entries: EntryRow[];
  events: Array<{ id: string; driverId: string; occurredAt: Date; createdAt: Date }>;
  mappings: Array<{
    payrollSystem: 'lodas' | 'lohn_und_gehalt';
    movementType: PayrollMovementType;
    datevWageTypeNumber: string;
    enabled: boolean;
    validFrom: Date;
    validTo: Date | null;
    costCenter: string | null;
    costUnit: string | null;
  }>;
  profiles: Array<{
    driverId: string;
    datevPersonnelNumber: string;
    datevPayrollSystem: 'lodas' | 'lohn_und_gehalt' | null;
    costCenter: string | null;
    costUnit: string | null;
    validFrom: Date;
    validTo: Date | null;
  }>;
  days: Array<{ driverId: string; anomalies: string[] | null }>;
  exports: Array<Record<string, unknown>>;
  saved: Array<{ fileName: string; contents: string }>;
  /** computePeriod'un dondurecegi taze kalemler. */
  freshEntries: Array<Record<string, unknown>>;
};

const PROFILE_SNAPSHOT = {
  datevPersonnelNumber: '1001',
  costCenter: 'KST-1',
  costUnit: null,
};

function wageMapping(
  movementType: PayrollMovementType,
  datevWageTypeNumber: string,
): Store['mappings'][number] {
  return {
    payrollSystem: 'lodas',
    movementType,
    datevWageTypeNumber,
    enabled: true,
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
    validTo: null,
    costCenter: null,
    costUnit: null,
  };
}

function period(overrides: Partial<PeriodRow> = {}): PeriodRow {
  return {
    id: 'period-jul',
    tenantId: 'tenant-a',
    year: 2026,
    month: 7,
    status: PayrollPeriodStatus.approved,
    approvedAt: new Date('2026-08-05T10:00:00.000Z'),
    lockedAt: null,
    ...overrides,
  };
}

function entry(overrides: Partial<EntryRow> = {}): EntryRow {
  return {
    id: 'entry-1',
    periodId: 'period-jul',
    driverId: 'driver-a',
    kind: PayrollEntryKind.regular,
    targetMinutes: 10_080,
    workedMinutes: 10_080,
    creditedMinutes: 0,
    overtimeMinutes: 0,
    regularMinutes: 10_080,
    balanceMinutes: 0,
    nightMinutes: 0,
    nightCoreMinutes: 0,
    sundayMinutes: 0,
    holidayMinutes: 0,
    vacationDays: 0,
    sickDays: 0,
    unpaidAbsenceDays: 0,
    correctsPeriodId: null,
    correctionThroughAt: null,
    driverProfileSnapshot: PROFILE_SNAPSHOT,
    driver: { firstName: 'Dieter', lastName: 'Albrecht' },
    correctsPeriod: null,
    ...overrides,
  };
}

function matches(row: Record<string, unknown>, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) return true;
    if (value !== null && typeof value === 'object') return true; // aralik filtreleri ayrica ele aliniyor
    return row[key] === value;
  });
}

function createFakePrisma(store: Store) {
  let sequence = 0;
  const client = {
    payrollPeriod: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        store.periods.find((row) => row.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = store.periods.find((entry) => entry.id === where.id);
        if (!row) throw new Error('no period');
        Object.assign(row, data);
        return row;
      },
    },
    payrollEntry: {
      findMany: async ({ where }: { where?: Record<string, unknown> } = {}) =>
        store.entries.filter((row) => matches(row, where)),
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
        store.entries.push(
          ...data.map((row) => ({ ...row, id: `entry-new-${(sequence += 1)}` }) as EntryRow),
        );
        return { count: data.length };
      },
    },
    workTimeEvent: {
      findMany: async ({ where }: { where: { createdAt: { gt: Date } } }) =>
        store.events.filter((row) => row.createdAt.getTime() > where.createdAt.gt.getTime()),
    },
    driverPayrollProfile: { findMany: async () => store.profiles },
    payrollWageTypeMapping: { findMany: async () => store.mappings },
    payrollDay: { findMany: async () => store.days },
    payrollExport: {
      findFirst: async ({ where, orderBy }: { where?: Record<string, unknown>; orderBy?: unknown }) => {
        const rows = store.exports
          .filter((row) => !where || Object.entries(where).every(([k, v]) => row[k] === v))
          .sort((a, b) => Number(b.version ?? 0) - Number(a.version ?? 0));
        return rows[0] ?? null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = store.exports.find((entry) => entry.id === where.id);
        if (row) Object.assign(row, data);
        return row;
      },
      findMany: async () => store.exports,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `export-${(sequence += 1)}`, ...data };
        store.exports.push(row);
        return row;
      },
    },
  };

  return { ...client, $transaction: async (fn: (tx: typeof client) => Promise<unknown>) => fn(client) };
}

function createStore(overrides: Partial<Store> = {}): Store {
  return {
    periods: [
      period(),
      period({ id: 'period-aug', month: 8, status: PayrollPeriodStatus.draft, approvedAt: null }),
    ],
    entries: [entry()],
    events: [],
    mappings: [
      wageMapping(PayrollMovementType.regular_hours, '1000'),
      wageMapping(PayrollMovementType.overtime_hours, '1100'),
    ],
    profiles: [
      {
        driverId: 'driver-a',
        datevPersonnelNumber: '1001',
        datevPayrollSystem: null,
        costCenter: 'KST-1',
        costUnit: null,
        validFrom: new Date('2026-01-01T00:00:00.000Z'),
        validTo: null,
      },
    ],
    days: [],
    exports: [],
    saved: [],
    freshEntries: [],
    ...overrides,
  };
}

function createService(store: Store): PayrollExportService {
  const periods = {
    computePeriod: async () => ({ dayRows: [], entryRows: store.freshEntries }),
  } as unknown as PayrollPeriodService;

  const settings = {
    getTenantProfile: async () => ({
      datevConsultantNumber: '12345',
      datevClientNumber: '54321',
      datevPayrollSystem: 'lodas' as const,
    }),
  } as unknown as PayrollSettingsService;

  const storage = {
    save: async (fileName: string, contents: Buffer) => {
      store.saved.push({ fileName, contents: contents.toString('utf8') });
      return { storedPath: `/uploads/payroll-exports/${fileName}`, sha256: 'abc', byteSize: contents.length };
    },
  } as unknown as PayrollExportStorageService;

  return new PayrollExportService(
    createFakePrisma(store) as unknown as PrismaService,
    { logAction: async () => undefined } as unknown as AuditService,
    settings,
    periods,
    storage,
  );
}

describe('PayrollExportService gec gelen degisiklikler', () => {
  it('onaydan SONRA yazilan olaylari listeler', async () => {
    const store = createStore({
      events: [
        // Onaydan once yazilmis: donem hesabina zaten girdi.
        { id: 'e1', driverId: 'driver-a', occurredAt: new Date('2026-07-20T08:00:00.000Z'), createdAt: new Date('2026-07-20T08:05:00.000Z') },
        // Cevrimdisi kuyruk gunler sonra gonderdi.
        { id: 'e2', driverId: 'driver-a', occurredAt: new Date('2026-07-21T08:00:00.000Z'), createdAt: new Date('2026-08-07T09:00:00.000Z') },
      ],
    });
    const service = createService(store);

    const result = await service.listLateChanges('period-jul');

    assert.deepEqual(result.events.map((row) => row.id), ['e2']);
  });

  it('donmemis donemde bos liste doner', async () => {
    const store = createStore();
    const service = createService(store);

    const result = await service.listLateChanges('period-aug');

    assert.deepEqual(result.events, []);
    assert.equal(result.since, null);
  });

  it('duzeltmeye girmis degisiklikleri tekrar gostermez', async () => {
    const store = createStore({
      events: [
        { id: 'e2', driverId: 'driver-a', occurredAt: new Date('2026-07-21T08:00:00.000Z'), createdAt: new Date('2026-08-07T09:00:00.000Z') },
        { id: 'e3', driverId: 'driver-a', occurredAt: new Date('2026-07-22T08:00:00.000Z'), createdAt: new Date('2026-08-09T09:00:00.000Z') },
      ],
    });
    store.entries.push(
      entry({
        id: 'entry-corr',
        periodId: 'period-aug',
        kind: PayrollEntryKind.correction,
        correctsPeriodId: 'period-jul',
        correctionThroughAt: new Date('2026-08-08T00:00:00.000Z'),
      }),
    );
    const service = createService(store);

    const result = await service.listLateChanges('period-jul');

    // e2 duzeltmeye girdi, e3 ondan sonra geldi.
    assert.deepEqual(result.events.map((row) => row.id), ['e3']);
  });
});

describe('PayrollExportService Ruckrechnung', () => {
  it('farki duzeltme kalemi olarak acik doneme yazar', async () => {
    const store = createStore({
      freshEntries: [
        { driverId: 'driver-a', workedMinutes: 10_140, regularMinutes: 10_080, overtimeMinutes: 60, balanceMinutes: 60, targetMinutes: 10_080, creditedMinutes: 0, nightMinutes: 0, nightCoreMinutes: 0, sundayMinutes: 0, holidayMinutes: 0, vacationDays: 0, sickDays: 0, unpaidAbsenceDays: 0 },
      ],
    });
    const service = createService(store);

    const result = await service.createCorrections(
      'period-jul',
      'period-aug',
      'user-a',
      new Date('2026-08-09T12:00:00.000Z'),
    );

    assert.equal(result.created, 1);
    const correction = store.entries.find((row) => row.kind === PayrollEntryKind.correction);
    assert.equal(correction?.periodId, 'period-aug');
    assert.equal(correction?.correctsPeriodId, 'period-jul');
    // Yalnizca FARK tasiniyor, tam tutar degil.
    assert.equal(correction?.workedMinutes, 60);
    assert.equal(correction?.overtimeMinutes, 60);
    assert.equal(correction?.regularMinutes, 0);
    // Kaynak donem DEGISMEDI.
    assert.equal(store.entries.find((row) => row.id === 'entry-1')?.workedMinutes, 10_080);
  });

  it('fark yoksa kalem yazmaz', async () => {
    const store = createStore({
      freshEntries: [
        { driverId: 'driver-a', workedMinutes: 10_080, regularMinutes: 10_080, overtimeMinutes: 0, balanceMinutes: 0, targetMinutes: 10_080, creditedMinutes: 0, nightMinutes: 0, nightCoreMinutes: 0, sundayMinutes: 0, holidayMinutes: 0, vacationDays: 0, sickDays: 0, unpaidAbsenceDays: 0 },
      ],
    });
    const service = createService(store);

    const result = await service.createCorrections('period-jul', 'period-aug', 'user-a');

    assert.equal(result.created, 0);
  });

  it('negatif farki da tasir', async () => {
    const store = createStore({
      freshEntries: [
        { driverId: 'driver-a', workedMinutes: 9_960, regularMinutes: 9_960, overtimeMinutes: 0, balanceMinutes: -120, targetMinutes: 10_080, creditedMinutes: 0, nightMinutes: 0, nightCoreMinutes: 0, sundayMinutes: 0, holidayMinutes: 0, vacationDays: 0, sickDays: 0, unpaidAbsenceDays: 0 },
      ],
    });
    const service = createService(store);

    await service.createCorrections('period-jul', 'period-aug', 'user-a');

    const correction = store.entries.find((row) => row.kind === PayrollEntryKind.correction);
    assert.equal(correction?.workedMinutes, -120);
  });

  it('donmemis kaynak donemden duzeltme uretmez', async () => {
    const store = createStore();
    const service = createService(store);

    await assert.rejects(
      service.createCorrections('period-aug', 'period-jul', 'user-a'),
      (error: unknown) =>
        error instanceof ConflictException &&
        (error.getResponse() as { code: string }).code === 'payroll_source_period_not_frozen',
    );
  });

  it('kapali doneme duzeltme yazmaz', async () => {
    const store = createStore();
    store.periods[1].status = PayrollPeriodStatus.locked;
    const service = createService(store);

    await assert.rejects(
      service.createCorrections('period-jul', 'period-aug', 'user-a'),
      (error: unknown) =>
        (error as { getResponse(): { code: string } }).getResponse().code ===
        'payroll_target_period_not_open',
    );
  });
});

describe('PayrollExportService ihracat', () => {
  it('onayli donemden CSV uretir ve donemi exported yapar', async () => {
    const store = createStore({
      entries: [entry({ overtimeMinutes: 120, regularMinutes: 9_960 })],
    });
    const service = createService(store);

    const row = await service.exportPeriod('period-jul', PayrollExportFormat.neutral_csv, 'user-a');

    assert.equal(store.saved.length, 1);
    const csv = store.saved[0].contents;
    assert.match(csv, /^LOHN;2026-07;12345;54321;lodas/);
    assert.match(csv, /1001;regular_hours;1000;166,00;Stunden/);
    assert.match(csv, /1001;overtime_hours;1100;2,00;Stunden/);
    assert.equal(store.periods[0].status, PayrollPeriodStatus.exported);
    assert.deepEqual((row as { entryIds: string[] }).entryIds, ['entry-1']);
  });

  it('eslenmemis kovayi SESSIZCE ATLAMAZ, ihracati durdurur', async () => {
    // Onceki davranis kovayi dosyadan dusuruyordu; odenmis gece saatlerinin
    // sessizce kaybolmasi demekti. Artik hazirlik dogrulamasi bunu bloklar.
    const store = createStore({
      entries: [entry({ nightMinutes: 300, regularMinutes: 9_780 })],
    });
    const service = createService(store);

    await assert.rejects(
      service.exportPeriod('period-jul', PayrollExportFormat.neutral_csv, 'user-a'),
      (error: unknown) =>
        (error as { getResponse(): { code: string; issues: Array<{ code: string }> } })
          .getResponse()
          .issues.some((issue) => issue.code === 'wage_type_unmapped'),
    );

    assert.deepEqual(store.saved, []);
  });

  it('yanlis dosyayi DUZELTMEZ, yeni surum uretip eskisini superseded yapar', async () => {
    const store = createStore();
    const service = createService(store);

    const first = await service.exportPeriod('period-jul', PayrollExportFormat.neutral_csv, 'user-a');
    const second = await service.exportPeriod('period-jul', PayrollExportFormat.neutral_csv, 'user-a');

    assert.equal((first as { version: number }).version, 1);
    assert.equal((second as { version: number }).version, 2);
    assert.equal((second as { supersedesExportId: string }).supersedesExportId, (first as { id: string }).id);
    // Eski dosya SILINMIYOR: hangi dosyanin gonderildigi kanitlanabilmeli.
    assert.equal(store.exports.find((row) => row.id === (first as { id: string }).id)?.status, 'superseded');
    assert.equal(store.saved.length, 2);
  });

  it('kaynak ozetini ve kayit sayisini yazar', async () => {
    const store = createStore({ entries: [entry({ overtimeMinutes: 120, regularMinutes: 9_960 })] });
    const service = createService(store);

    const row = (await service.exportPeriod(
      'period-jul',
      PayrollExportFormat.neutral_csv,
      'user-a',
    )) as { recordCount: number; sourceHash: string };

    assert.equal(row.recordCount, 2);
    assert.match(row.sourceHash, /^[0-9a-f]{64}$/);
  });

  it('hic esleme yoksa reddeder', async () => {
    const store = createStore({ mappings: [], entries: [entry({ regularMinutes: 10_080 })] });
    const service = createService(store);

    await assert.rejects(
      service.exportPeriod('period-jul', PayrollExportFormat.neutral_csv, 'user-a'),
      (error: unknown) =>
        (error as { getResponse(): { code: string } }).getResponse().code ===
        'payroll_period_not_datev_ready',
    );
  });

  it('personel numarasi olmayan surucuyu DATEV-hazir saymaz', async () => {
    const store = createStore({ profiles: [] });
    const service = createService(store);

    await assert.rejects(
      service.exportPeriod('period-jul', PayrollExportFormat.neutral_csv, 'user-a'),
      (error: unknown) =>
        (error as { getResponse(): { code: string } }).getResponse().code ===
        'payroll_period_not_datev_ready',
    );
  });

  it('onaylanmamis donemi ihrac etmez', async () => {
    const store = createStore();
    const service = createService(store);

    await assert.rejects(
      service.exportPeriod('period-aug', PayrollExportFormat.neutral_csv, 'user-a'),
      (error: unknown) =>
        (error as { getResponse(): { code: string } }).getResponse().code ===
        'payroll_period_not_datev_ready',
    );
  });

  it('henuz yazicisi olmayan DATEV ASCII bicimini acikca reddeder', async () => {
    // LODAS/Lohn und Gehalt duzenleri resmi spec'e gore yazilip gercek DATEV
    // uygulamasinda test-import edilmeden dogru sayilmayacak; tahmine dayali
    // dosya uretmektense reddediliyor.
    const store = createStore();
    const service = createService(store);

    await assert.rejects(
      service.exportPeriod('period-jul', PayrollExportFormat.datev_ascii, 'user-a'),
      (error: unknown) =>
        error instanceof BadRequestException &&
        (error.getResponse() as { code: string }).code === 'payroll_export_format_unsupported',
    );
  });
});

describe('PayrollExportService kilit', () => {
  it('yalnizca ihrac edilmis donemi kilitler', async () => {
    const store = createStore();
    const service = createService(store);

    await assert.rejects(
      service.lockPeriod('period-jul', 'user-a'),
      (error: unknown) =>
        (error as { getResponse(): { code: string } }).getResponse().code ===
        'payroll_period_not_exported',
    );

    store.periods[0].status = PayrollPeriodStatus.exported;
    const row = await service.lockPeriod('period-jul', 'user-a');

    assert.equal((row as { status: PayrollPeriodStatus }).status, PayrollPeriodStatus.locked);
    assert.ok(store.periods[0].lockedAt instanceof Date);
  });
});
