import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Driver, DriverStatus, UserRole } from '@prisma/client';
import { changedFieldNames, safeAuditLog } from '../audit/audit-helper';
import { AuditService } from '../audit/audit.service';
import { InvitationsService } from '../invitations/invitations.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';

const ALLOWED_STATUSES: ReadonlySet<DriverStatus> = new Set([
  'active',
  'on_leave',
  'sick',
  'inactive',
  'terminated',
]);

type DriverWithCurrent = Driver & {
  accidents: { id: string }[];
  assignments: {
    vehicle: { plateNumber: string };
    company: { name: string };
  }[];
};

function toDecimalNumber(value: Prisma.Decimal | null | undefined): number {
  if (value == null) return 0;
  return Number(value);
}

function toClientDriver(row: DriverWithCurrent) {
  return {
    id: row.id,
    employee_number: row.employeeNumber,
    first_name: row.firstName,
    last_name: row.lastName,
    accident_count: row.accidents.length,
    email: row.email,
    phone: row.phone,
    license_number: row.licenseNumber,
    license_expiry_date: row.licenseExpiryDate?.toISOString(),
    passport_number: row.passportNumber,
    passport_expiry_date: row.passportExpiryDate?.toISOString(),
    status: row.status,
    risk_level: row.riskLevel,
    date_of_birth: row.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    vacation_entitlement_days: toDecimalNumber(row.vacationEntitlementDays),
    vacation_carry_over_days: toDecimalNumber(row.vacationCarryOverDays),
    current_vehicle_plate: row.assignments[0]?.vehicle.plateNumber ?? null,
    current_company_name: row.assignments[0]?.company.name ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

const currentAssignmentInclude = {
  accidents: {
    where: { status: { not: 'rejected' as const } },
    select: { id: true },
  },
  assignments: {
    where: { status: { in: ['planned', 'confirmed', 'in_progress'] as const } },
    orderBy: [{ workDate: 'desc' as const }, { startTime: 'desc' as const }],
    take: 1,
    select: {
      vehicle: { select: { plateNumber: true } },
      company: { select: { name: true } },
    },
  },
} satisfies Prisma.DriverInclude;

@Injectable()
export class DriversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly invitations: InvitationsService,
  ) {}

  async listDrivers(query: { status?: string; search?: string; page?: number; limit?: number }) {
    const page = Number.isFinite(query.page) ? Math.max(1, Number(query.page)) : 1;
    const limit = Number.isFinite(query.limit) ? Math.min(200, Math.max(1, Number(query.limit))) : 50;
    const search = (query.search ?? '').trim();

    const where: Prisma.DriverWhereInput = {};

    if (query.status && ALLOWED_STATUSES.has(query.status as DriverStatus)) {
      where.status = query.status as DriverStatus;
    }

    if (search.length > 0) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { employeeNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.driver.count({ where }),
      this.prisma.driver.findMany({
        where,
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: currentAssignmentInclude,
      }),
    ]);

    return {
      total,
      page,
      limit,
      data: rows.map(toClientDriver),
    };
  }

  async getById(id: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id },
      include: {
        ...currentAssignmentInclude,
        // Override assignments for detail view: recent 5 regardless of status
        assignments: {
          orderBy: [{ workDate: 'desc' }, { startTime: 'desc' }],
          take: 5,
          include: {
            vehicle: { select: { id: true, plateNumber: true } },
            company: { select: { name: true } },
          },
        },
      },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const documents = await this.prisma.document.findMany({
      where: { ownerType: 'driver', ownerId: id },
      orderBy: { createdAt: 'desc' },
    });

    // For toClientDriver we need the "current assignment" shape; refetch that one slot.
    const current = driver.assignments[0];
    const baseClient = toClientDriver({
      ...driver,
      assignments: current
        ? [
            {
              vehicle: { plateNumber: current.vehicle.plateNumber },
              company: { name: current.company.name },
            },
          ]
        : [],
    } as DriverWithCurrent);

    return {
      ...baseClient,
      recent_assignments: driver.assignments.map((a) => ({
        id: a.id,
        driver: { id: driver.id, name: `${driver.firstName} ${driver.lastName}` },
        vehicle: { id: a.vehicle.id, plate_number: a.vehicle.plateNumber },
        company_name: a.company.name,
        work_date: a.workDate.toISOString(),
        start_time: a.startTime,
        end_time: a.endTime,
        notes: a.notes ?? undefined,
        status: a.status,
      })),
      documents: documents.map((d) => ({
        id: d.id,
        ownerType: d.ownerType,
        ownerId: d.ownerId,
        documentType: d.documentType,
        fileName: d.fileName,
        download_url: d.fileUrl ? `/documents/${d.id}/download` : undefined,
        expiryDate: d.expiryDate?.toISOString(),
        uploadedAt: d.createdAt.toISOString(),
        status: d.status,
        notes: d.notes ?? undefined,
      })),
    };
  }

  async create(dto: CreateDriverDto, actorUserId?: string) {
    const employeeNumber = dto.employee_number ?? `D-${Date.now()}`;

    const driver = await this.prisma.driver.create({
      data: {
        employeeNumber,
        firstName: dto.first_name,
        lastName: dto.last_name,
        email: dto.email,
        phone: dto.phone,
        licenseNumber: dto.license_number,
        licenseExpiryDate: dto.license_expiry_date ? new Date(dto.license_expiry_date) : undefined,
        passportNumber: dto.passport_number,
        passportExpiryDate: dto.passport_expiry_date ? new Date(dto.passport_expiry_date) : undefined,
        dateOfBirth: dto.date_of_birth ? new Date(dto.date_of_birth) : undefined,
        status: dto.status,
        riskLevel: dto.risk_level,
        notes: dto.notes,
        vacationEntitlementDays: dto.vacation_entitlement_days ?? 24,
        vacationCarryOverDays: dto.vacation_carry_over_days ?? 0,
      },
      include: currentAssignmentInclude,
    });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'driver.created',
      entityType: 'driver',
      entityId: driver.id,
      summary: 'Driver created',
    });

    const tenantId = TenantContext.getTenantId();
    const email = dto.email?.trim().toLowerCase();
    if (tenantId && email && actorUserId) {
      try {
        await this.invitations.create(tenantId, actorUserId, {
          email,
          full_name: `${dto.first_name} ${dto.last_name}`.trim(),
          role: UserRole.driver,
          language: 'de',
        });
      } catch {
        // Invitation skipped when user already exists or seat limits apply
      }
    }

    return toClientDriver(driver);
  }

  async update(id: string, dto: UpdateDriverDto, actorUserId?: string) {
    await this.assertExists(id);

    const data: Prisma.DriverUpdateInput = {};
    if (dto.first_name !== undefined) data.firstName = dto.first_name;
    if (dto.last_name !== undefined) data.lastName = dto.last_name;
    if (dto.employee_number !== undefined) data.employeeNumber = dto.employee_number;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.license_number !== undefined) data.licenseNumber = dto.license_number;
    if (dto.license_expiry_date !== undefined) {
      data.licenseExpiryDate = dto.license_expiry_date ? new Date(dto.license_expiry_date) : null;
    }
    if (dto.passport_number !== undefined) data.passportNumber = dto.passport_number;
    if (dto.passport_expiry_date !== undefined) {
      data.passportExpiryDate = dto.passport_expiry_date ? new Date(dto.passport_expiry_date) : null;
    }
    if (dto.date_of_birth !== undefined) {
      data.dateOfBirth = dto.date_of_birth ? new Date(dto.date_of_birth) : null;
      if (!dto.date_of_birth) {
        data.lastBirthdayNotifiedYear = null;
      }
    }
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.risk_level !== undefined) data.riskLevel = dto.risk_level;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.vacation_entitlement_days !== undefined) {
      data.vacationEntitlementDays = dto.vacation_entitlement_days;
    }
    if (dto.vacation_carry_over_days !== undefined) {
      data.vacationCarryOverDays = dto.vacation_carry_over_days;
    }

    const updated = await this.prisma.driver.update({
      where: { id },
      data,
      include: currentAssignmentInclude,
    });

    const changed = changedFieldNames(dto as Record<string, unknown>);
    if (changed.length > 0) {
      await safeAuditLog(this.auditService, {
        actorUserId,
        action: 'driver.updated',
        entityType: 'driver',
        entityId: id,
        summary: 'Driver updated',
        metadata: { changed_fields: changed },
      });
    }
    if (dto.risk_level !== undefined) {
      await safeAuditLog(this.auditService, {
        actorUserId,
        action: 'driver.risk_changed',
        entityType: 'driver',
        entityId: id,
        summary: 'Driver risk level changed',
        metadata: { changed_fields: ['risk_level'] },
      });
    }

    return toClientDriver(updated);
  }

  async deactivate(id: string, actorUserId?: string) {
    await this.assertExists(id);
    const driver = await this.prisma.driver.update({
      where: { id },
      data: { status: 'inactive' },
      include: currentAssignmentInclude,
    });
    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'driver.deactivated',
      entityType: 'driver',
      entityId: id,
      summary: 'Driver deactivated',
    });
    return toClientDriver(driver);
  }

  async getHandovers(id: string) {
    await this.assertExists(id);
    return this.prisma.vehicleHandover.findMany({
      where: { driverId: id },
      include: {
        vehicle: { select: { id: true, plateNumber: true } },
      },
      orderBy: { handoverDateTime: 'desc' },
    });
  }

  async getIncidents(id: string) {
    await this.assertExists(id);
    return this.prisma.accident.findMany({
      where: { driverId: id },
      include: {
        vehicle: { select: { id: true, plateNumber: true } },
        company: { select: { id: true, name: true } },
      },
      orderBy: { incidentDateTime: 'desc' },
    });
  }

  async getRisk(id: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id },
      select: { id: true, riskLevel: true, firstName: true, lastName: true },
    });
    if (!driver) throw new NotFoundException('Driver not found');

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const [vehicleAccidents, cargoDamages, openAccidents] = await Promise.all([
      this.prisma.accident.count({
        where: {
          driverId: id,
          type: 'vehicle_accident',
          status: { not: 'rejected' },
          incidentDateTime: { gte: sixMonthsAgo },
        },
      }),
      this.prisma.accident.count({
        where: {
          driverId: id,
          type: 'cargo_damage',
          status: { not: 'rejected' },
          incidentDateTime: { gte: sixMonthsAgo },
        },
      }),
      this.prisma.accident.count({
        where: { driverId: id, status: { in: ['reported', 'under_review'] } },
      }),
    ]);

    const points =
      vehicleAccidents * 3 +
      cargoDamages * 2 +
      openAccidents * 1;

    const level: 'green' | 'yellow' | 'red' =
      points >= 6 ? 'red' : points >= 3 ? 'yellow' : 'green';

    return {
      driver_id: id,
      driver_name: `${driver.firstName} ${driver.lastName}`.trim(),
      stored_risk_level: driver.riskLevel,
      computed_risk_level: level,
      points,
      breakdown: {
        vehicle_accidents_6m: vehicleAccidents,
        cargo_damages_6m: cargoDamages,
        open_incidents: openAccidents,
      },
    };
  }

  private async assertExists(id: string): Promise<void> {
    const exists = await this.prisma.driver.findUnique({ where: { id }, select: { id: true } });
    if (!exists) {
      throw new NotFoundException('Driver not found');
    }
  }
}
