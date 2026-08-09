import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  PayrollEntryKind,
  PayrollExportFormat,
  PayrollExportStatus,
  PayrollPeriodStatus,
  Prisma,
} from '@prisma/client';
import type { Readable } from 'node:stream';
import { safeAuditLog } from '../audit/audit-helper';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { PayrollExportStorageService } from '../storage/payroll-export-storage.service';
import {
  renderNeutralPayrollCsv,
  WAGE_TYPE_SOURCES,
  type NeutralCsvRow,
} from './export/neutral-csv';
import { PayrollPeriodService } from './payroll-period.service';
import { PayrollSettingsService } from './payroll-settings.service';

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

  async exportPeriod(
    periodId: string,
    format: PayrollExportFormat,
    actorUserId: string,
  ) {
    const period = await this.requirePeriod(periodId);
    if (!EXPORTABLE_STATUSES.includes(period.status)) {
      throw new ConflictException({ code: 'payroll_period_not_approved' });
    }
    if (format !== PayrollExportFormat.neutral_csv) {
      // LODAS ve Lohn und Gehalt yazicilari hedef urun netlestiginde eklenecek;
      // enum bastan uc degerli ki o gun sema degismesin.
      throw new BadRequestException({ code: 'payroll_export_format_unsupported' });
    }

    const [entries, mappings, profile] = await Promise.all([
      this.prisma.payrollEntry.findMany({
        where: { periodId },
        include: {
          driver: { select: { firstName: true, lastName: true } },
          correctsPeriod: { select: { year: true, month: true } },
        },
        orderBy: [{ kind: 'asc' }, { driver: { lastName: 'asc' } }],
      }),
      this.settings.listWageTypeMappings(period.tenantId),
      this.settings.getTenantProfile(),
    ]);

    const enabled = new Map(
      mappings.filter((row) => row.enabled).map((row) => [row.wageType, row.datevWageTypeNumber]),
    );
    if (enabled.size === 0) {
      throw new ConflictException({ code: 'payroll_wage_types_unmapped' });
    }

    const rows: NeutralCsvRow[] = [];
    const usedEntryIds: string[] = [];
    for (const entry of entries) {
      const personnelNumber = readSnapshot(entry.driverProfileSnapshot, 'datevPersonnelNumber');
      if (!personnelNumber) {
        // Onay kapisi bunu zaten engelliyor; duzeltme kalemleri onaydan sonra
        // yazildigi icin ikinci bir kontrol burada duruyor.
        throw new ConflictException({
          code: 'payroll_entry_personnel_number_missing',
          driverId: entry.driverId,
        });
      }

      let wroteAny = false;
      for (const source of WAGE_TYPE_SOURCES) {
        const wageTypeNumber = enabled.get(source.wageType);
        if (!wageTypeNumber) continue;
        const quantity = entry[source.field];
        if (quantity <= 0) continue;

        rows.push({
          personnelNumber,
          lastName: entry.driver.lastName,
          firstName: entry.driver.firstName,
          wageType: source.wageType,
          datevWageTypeNumber: wageTypeNumber,
          quantity,
          unit: source.unit,
          costCenter: readSnapshot(entry.driverProfileSnapshot, 'costCenter'),
          costUnit: readSnapshot(entry.driverProfileSnapshot, 'costUnit'),
          correctsPeriod: entry.correctsPeriod
            ? `${entry.correctsPeriod.year}-${String(entry.correctsPeriod.month).padStart(2, '0')}`
            : null,
        });
        wroteAny = true;
      }
      if (wroteAny) usedEntryIds.push(entry.id);
    }

    const csv = renderNeutralPayrollCsv({
      year: period.year,
      month: period.month,
      profile: {
        consultantNumber: profile?.datevConsultantNumber ?? null,
        clientNumber: profile?.datevClientNumber ?? null,
      },
      rows,
    });

    const fileName = this.storage.buildFileName(period.year, period.month, format);
    const stored = await this.storage.save(fileName, Buffer.from(csv, 'utf8'));

    const exportRow = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payrollExport.create({
        data: {
          tenantId: period.tenantId,
          periodId: period.id,
          format,
          fileStoredPath: stored.storedPath,
          fileSha256: stored.sha256,
          entryIds: usedEntryIds,
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
      summary: `Payroll export generated for ${period.year}-${String(period.month).padStart(2, '0')}`,
      metadata: { exportId: exportRow.id, rowCount: rows.length, format },
    });

    return exportRow;
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

    const file = await this.storage.open(row.fileStoredPath);
    if (!file) {
      throw new NotFoundException({ code: 'payroll_export_file_missing' });
    }

    await this.prisma.payrollExport.update({
      where: { id },
      data: { status: PayrollExportStatus.downloaded },
    });

    return {
      stream: file.stream,
      fileName: row.fileStoredPath.split('/').pop() ?? 'lohn-export.csv',
      mimeType: this.storage.mimeTypeFor(row.fileStoredPath),
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
