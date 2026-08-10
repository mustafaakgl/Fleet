import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DatevPayrollSystem,
  PayrollEntryKind,
  PayrollExportFormat,
  PayrollExportStatus,
  PayrollMovementType,
  PayrollPeriodStatus,
  Prisma,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import { safeAuditLog } from '../audit/audit-helper';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { PayrollExportStorageService } from '../storage/payroll-export-storage.service';
import {
  buildNormalizedMovements,
  summarizeMovements,
  type WageTypeRule,
} from './core/payroll-movement.mapper';
import type { NormalizedPayrollMovement } from './core/payroll-movement';
import { evaluateDatevReadiness } from './datev/core/datev-payroll-validation';
import type { DatevPayrollContext, PayrollFileWriter } from './datev/core/datev-payroll.types';
import { neutralCsvWriter } from './export/neutral-csv';
import { PayrollPeriodService } from './payroll-period.service';
import { PayrollSettingsService } from './payroll-settings.service';

/**
 * Bicim → yazici.
 *
 * `datev_ascii` HENUZ YOK: LODAS ve Lohn und Gehalt duzenleri resmi spec'e
 * gore yazilacak ve gercek DATEV uygulamasinda test-import edilmeden dogru
 * sayilmayacak. Tahmine dayali bir dosya uretmektense ihracat acikca
 * reddediyor.
 */
const WRITERS: Partial<Record<PayrollExportFormat, PayrollFileWriter>> = {
  [PayrollExportFormat.neutral_csv]: neutralCsvWriter,
};

/** Kalemdeki dolu kovalardan hangi hareket turlerinin kullanildigini cikarir. */
function collectUsedMovementTypes(
  entries: ReadonlyArray<Record<string, unknown>>,
): PayrollMovementType[] {
  const pairs: Array<[PayrollMovementType, string]> = [
    [PayrollMovementType.regular_hours, 'regularMinutes'],
    [PayrollMovementType.overtime_hours, 'overtimeMinutes'],
    [PayrollMovementType.night_hours, 'nightMinutes'],
    [PayrollMovementType.night_core_hours, 'nightCoreMinutes'],
    [PayrollMovementType.sunday_hours, 'sundayMinutes'],
    [PayrollMovementType.holiday_hours, 'holidayMinutes'],
    [PayrollMovementType.vacation, 'vacationDays'],
    [PayrollMovementType.sickness, 'sickDays'],
    [PayrollMovementType.unpaid_absence, 'unpaidAbsenceDays'],
  ];
  const used = new Set<PayrollMovementType>();
  for (const entry of entries) {
    for (const [type, field] of pairs) {
      if ((entry[field] as number | undefined) ?? 0) used.add(type);
    }
  }
  return [...used];
}

/**
 * Ihracata giren verinin ozeti.
 *
 * Donem sonradan degistiyse (Ruckrechnung, yeniden hesap) bu ozet tutmaz ve
 * elde duran dosyanin bayatladigi anlasilir. Siralama sabitleniyor ki ayni
 * veri hep ayni ozeti versin.
 */
function hashExportSource(movements: readonly NormalizedPayrollMovement[]): string {
  const canonical = movements
    .map((m) => [m.personnelNumber, m.type, m.quantity, m.wageType ?? '', m.sourceId].join('|'))
    .sort()
    .join('\n');
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * DATEV Lohn ihracati ve Ruckrechnung (Faz 4c).
 *
 * GEC GELEN OLAY: donem onaylandiktan sonra yazilan olaylar AYRI BIR TABLODA
 * TUTULMUYOR, turetiliyor — `createdAt > approvedAt` olan her olay tanim geregi
 * dondurmadan sonra gelmistir. Ayri tablo tutulsaydi iki kayit birbirinden
 * kayabilirdi; turetme kayamaz. Ayni degisikligin her seferinde yeniden
 * duzeltmeye cikmasini engelleyen sey PayrollEntry.correctionThroughAt damgasi.
 */

/** Donem dondurulduktan sonra gelen degisiklikler bu durumlarda aranir. */
const FROZEN_STATUSES: PayrollPeriodStatus[] = [
  PayrollPeriodStatus.approved,
  PayrollPeriodStatus.exported,
  PayrollPeriodStatus.locked,
];

const EXPORTABLE_STATUSES: PayrollPeriodStatus[] = [
  PayrollPeriodStatus.approved,
  PayrollPeriodStatus.exported,
];

/** Duzeltmenin yazilabilecegi, henuz kapanmamis donemler. */
const OPEN_STATUSES: PayrollPeriodStatus[] = [
  PayrollPeriodStatus.draft,
  PayrollPeriodStatus.review,
];

type NumericEntryField =
  | 'targetMinutes'
  | 'workedMinutes'
  | 'creditedMinutes'
  | 'overtimeMinutes'
  | 'regularMinutes'
  | 'balanceMinutes'
  | 'nightMinutes'
  | 'nightCoreMinutes'
  | 'sundayMinutes'
  | 'holidayMinutes'
  | 'vacationDays'
  | 'sickDays'
  | 'unpaidAbsenceDays';

const NUMERIC_FIELDS: NumericEntryField[] = [
  'targetMinutes',
  'workedMinutes',
  'creditedMinutes',
  'overtimeMinutes',
  'regularMinutes',
  'balanceMinutes',
  'nightMinutes',
  'nightCoreMinutes',
  'sundayMinutes',
  'holidayMinutes',
  'vacationDays',
  'sickDays',
  'unpaidAbsenceDays',
];

function monthRange(year: number, month: number): { from: Date; to: Date } {
  return {
    from: new Date(Date.UTC(year, month - 1, 1)),
    to: new Date(Date.UTC(year, month, 1)),
  };
}

function readSnapshot(value: Prisma.JsonValue | null, key: string): string | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'string' && field.trim() ? field : null;
}

@Injectable()
export class PayrollExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly settings: PayrollSettingsService,
    private readonly periods: PayrollPeriodService,
    private readonly storage: PayrollExportStorageService,
  ) {}

  // ------------------------------------------------------------ Ruckrechnung

  /**
   * Donem dondurulduktan SONRA yazilmis olaylar.
   *
   * Cevrimdisi kuyruk bir molayi gunler sonra gonderebiliyor. Bu liste ofise
   * "kapanmis ayda 3 nachtragliche Anderung var" diyen sey.
   */
  async listLateChanges(periodId: string) {
    const period = await this.requirePeriod(periodId);
    if (!FROZEN_STATUSES.includes(period.status) || !period.approvedAt) {
      return { periodId, since: null, events: [] };
    }

    // Zaten duzeltmeye girmis degisiklikler tekrar cikmasin.
    const corrections = await this.prisma.payrollEntry.findMany({
      where: { correctsPeriodId: periodId, kind: PayrollEntryKind.correction },
      select: { correctionThroughAt: true },
      orderBy: { correctionThroughAt: 'desc' },
      take: 1,
    });
    const since = corrections[0]?.correctionThroughAt ?? period.approvedAt;

    const { from, to } = monthRange(period.year, period.month);
    const events = await this.prisma.workTimeEvent.findMany({
      where: { occurredAt: { gte: from, lt: to }, createdAt: { gt: since } },
      select: {
        id: true,
        driverId: true,
        type: true,
        occurredAt: true,
        source: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return { periodId, since, events };
  }

  /**
   * Kilitli donemin farkini acik doneme duzeltme kalemi olarak tasir.
   *
   * Kaynak donem DEGISMEZ — dondurma noktasinin anlami bu. Fark, kaynak
   * donemin bugunku hesabi ile donmus kalemleri arasindaki delta; negatif de
   * olabilir (saat geri alinmissa).
   */
  async createCorrections(
    sourcePeriodId: string,
    targetPeriodId: string,
    actorUserId: string,
    asOf: Date = new Date(),
  ) {
    const [source, target] = await Promise.all([
      this.requirePeriod(sourcePeriodId),
      this.requirePeriod(targetPeriodId),
    ]);

    if (!FROZEN_STATUSES.includes(source.status)) {
      throw new ConflictException({ code: 'payroll_source_period_not_frozen' });
    }
    if (!OPEN_STATUSES.includes(target.status)) {
      throw new ConflictException({ code: 'payroll_target_period_not_open' });
    }
    if (source.id === target.id) {
      throw new BadRequestException({ code: 'payroll_correction_same_period' });
    }

    const [{ entryRows }, frozen] = await Promise.all([
      this.periods.computePeriod(source, asOf),
      this.prisma.payrollEntry.findMany({
        where: { periodId: source.id, kind: PayrollEntryKind.regular },
      }),
    ]);

    const frozenByDriver = new Map(frozen.map((entry) => [entry.driverId, entry]));
    const corrections: Prisma.PayrollEntryCreateManyInput[] = [];

    for (const fresh of entryRows) {
      const before = frozenByDriver.get(fresh.driverId as string);
      const delta: Record<string, number> = {};
      let changed = false;
      for (const field of NUMERIC_FIELDS) {
        const value = ((fresh[field] as number | undefined) ?? 0) - (before?.[field] ?? 0);
        delta[field] = value;
        if (value !== 0) changed = true;
      }
      if (!changed) continue;

      corrections.push({
        tenantId: target.tenantId,
        periodId: target.id,
        driverId: fresh.driverId as string,
        kind: PayrollEntryKind.correction,
        correctsPeriodId: source.id,
        correctionThroughAt: asOf,
        ...delta,
        // Duzeltme, kaynak donemin O GUNKU profiliyle gitmeli: personel no
        // veya Kostenstelle sonradan degistiyse eski donem eskisiyle duzeltilir.
        driverProfileSnapshot: before?.driverProfileSnapshot ?? Prisma.DbNull,
      } as Prisma.PayrollEntryCreateManyInput);
    }

    if (corrections.length > 0) {
      await this.prisma.payrollEntry.createMany({ data: corrections, skipDuplicates: true });
    }

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'payroll.corrections_created',
      entityType: 'payroll_period',
      entityId: target.id,
      summary: `Corrections for ${source.year}-${String(source.month).padStart(2, '0')} carried into ${target.year}-${String(target.month).padStart(2, '0')}`,
      metadata: { sourcePeriodId: source.id, correctionCount: corrections.length },
    });

    return { created: corrections.length, sourcePeriodId: source.id, targetPeriodId: target.id };
  }

  // ---------------------------------------------------------------- ihracat
  // ------------------------------------------------------- DATEV hazirligi

  /**
   * Donemi hem hesaba hem DATEV kosullarina karsi degerlendirir.
   *
   * `approved` ile `DATEV-bereit` ayri seyler: hesap dogru olabilir ama
   * personel numarasi, Lohnart plani veya Berater/Mandant eksikse dosya
   * uretilemez. Ekran ikisini ayri gosterdigi icin bu ucun ciktisi da ayri.
   */
  async evaluateReadiness(periodId: string, asOf: Date = new Date()) {
    const period = await this.requirePeriod(periodId);
    const source = await this.loadExportSource(period, asOf);

    return {
      periodId,
      periodStatus: period.status,
      payrollSystem: source.payrollSystem,
      driverCount: new Set(source.entries.map((entry) => entry.driverId)).size,
      movementCount: source.movements.length,
      summary: summarizeMovements(source.movements),
      ...evaluateDatevReadiness({
        periodStatus: period.status,
        payrollSystem: source.payrollSystem,
        consultantNumber: source.tenantProfile?.datevConsultantNumber ?? null,
        clientNumber: source.tenantProfile?.datevClientNumber ?? null,
        driverIds: [...new Set(source.entries.map((entry) => entry.driverId))],
        profiles: source.profiles,
        usedMovementTypes: source.usedMovementTypes,
        wageTypeRules: source.rules,
        dayAnomalies: source.dayAnomalies,
        asOf: source.asOf,
      }),
    };
  }

  /**
   * Ihracatin ihtiyac duydugu her seyi tek yerde toplar.
   *
   * Hazirlik kontrolu ile dosya uretimi AYNI kaynagi okumali; iki ayri sorgu
   * olsaydi "hazir" diyen ekran ile "eksik" diyen ihracat arasinda fark
   * cikabilirdi.
   */
  private async loadExportSource(
    period: { id: string; tenantId: string; year: number; month: number },
    asOf: Date,
  ) {
    // Esleme ve profil, DONEMIN SONUNA gore cozuluyor: gecmis bir ay yeniden
    // uretildiginde o tarihte gecerli olan numara kullanilmali.
    const periodEnd = new Date(Date.UTC(period.year, period.month, 0, 23, 59, 59));

    const [entries, profileRows, ruleRows, tenantProfile, dayRows] = await Promise.all([
      this.prisma.payrollEntry.findMany({
        where: { periodId: period.id },
        include: {
          driver: { select: { firstName: true, lastName: true } },
          correctsPeriod: { select: { year: true, month: true } },
        },
        orderBy: [{ kind: 'asc' }, { driver: { lastName: 'asc' } }],
      }),
      this.prisma.driverPayrollProfile.findMany(),
      this.prisma.payrollWageTypeMapping.findMany(),
      this.settings.getTenantProfile(),
      this.prisma.payrollDay.findMany({
        where: { periodId: period.id },
        select: { driverId: true, anomalies: true },
      }),
    ]);

    const profiles = profileRows.map((row) => ({
      driverId: row.driverId,
      personnelNumber: row.datevPersonnelNumber,
      validFrom: row.validFrom,
      validTo: row.validTo,
    }));

    // Surucu profili tenant varsayilanini ezebiliyor; farkli suruculer farkli
    // DATEV urunune gidiyorsa tek dosya uretilemez ve bu hazirlikta cikar.
    const payrollSystem =
      profileRows.find((row) => row.datevPayrollSystem)?.datevPayrollSystem ??
      tenantProfile?.datevPayrollSystem ??
      null;

    const rules: WageTypeRule[] = ruleRows.map((row) => ({
      payrollSystem: row.payrollSystem,
      movementType: row.movementType,
      externalWageType: row.datevWageTypeNumber,
      enabled: row.enabled,
      validFrom: row.validFrom,
      validTo: row.validTo,
      costCenter: row.costCenter,
      costUnit: row.costUnit,
    }));

    const identities = new Map(
      profileRows
        .filter((row) => {
          const from = row.validFrom.getTime();
          const to = row.validTo?.getTime() ?? Number.POSITIVE_INFINITY;
          return from <= periodEnd.getTime() && periodEnd.getTime() <= to;
        })
        .map((row) => [
          row.driverId,
          {
            driverId: row.driverId,
            personnelNumber: row.datevPersonnelNumber,
            costCenter: row.costCenter,
            costUnit: row.costUnit,
          },
        ]),
    );

    const usedMovementTypes = collectUsedMovementTypes(entries);

    const dayAnomalies = new Map<string, string[]>();
    for (const row of dayRows) {
      const anomalies = Array.isArray(row.anomalies) ? (row.anomalies as string[]) : [];
      if (anomalies.length === 0) continue;
      dayAnomalies.set(row.driverId, [...(dayAnomalies.get(row.driverId) ?? []), ...anomalies]);
    }

    const built = payrollSystem
      ? buildNormalizedMovements({
          entries,
          identities,
          rules,
          payrollSystem,
          year: period.year,
          month: period.month,
          asOf: periodEnd,
        })
      : { movements: [], unmapped: [], missingIdentity: [] };

    return {
      entries,
      profiles,
      rules,
      tenantProfile,
      payrollSystem,
      identities,
      usedMovementTypes,
      dayAnomalies,
      movements: built.movements,
      asOf: periodEnd,
    };
  }

  // ---------------------------------------------------------------- ihracat

  /**
   * Dosya uretir.
   *
   * DEGISMEZ: var olan bir ihracat GUNCELLENMEZ. Yanlissa yenisi uretilir,
   * eskisi `superseded` olur ve dosyasi yerinde kalir — hangi dosyanin
   * gonderildigi sonradan kanitlanabilmeli.
   */
  async exportPeriod(
    periodId: string,
    format: PayrollExportFormat,
    actorUserId: string,
    asOf: Date = new Date(),
  ) {
    const period = await this.requirePeriod(periodId);
    const source = await this.loadExportSource(period, asOf);

    const readiness = evaluateDatevReadiness({
      periodStatus: period.status,
      payrollSystem: source.payrollSystem,
      consultantNumber: source.tenantProfile?.datevConsultantNumber ?? null,
      clientNumber: source.tenantProfile?.datevClientNumber ?? null,
      driverIds: [...new Set(source.entries.map((entry) => entry.driverId))],
      profiles: source.profiles,
      usedMovementTypes: source.usedMovementTypes,
      wageTypeRules: source.rules,
      dayAnomalies: source.dayAnomalies,
      asOf: source.asOf,
    });
    if (!readiness.ready) {
      throw new ConflictException({
        code: 'payroll_period_not_datev_ready',
        issues: readiness.issues,
      });
    }

    const writer = WRITERS[format];
    if (!writer) {
      // LODAS ve Lohn und Gehalt ASCII yazicilari resmi bicim dogrulanana
      // kadar eklenmiyor; sessizce bos dosya uretmektense acikca reddediliyor.
      throw new BadRequestException({ code: 'payroll_export_format_unsupported' });
    }

    const context: DatevPayrollContext = {
      payrollSystem: source.payrollSystem!,
      consultantNumber: source.tenantProfile!.datevConsultantNumber!,
      clientNumber: source.tenantProfile!.datevClientNumber!,
      year: period.year,
      month: period.month,
      generatedAt: asOf,
    };

    const payload = writer.render(source.movements, context);
    const stored = await this.storage.save(
      `${period.id}-v${await this.nextVersion(period.id, context.payrollSystem, format)}-${writer.fileName(context)}`,
      Buffer.from(payload, 'utf8'),
    );

    const version = await this.nextVersion(period.id, context.payrollSystem, format);
    const previous = await this.prisma.payrollExport.findFirst({
      where: { periodId: period.id, payrollSystem: context.payrollSystem, format },
      orderBy: { version: 'desc' },
    });

    const exportRow = await this.prisma.$transaction(async (tx) => {
      if (previous) {
        // Eski dosya SILINMIYOR, yalnizca gecersiz isaretleniyor.
        await tx.payrollExport.update({
          where: { id: previous.id },
          data: { status: PayrollExportStatus.superseded },
        });
      }
      const created = await tx.payrollExport.create({
        data: {
          tenantId: period.tenantId,
          periodId: period.id,
          payrollSystem: context.payrollSystem,
          format,
          version,
          payloadStoredPath: stored.storedPath,
          payloadSha256: stored.sha256,
          entryIds: [...new Set(source.movements.map((movement) => movement.sourceId))],
          recordCount: source.movements.length,
          sourceHash: hashExportSource(source.movements),
          supersedesExportId: previous?.id ?? null,
          createdById: actorUserId,
        },
      });
      await tx.payrollPeriod.update({
        where: { id: period.id },
        data: { status: PayrollPeriodStatus.exported },
      });
      return created;
    });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'payroll.period_exported',
      entityType: 'payroll_period',
      entityId: period.id,
      summary: `Payroll export v${version} generated for ${period.year}-${String(period.month).padStart(2, '0')}`,
      metadata: {
        exportId: exportRow.id,
        format,
        payrollSystem: context.payrollSystem,
        recordCount: source.movements.length,
        supersedes: previous?.id ?? null,
      },
    });

    return exportRow;
  }

  private async nextVersion(
    periodId: string,
    payrollSystem: DatevPayrollSystem,
    format: PayrollExportFormat,
  ): Promise<number> {
    const latest = await this.prisma.payrollExport.findFirst({
      where: { periodId, payrollSystem, format },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return (latest?.version ?? 0) + 1;
  }
  async listExports(periodId?: string) {
    return this.prisma.payrollExport.findMany({
      where: periodId ? { periodId } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  async downloadExport(id: string): Promise<{ stream: Readable; fileName: string; mimeType: string }> {
    const row = await this.prisma.payrollExport.findUnique({ where: { id } });
    if (!row) throw new NotFoundException({ code: 'payroll_export_not_found' });

    const file = await this.storage.open(row.payloadStoredPath);
    if (!file) {
      throw new NotFoundException({ code: 'payroll_export_file_missing' });
    }

    await this.prisma.payrollExport.update({
      where: { id },
      data: { status: PayrollExportStatus.downloaded },
    });

    return {
      stream: file.stream,
      fileName: row.payloadStoredPath.split('/').pop() ?? 'lohn-export.csv',
      mimeType: this.storage.mimeTypeFor(row.payloadStoredPath),
    };
  }

  /**
   * Ayi tamamen kapatir. Ihracat yeniden uretilebilir; kilitten sonra o donem
   * icin baska duzeltme uretilmez.
   */
  async lockPeriod(id: string, actorUserId: string) {
    const period = await this.requirePeriod(id);
    if (period.status !== PayrollPeriodStatus.exported) {
      throw new ConflictException({ code: 'payroll_period_not_exported' });
    }

    const row = await this.prisma.payrollPeriod.update({
      where: { id },
      data: { status: PayrollPeriodStatus.locked, lockedAt: new Date() },
    });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'payroll.period_locked',
      entityType: 'payroll_period',
      entityId: id,
      summary: `Payroll period ${period.year}-${String(period.month).padStart(2, '0')} locked`,
    });

    return row;
  }

  private async requirePeriod(id: string) {
    const period = await this.prisma.payrollPeriod.findUnique({ where: { id } });
    if (!period) throw new NotFoundException({ code: 'payroll_period_not_found' });
    return period;
  }
}
