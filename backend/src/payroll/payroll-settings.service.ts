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
 * Bordro yapilandirmasi (Faz 4a).
 *
 * Yalnizca zemin: hesap ve ihracat yok. Rechnungswesen tarafiyla (TenantBilling
 * Profile, DatevExport) hicbir alani paylasmiyor — ayri urunler, ayri muhatap.
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

/** Kayit verilen anda gecerli mi. */
function isValidAt(row: { validFrom: Date; validTo: Date | null }, asOf: Date): boolean {
  return row.validFrom <= asOf && (row.validTo === null || row.validTo >= asOf);
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
      payrollTargetSystem: dto.payrollTargetSystem ?? null,
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
      ...(dto.tachoBreakToleranceMinutes !== undefined && {
        tachoBreakToleranceMinutes: dto.tachoBreakToleranceMinutes,
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
   * Suruculer ve O ANDA gecerli bordro profili surumu. Profili OLMAYAN surucu
   * de listeleniyor: ayarlar ekraninin ilk isi eksikleri gostermek.
   *
   * Profil surumlu oldugu icin "en son kayit" almak yanlis olurdu: gelecekte
   * baslayan bir surum bugunun profili degildir.
   */
  async listDriverProfiles(asOf: Date = new Date()) {
    // Durum filtresi YOK: aydan once ayrilmis bir surucunun calistigi gunler de
    // o ayin bordrosuna giriyor, listeden dusurmek onu gorunmez yapardi.
    const [drivers, profiles] = await Promise.all([
      this.prisma.driver.findMany({
        select: { id: true, firstName: true, lastName: true, employeeNumber: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
      this.prisma.driverPayrollProfile.findMany(),
    ]);

    const currentByDriver = new Map<string, (typeof profiles)[number]>();
    for (const profile of profiles) {
      if (!isValidAt(profile, asOf)) continue;
      const current = currentByDriver.get(profile.driverId);
      if (!current || profile.validFrom > current.validFrom) {
        currentByDriver.set(profile.driverId, profile);
      }
    }

    return drivers.map((driver) => {
      const profile = currentByDriver.get(driver.id) ?? null;
      return {
        driverId: driver.id,
        firstName: driver.firstName,
        lastName: driver.lastName,
        employeeNumber: driver.employeeNumber,
        profile,
        /** Ihracata girebilir mi — personel numarasi BLOKLAYICI kosul. */
        ready: profile !== null && profile.externalPersonnelNumber.trim().length > 0,
        versionCount: profiles.filter((row) => row.driverId === driver.id).length,
      };
    });
  }

  /**
   * Surucu profilini kaydeder.
   *
   * IHRACATA GIDEN ALAN DEGISTIYSE yeni SURUM acilir, mevcut surum kapatilir.
   * Ustune yazmak, gecmis bir donemi yeniden uretirken bugunun personel
   * numarasini kullanmak demek olurdu. Dosyaya girmeyen alanlar (hedef sure
   * gibi) yerinde guncelleniyor — her hedef degisikligi icin surum acmak
   * gecmisi gereksiz kalabaliklastirirdi.
   */
  async upsertDriverProfile(
    tenantId: string,
    driverId: string,
    dto: UpsertDriverPayrollProfileDto,
    actorUserId: string,
    asOf: Date = new Date(),
  ) {
    const personnelNumber = dto.externalPersonnelNumber.trim();
    if (!personnelNumber) {
      throw new BadRequestException('A personnel number is required');
    }

    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      select: { id: true },
    });
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const validFrom = normalizeDay(asOf, 'validFrom');
    const existing = await this.prisma.driverPayrollProfile.findMany({ where: { driverId } });
    const current = existing
      .filter((row) => isValidAt(row, asOf))
      .sort((a, b) => b.validFrom.getTime() - a.validFrom.getTime())[0];

    // Ayni anda baska bir surucude ayni numara varsa hedef sistemde iki kisinin
    // saatleri tek satirda birlesir. Hazirlik dogrulamasi da bunu tutuyor ama
    // hatayi kaydetme aninda vermek kullaniciya daha erken soyluyor.
    const clash = await this.prisma.driverPayrollProfile.findFirst({
      where: { externalPersonnelNumber: personnelNumber, driverId: { not: driverId } },
    });
    if (clash && isValidAt(clash, asOf)) {
      throw new ConflictException('This personnel number is already used by another driver');
    }

    const exportFieldsChanged =
      current !== undefined &&
      (current.externalPersonnelNumber !== personnelNumber ||
        (current.costCenter ?? null) !== (dto.costCenter?.trim() || null) ||
        (current.costUnit ?? null) !== (dto.costUnit?.trim() || null));

    const data = {
      externalPersonnelNumber: personnelNumber,
      weeklyTargetMinutes: dto.weeklyTargetMinutes ?? null,
      monthlyTargetMinutes: dto.monthlyTargetMinutes ?? null,
      costCenter: dto.costCenter?.trim() || null,
      costUnit: dto.costUnit?.trim() || null,
      ...(dto.employmentType !== undefined && { employmentType: dto.employmentType }),
      ...(dto.payrollTargetSystem !== undefined && {
        payrollTargetSystem: dto.payrollTargetSystem,
      }),
    };

    let row;
    if (!current) {
      row = await this.prisma.driverPayrollProfile.create({
        data: { ...data, driverId, tenantId, validFrom },
      });
    } else if (!exportFieldsChanged) {
      row = await this.prisma.driverPayrollProfile.update({ where: { id: current.id }, data });
    } else if (current.validFrom.getTime() === validFrom.getTime()) {
      // Ayni gun icinde ikinci duzeltme: yeni surum acmak yerine gunu duzelt,
      // yoksa aralik cakisir ve hazirlik dogrulamasi bunu bloklar.
      row = await this.prisma.driverPayrollProfile.update({ where: { id: current.id }, data });
    } else {
      const previousEnd = new Date(validFrom);
      previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
      row = await this.prisma.$transaction(async (tx) => {
        await tx.driverPayrollProfile.update({
          where: { id: current.id },
          data: { validTo: previousEnd },
        });
        return tx.driverPayrollProfile.create({
          data: { ...data, driverId, tenantId, validFrom },
        });
      });
    }

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'payroll.driver_profile_saved',
      entityType: 'driver_payroll_profile',
      entityId: row.id,
      summary: exportFieldsChanged
        ? 'Driver payroll profile versioned'
        : 'Driver payroll profile saved',
      metadata: { driverId, versioned: exportFieldsChanged },
    });

    return row;
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
   * Kova → hedef sistemdeki Lohnart eslemesi. Varsayilan TOHUMLANMIYOR: Lohnart
   * numaralari Steuerberater'a ozel ve uydurulmus bir numara sessizce yanlis
   * hesaba yazar. Bos liste, ihracatin acikca reddetmesi demek.
   */
  async listWageTypeMappings(_tenantId: string) {
    return this.prisma.payrollWageTypeMapping.findMany({
      orderBy: [{ targetSystem: 'asc' }, { movementType: 'asc' }, { validFrom: 'desc' }],
    });
  }

  async upsertWageTypeMapping(
    tenantId: string,
    dto: UpsertWageTypeMappingDto,
    actorUserId: string,
  ) {
    const number = dto.externalWageType.trim();
    if (!number) {
      throw new BadRequestException('A wage type number is required');
    }

    // Ayni urun+tur+baslangic tekil: ayni tarihten gecerli ikinci bir numara
    // hangisinin dogru oldugunu belirsiz birakirdi.
    const validFrom = dto.validFrom ? normalizeDay(dto.validFrom, 'validFrom') : normalizeDay(new Date(), 'validFrom');
    const validTo = dto.validTo ? normalizeDay(dto.validTo, 'validTo') : null;
    if (validTo && validTo < validFrom) {
      throw new BadRequestException('validTo must be on or after validFrom');
    }

    const existing = await this.prisma.payrollWageTypeMapping.findFirst({
      where: { targetSystem: dto.targetSystem, movementType: dto.movementType, validFrom },
    });
    const data = {
      externalWageType: number,
      enabled: dto.enabled ?? true,
      validTo,
      costCenter: dto.costCenter?.trim() || null,
      costUnit: dto.costUnit?.trim() || null,
    };
    const row = existing
      ? await this.prisma.payrollWageTypeMapping.update({ where: { id: existing.id }, data })
      : await this.prisma.payrollWageTypeMapping.create({
          data: {
            ...data,
            tenantId,
            targetSystem: dto.targetSystem,
            movementType: dto.movementType,
            validFrom,
          },
        });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'payroll.wage_type_mapping_saved',
      entityType: 'payroll_wage_type_mapping',
      entityId: row.id,
      summary: `${dto.targetSystem} wage type ${dto.movementType} mapped to ${number}`,
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
