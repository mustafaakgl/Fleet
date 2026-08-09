import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { safeAuditLog } from '../audit/audit-helper';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  calendarCodesOf,
  DEFAULT_DAY_TYPE_MAPPINGS,
  type DayTypeRule,
} from './core/day-type-mapping';
import { UpsertDayTypeMappingDto } from './dto/upsert-day-type-mapping.dto';
import { UpsertDriverPayrollProfileDto } from './dto/upsert-driver-payroll-profile.dto';
import { UpsertPublicHolidayDto } from './dto/upsert-public-holiday.dto';
import { UpsertTenantPayrollProfileDto } from './dto/upsert-tenant-payroll-profile.dto';
import { UpsertWageTypeMappingDto } from './dto/upsert-wage-type-mapping.dto';

/**
 * DATEV Lohn yapilandirmasi (Faz 4a).
 *
 * Yalnizca zemin: hesap ve ihracat yok. Rechnungswesen tarafiyla (TenantBilling
 * Profile, DatevExport) hicbir alani paylasmiyor — DATEV'de iki ayri urun.
 */

/** Takvim taramasinin bakacagi gun sayisi. Bir yil, eslenmemis kodlari bulmaya yeter. */
const UNMAPPED_SCAN_DAYS = 365;

/**
 * Sema varsayilanlarinin kod tarafindaki karsiligi.
 *
 * Tekrar gibi duruyor ama gerekli: ilk kayitta veritabani varsayilanlari HENUZ
 * uygulanmamis oluyor ve DTO da bos gelebiliyor. Bunlar olmadan dogrulama
 * "pencere bos" diye ilk profili reddediyordu.
 */
const PROFILE_DEFAULTS = {
  nightWindowStartMinute: 1_200,
  nightWindowEndMinute: 360,
  nightCoreStartMinute: 0,
  nightCoreEndMinute: 240,
  roundingMinutes: 1,
  defaultWeeklyTargetMinutes: 2_400,
} as const;

/** Verilmeyen alan mevcut degeri EZMEMELI; undefined'lar dusuruluyor. */
function definedOnly<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}

function normalizeDay(value: string | Date, field: string): Date {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`Invalid ${field}`);
  }
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

@Injectable()
export class PayrollSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // ---------------------------------------------------------------- tenant

  async getTenantProfile() {
    return this.prisma.tenantPayrollProfile.findFirst();
  }

  async upsertTenantProfile(
    tenantId: string,
    dto: UpsertTenantPayrollProfileDto,
    actorUserId: string,
  ) {
    const existing = await this.prisma.tenantPayrollProfile.findFirst();
    const merged = { ...PROFILE_DEFAULTS, ...definedOnly(existing ?? {}), ...definedOnly(dto) };

    // Gece penceresi gece yarisini asabilir (20:00→06:00), o yuzden start<end
    // aranmiyor; aranan sey pencerenin BOS olmamasi.
    if (merged.nightWindowStartMinute === merged.nightWindowEndMinute) {
      throw new BadRequestException('The night window start and end must differ');
    }
    if (merged.nightCoreStartMinute === merged.nightCoreEndMinute) {
      throw new BadRequestException('The night core window start and end must differ');
    }

    const data = {
      datevConsultantNumber: dto.datevConsultantNumber?.trim() || null,
      datevClientNumber: dto.datevClientNumber?.trim() || null,
      bundesland: dto.bundesland ?? null,
      ...(dto.nightWindowStartMinute !== undefined && {
        nightWindowStartMinute: dto.nightWindowStartMinute,
      }),
      ...(dto.nightWindowEndMinute !== undefined && {
        nightWindowEndMinute: dto.nightWindowEndMinute,
      }),
      ...(dto.nightCoreStartMinute !== undefined && {
        nightCoreStartMinute: dto.nightCoreStartMinute,
      }),
      ...(dto.nightCoreEndMinute !== undefined && { nightCoreEndMinute: dto.nightCoreEndMinute }),
      ...(dto.roundingMinutes !== undefined && { roundingMinutes: dto.roundingMinutes }),
      ...(dto.defaultWeeklyTargetMinutes !== undefined && {
        defaultWeeklyTargetMinutes: dto.defaultWeeklyTargetMinutes,
      }),
    };

    const row = existing
      ? await this.prisma.tenantPayrollProfile.update({ where: { id: existing.id }, data })
      : await this.prisma.tenantPayrollProfile.create({ data: { ...data, tenantId } });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'payroll.tenant_profile_saved',
      entityType: 'tenant_payroll_profile',
      entityId: row.id,
      summary: 'Payroll settings saved',
    });

    return row;
  }

  // ---------------------------------------------------------------- driver

  /**
   * Butun suruculer ve varsa bordro profilleri. Profili OLMAYAN surucu de
   * listeleniyor: ayarlar ekraninin ilk isi eksikleri gostermek.
   */
  async listDriverProfiles() {
    // Durum filtresi YOK: aydan once ayrilmis bir surucunun calistigi gunler de
    // o ayin bordrosuna giriyor, listeden dusurmek onu gorunmez yapardi.
    const drivers = await this.prisma.driver.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeNumber: true,
        payrollProfile: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    return drivers.map((driver) => ({
      driverId: driver.id,
      firstName: driver.firstName,
      lastName: driver.lastName,
      employeeNumber: driver.employeeNumber,
      profile: driver.payrollProfile,
      /** Bu surucu bordroya girebilir mi — personel numarasi olmadan giremez. */
      ready: driver.payrollProfile !== null,
    }));
  }

  async upsertDriverProfile(
    tenantId: string,
    driverId: string,
    dto: UpsertDriverPayrollProfileDto,
    actorUserId: string,
  ) {
    const personnelNumber = dto.datevPersonnelNumber.trim();
    if (!personnelNumber) {
      throw new BadRequestException('A DATEV personnel number is required');
    }

    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      select: { id: true },
    });
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const data = {
      datevPersonnelNumber: personnelNumber,
      weeklyTargetMinutes: dto.weeklyTargetMinutes ?? null,
      monthlyTargetMinutes: dto.monthlyTargetMinutes ?? null,
      costCenter: dto.costCenter?.trim() || null,
      costUnit: dto.costUnit?.trim() || null,
      ...(dto.employmentType !== undefined && { employmentType: dto.employmentType }),
    };

    try {
      const existing = await this.prisma.driverPayrollProfile.findFirst({ where: { driverId } });
      const row = existing
        ? await this.prisma.driverPayrollProfile.update({ where: { id: existing.id }, data })
        : await this.prisma.driverPayrollProfile.create({ data: { ...data, driverId, tenantId } });

      await safeAuditLog(this.auditService, {
        actorUserId,
        action: 'payroll.driver_profile_saved',
        entityType: 'driver_payroll_profile',
        entityId: row.id,
        summary: 'Driver payroll profile saved',
        metadata: { driverId },
      });

      return row;
    } catch (error) {
      // Ayni personel numarasi iki suruculye verilirse DATEV tarafinda iki
      // kisinin saatleri tek satirda birlesir — sessiz gecilemez.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('This DATEV personnel number is already used by another driver');
      }
      throw error;
    }
  }

  // ------------------------------------------------------------- mappings

  /**
   * Varsayilan eslemeleri ilk okumada olusturur.
   *
   * Seed scripti yerine burada: yeni tenant hicbir kurulum adimi olmadan
   * calisan bir eslemeyle basliyor. Var olan satirlar EZILMIYOR — tenant kendi
   * kararini verdiyse varsayilan onu geri almamali.
   */
  private async ensureDefaultMappings(tenantId: string): Promise<void> {
    const existing = await this.prisma.payrollDayTypeMapping.findMany({
      select: { calendarCode: true },
    });
    const known = new Set(existing.map((row) => row.calendarCode));
    const missing = DEFAULT_DAY_TYPE_MAPPINGS.filter((entry) => !known.has(entry.calendarCode));
    if (missing.length === 0) return;

    await this.prisma.payrollDayTypeMapping.createMany({
      data: missing.map((entry) => ({
        tenantId,
        calendarCode: entry.calendarCode,
        dayType: entry.dayType,
        paid: entry.paid,
      })),
      skipDuplicates: true,
    });
  }

  /**
   * Eslemeler + takvimde GERCEKTEN kullanilan ama eslenmemis kodlar.
   *
   * Eslenmemis kod sessizce bir varsayilana dusmuyor; bordro o gunu hesaplamak
   * yerine uyari veriyor. Ekranin bunu gosterebilmesi icin liste burada.
   */
  async listDayTypeMappings(tenantId: string) {
    await this.ensureDefaultMappings(tenantId);

    const since = new Date();
    since.setUTCDate(since.getUTCDate() - UNMAPPED_SCAN_DAYS);
    since.setUTCHours(0, 0, 0, 0);

    const [mappings, used] = await Promise.all([
      this.prisma.payrollDayTypeMapping.findMany({ orderBy: { calendarCode: 'asc' } }),
      this.prisma.calendarEvent.findMany({
        where: { date: { gte: since } },
        select: { status: true, uiStatus: true },
        distinct: ['status', 'uiStatus'],
      }),
    ]);

    const known = new Set(mappings.map((row) => row.calendarCode));
    const unmapped = new Set<string>();
    for (const day of used) {
      // Ince koddan enum koduna dusen bir zincir varsa gun eslenmis sayilir;
      // hicbiri eslesmiyorsa ilk kod eksik olarak raporlanir.
      const codes = calendarCodesOf(day);
      if (!codes.some((code) => known.has(code))) {
        unmapped.add(codes[0]);
      }
    }

    return { mappings, unmappedCodes: [...unmapped].sort() };
  }

  async upsertDayTypeMapping(tenantId: string, dto: UpsertDayTypeMappingDto, actorUserId: string) {
    const calendarCode = dto.calendarCode.trim();
    if (!calendarCode) {
      throw new BadRequestException('A calendar code is required');
    }

    const existing = await this.prisma.payrollDayTypeMapping.findFirst({ where: { calendarCode } });
    const data = { dayType: dto.dayType, paid: dto.paid ?? true };
    const row = existing
      ? await this.prisma.payrollDayTypeMapping.update({ where: { id: existing.id }, data })
      : await this.prisma.payrollDayTypeMapping.create({ data: { ...data, calendarCode, tenantId } });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'payroll.day_type_mapping_saved',
      entityType: 'payroll_day_type_mapping',
      entityId: row.id,
      summary: `Calendar code ${calendarCode} mapped to ${dto.dayType}`,
    });

    return row;
  }

  /** Hesap katmaninin (4b) okuyacagi hali: kod → kural. */
  async loadDayTypeRules(tenantId: string): Promise<Map<string, DayTypeRule>> {
    await this.ensureDefaultMappings(tenantId);
    const rows = await this.prisma.payrollDayTypeMapping.findMany();
    return new Map(rows.map((row) => [row.calendarCode, { dayType: row.dayType, paid: row.paid }]));
  }

  // ------------------------------------------------------------ wage types

  /**
   * Kova → DATEV Lohnart eslemesi. Varsayilan TOHUMLANMIYOR: Lohnart
   * numaralari Steuerberater'a ozel ve uydurulmus bir numara sessizce yanlis
   * hesaba yazar. Bos liste, ihracatin acikca reddetmesi demek.
   */
  async listWageTypeMappings(_tenantId: string) {
    return this.prisma.payrollWageTypeMapping.findMany({ orderBy: { wageType: 'asc' } });
  }

  async upsertWageTypeMapping(
    tenantId: string,
    dto: UpsertWageTypeMappingDto,
    actorUserId: string,
  ) {
    const number = dto.datevWageTypeNumber.trim();
    if (!number) {
      throw new BadRequestException('A DATEV wage type number is required');
    }

    const existing = await this.prisma.payrollWageTypeMapping.findFirst({
      where: { wageType: dto.wageType },
    });
    const data = { datevWageTypeNumber: number, enabled: dto.enabled ?? true };
    const row = existing
      ? await this.prisma.payrollWageTypeMapping.update({ where: { id: existing.id }, data })
      : await this.prisma.payrollWageTypeMapping.create({
          data: { ...data, tenantId, wageType: dto.wageType },
        });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'payroll.wage_type_mapping_saved',
      entityType: 'payroll_wage_type_mapping',
      entityId: row.id,
      summary: `Wage type ${dto.wageType} mapped to DATEV ${number}`,
    });

    return row;
  }

  // ------------------------------------------------------------- holidays

  async listHolidays(year?: string) {
    const where: Prisma.PublicHolidayWhereInput = {};
    if (year) {
      const parsed = Number(year);
      if (!Number.isInteger(parsed) || parsed < 1970 || parsed > 2200) {
        throw new BadRequestException('Invalid year');
      }
      where.date = {
        gte: new Date(Date.UTC(parsed, 0, 1)),
        lt: new Date(Date.UTC(parsed + 1, 0, 1)),
      };
    }
    return this.prisma.publicHoliday.findMany({ where, orderBy: { date: 'asc' } });
  }

  async upsertHoliday(tenantId: string, dto: UpsertPublicHolidayDto, actorUserId: string) {
    const date = normalizeDay(dto.date, 'date');
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('A holiday name is required');
    }

    const existing = await this.prisma.publicHoliday.findFirst({ where: { date } });
    const row = existing
      ? await this.prisma.publicHoliday.update({
          where: { id: existing.id },
          data: { name, bundesland: dto.bundesland ?? null },
        })
      : await this.prisma.publicHoliday.create({
          data: { tenantId, date, name, bundesland: dto.bundesland ?? null },
        });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'payroll.holiday_saved',
      entityType: 'public_holiday',
      entityId: row.id,
      summary: `Public holiday ${name} on ${date.toISOString().slice(0, 10)}`,
    });

    return row;
  }

  async deleteHoliday(id: string, actorUserId: string) {
    const existing = await this.prisma.publicHoliday.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Public holiday not found');
    }

    await this.prisma.publicHoliday.delete({ where: { id: existing.id } });
    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'payroll.holiday_deleted',
      entityType: 'public_holiday',
      entityId: id,
      summary: `Public holiday removed for ${existing.date.toISOString().slice(0, 10)}`,
    });

    return { deleted: true };
  }
}
