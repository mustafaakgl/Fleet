import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Assignment,
  AssignmentStatus,
  CalendarSource,
  CalendarStatus,
  DriverStatus,
  Prisma,
  VehicleStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CompanyEmailsService } from '../company-emails/company-emails.service';
import { DriverNotifyService } from '../notifications/driver-notify.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import { AssignmentTransitionTarget } from './dto/transition-assignment.dto';
import { dedupeDriverDayAssignments } from './assignment-dedupe';

type DayRange = { start: Date; end: Date };

const ACTIVE_ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  AssignmentStatus.planned,
  AssignmentStatus.confirmed,
  AssignmentStatus.in_progress,
];

const ALLOWED_FILTER_STATUSES: ReadonlySet<AssignmentStatus> = new Set([
  AssignmentStatus.planned,
  AssignmentStatus.confirmed,
  AssignmentStatus.in_progress,
  AssignmentStatus.completed,
  AssignmentStatus.cancelled,
]);

const ALLOWED_TRANSITIONS: Record<AssignmentTransitionTarget, AssignmentStatus[]> = {
  confirmed: [AssignmentStatus.planned],
  in_progress: [AssignmentStatus.confirmed],
  completed: [AssignmentStatus.in_progress],
};

const CANCELLABLE_FROM: AssignmentStatus[] = [
  AssignmentStatus.planned,
  AssignmentStatus.confirmed,
];

const clientInclude = {
  driver: { select: { id: true, firstName: true, lastName: true } },
  vehicle: { select: { id: true, plateNumber: true } },
  company: { select: { id: true, name: true, defaultDailyRevenue: true } },
} satisfies Prisma.AssignmentInclude;

type AssignmentWithRels = Assignment & {
  driver: { id: string; firstName: string; lastName: string };
  vehicle: { id: string; plateNumber: string };
  company: { id: string; name: string; defaultDailyRevenue: Prisma.Decimal | null };
};

function toDecimalNumber(value: Prisma.Decimal | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Number(value.toString());
}

function toClientAssignment(a: AssignmentWithRels) {
  return {
    id: a.id,
    driver: {
      id: a.driver.id,
      name: `${a.driver.firstName} ${a.driver.lastName}`.trim(),
    },
    vehicle: { id: a.vehicle.id, plate_number: a.vehicle.plateNumber },
    company_id: a.company.id,
    company_name: a.company.name,
    work_date: a.workDate.toISOString(),
    start_time: a.startTime,
    end_time: a.endTime,
    route_name: a.routeName ?? undefined,
    expected_daily_revenue: toDecimalNumber(a.expectedDailyRevenue),
    company_default_daily_revenue: toDecimalNumber(a.company.defaultDailyRevenue),
    cargo_name: a.cargoName,
    cargo_owner: a.cargoOwner,
    pickup_address: a.pickupAddress,
    delivery_address: a.deliveryAddress,
    notes: a.notes ?? undefined,
    status: a.status,
  };
}

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companyEmailsService: CompanyEmailsService,
    private readonly auditService: AuditService,
    private readonly driverNotify: DriverNotifyService,
  ) {}

  private async safeAuditLog(params: {
    actorUserId?: string;
    action: string;
    entityType: string;
    entityId?: string;
    summary?: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    try {
      await this.auditService.logAction(params);
    } catch (error) {
      console.warn('Audit log failed:', error);
    }
  }

  private async resolveCompanyId(companyId?: string, companyName?: string): Promise<string> {
    if (companyId?.trim()) {
      const company = await this.prisma.company.findUnique({
        where: { id: companyId.trim() },
        select: { id: true },
      });
      if (!company) throw new NotFoundException('Company not found');
      return company.id;
    }

    const normalizedName = companyName?.trim();
    if (normalizedName) {
      const company = await this.prisma.company.findFirst({
        where: { name: normalizedName },
        select: { id: true },
      });
      if (!company) {
        throw new BadRequestException(`Company "${normalizedName}" not found`);
      }
      return company.id;
    }

    throw new BadRequestException('company_id or company_name is required');
  }

  private async resolveVehicleId(vehicleId?: string, vehiclePlate?: string): Promise<string> {
    if (vehicleId?.trim()) {
      const vehicle = await this.prisma.vehicle.findUnique({
        where: { id: vehicleId.trim() },
        select: { id: true },
      });
      if (!vehicle) throw new NotFoundException('Vehicle not found');
      return vehicle.id;
    }

    const normalizedPlate = vehiclePlate?.trim();
    if (normalizedPlate) {
      const vehicle = await this.prisma.vehicle.findFirst({
        where: { plateNumber: normalizedPlate },
        select: { id: true },
      });
      if (!vehicle) {
        throw new BadRequestException(`Vehicle "${normalizedPlate}" not found`);
      }
      return vehicle.id;
    }

    throw new BadRequestException('vehicle_id or vehicle_plate is required');
  }

  private getDayRange(date: Date): DayRange {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  private async validateAvailability(
    tx: Prisma.TransactionClient,
    input: { driverId: string; vehicleId: string; date: Date; excludeAssignmentId?: string },
  ): Promise<string | null> {
    const { start, end } = this.getDayRange(input.date);

    const driver = await tx.driver.findUnique({
      where: { id: input.driverId },
      select: { id: true, status: true },
    });
    if (!driver) throw new NotFoundException('Driver not found');
    if (driver.status !== DriverStatus.active) return 'Driver must be active';

    const driverBlockedByCalendar = await tx.calendarEvent.findFirst({
      where: {
        driverId: input.driverId,
        date: { gte: start, lt: end },
        status: { in: [CalendarStatus.UT, CalendarStatus.KT] },
      },
      select: { id: true, status: true },
    });
    if (driverBlockedByCalendar) {
      return `Driver has ${driverBlockedByCalendar.status} on selected date`;
    }

    const driverActive = await tx.assignment.findFirst({
      where: {
        driverId: input.driverId,
        workDate: { gte: start, lt: end },
        status: { in: ACTIVE_ASSIGNMENT_STATUSES },
        ...(input.excludeAssignmentId ? { id: { not: input.excludeAssignmentId } } : {}),
      },
      select: { id: true },
    });
    if (driverActive) return 'Driver already has an active assignment on selected date';

    const vehicle = await tx.vehicle.findUnique({
      where: { id: input.vehicleId },
      select: { id: true, status: true },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    if (vehicle.status !== VehicleStatus.active) {
      return `Vehicle is not available due to status ${vehicle.status}`;
    }

    const vehicleActive = await tx.assignment.findFirst({
      where: {
        vehicleId: input.vehicleId,
        workDate: { gte: start, lt: end },
        status: { in: ACTIVE_ASSIGNMENT_STATUSES },
        ...(input.excludeAssignmentId ? { id: { not: input.excludeAssignmentId } } : {}),
      },
      select: { id: true },
    });
    if (vehicleActive) return 'Vehicle already has an active assignment on selected date';

    return null;
  }

  async list(query: { date?: string; driver_id?: string; vehicle_id?: string; status?: string }) {
    await dedupeDriverDayAssignments(this.prisma, {
      date: query.date,
      driverId: query.driver_id,
    });

    const where: Prisma.AssignmentWhereInput = {};

    if (query.date) {
      const day = new Date(query.date);
      if (Number.isNaN(day.getTime())) {
        throw new BadRequestException('Invalid date');
      }
      const { start, end } = this.getDayRange(day);
      where.workDate = { gte: start, lt: end };
    }

    if (query.driver_id) where.driverId = query.driver_id;
    if (query.vehicle_id) where.vehicleId = query.vehicle_id;

    if (query.status && ALLOWED_FILTER_STATUSES.has(query.status as AssignmentStatus)) {
      where.status = query.status as AssignmentStatus;
    }

    const rows = await this.prisma.assignment.findMany({
      where,
      orderBy: [{ workDate: 'asc' }, { startTime: 'asc' }],
      include: clientInclude,
    });

    return {
      date: query.date,
      data: rows.map(toClientAssignment),
    };
  }

  async getById(id: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id },
      include: clientInclude,
    });

    if (!assignment) throw new NotFoundException('Assignment not found');

    return toClientAssignment(assignment);
  }

  async create(dto: CreateAssignmentDto, currentUserId: string) {
    const workDate = new Date(dto.work_date);
    if (Number.isNaN(workDate.getTime())) {
      throw new BadRequestException('Invalid work_date');
    }

    const companyId = await this.resolveCompanyId(dto.company_id, dto.company_name);
    const vehicleId = await this.resolveVehicleId(dto.vehicle_id, dto.vehicle_plate);
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { defaultDailyRevenue: true },
    });
    const expectedDailyRevenue =
      dto.expected_daily_revenue ?? toDecimalNumber(company?.defaultDailyRevenue ?? null) ?? undefined;

    const created = await this.prisma.$transaction(async (tx) => {
      const conflict = await this.validateAvailability(tx, {
        driverId: dto.driver_id,
        vehicleId,
        date: workDate,
      });
      if (conflict) throw new BadRequestException(conflict);

      const assignment = await tx.assignment.create({
        data: {
          driverId: dto.driver_id,
          vehicleId,
          companyId,
          cargoName: dto.cargo_name,
          cargoOwner: dto.cargo_owner,
          pickupAddress: dto.pickup_address,
          deliveryAddress: dto.delivery_address,
          workDate,
          startTime: dto.start_time,
          endTime: dto.end_time,
          routeName: dto.route_name,
          expectedDailyRevenue,
          status: AssignmentStatus.planned,
          notes: dto.notes,
          createdById: currentUserId,
        },
        include: clientInclude,
      });

      await tx.calendarEvent.create({
        data: {
          driverId: dto.driver_id,
          assignmentId: assignment.id,
          date: workDate,
          status: CalendarStatus.AT,
          source: CalendarSource.assignment,
        },
      });

      return assignment;
    });

    await this.companyEmailsService.updateEmailStatusAfterAssignmentChange(
      created.companyId,
      created.workDate,
    );

    await this.safeAuditLog({
      actorUserId: currentUserId,
      action: 'assignment.created',
      entityType: 'assignment',
      entityId: created.id,
      summary: 'Assignment created',
      metadata: {
        driverId: created.driverId,
        vehicleId: created.vehicleId,
        companyId: created.companyId,
        status: created.status,
      },
    });

    const driver = await this.prisma.driver.findUnique({
      where: { id: created.driverId },
      select: { userId: true },
    });

    if (driver?.userId) {
      const dateLabel = created.workDate.toISOString().slice(0, 10);
      this.driverNotify.notifyUserSafely({
        userId: driver.userId,
        key: 'assignment_created',
        params: { date: dateLabel },
        type: 'system',
        relatedEntityType: 'assignment',
        relatedEntityId: created.id,
      });
    }

    return toClientAssignment(created);
  }

  async update(id: string, dto: UpdateAssignmentDto, actorUserId?: string) {
    const existing = await this.prisma.assignment.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        driverId: true,
        vehicleId: true,
        workDate: true,
        companyId: true,
      },
    });
    if (!existing) throw new NotFoundException('Assignment not found');

    if (
      existing.status === AssignmentStatus.completed ||
      existing.status === AssignmentStatus.cancelled
    ) {
      throw new BadRequestException(`Cannot update assignment in status ${existing.status}`);
    }

    const newDate = dto.work_date ? new Date(dto.work_date) : existing.workDate;
    if (dto.work_date && Number.isNaN(newDate.getTime())) {
      throw new BadRequestException('Invalid work_date');
    }

    let nextVehicleId = existing.vehicleId;
    if (dto.vehicle_id !== undefined || dto.vehicle_plate !== undefined) {
      nextVehicleId = await this.resolveVehicleId(dto.vehicle_id, dto.vehicle_plate);
    }

    let nextCompanyId = existing.companyId;
    if (dto.company_id !== undefined || dto.company_name !== undefined) {
      nextCompanyId = await this.resolveCompanyId(dto.company_id, dto.company_name);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const dateChanged = dto.work_date && newDate.getTime() !== existing.workDate.getTime();
      const vehicleChanged = nextVehicleId !== existing.vehicleId;

      if (dateChanged || vehicleChanged) {
        const conflict = await this.validateAvailability(tx, {
          driverId: existing.driverId,
          vehicleId: nextVehicleId,
          date: newDate,
          excludeAssignmentId: id,
        });
        if (conflict) throw new BadRequestException(conflict);
      }

      if (dateChanged) {
        await tx.calendarEvent.updateMany({
          where: { assignmentId: id, source: CalendarSource.assignment },
          data: { date: newDate },
        });
      }

      const data: Prisma.AssignmentUpdateInput = {};
      if (dto.cargo_name !== undefined) data.cargoName = dto.cargo_name;
      if (dto.cargo_owner !== undefined) data.cargoOwner = dto.cargo_owner;
      if (dto.pickup_address !== undefined) data.pickupAddress = dto.pickup_address;
      if (dto.delivery_address !== undefined) data.deliveryAddress = dto.delivery_address;
      if (dto.work_date !== undefined) data.workDate = newDate;
      if (dto.start_time !== undefined) data.startTime = dto.start_time;
      if (dto.end_time !== undefined) data.endTime = dto.end_time;
      if (dto.route_name !== undefined) data.routeName = dto.route_name;
      if (dto.expected_daily_revenue !== undefined) {
        data.expectedDailyRevenue = dto.expected_daily_revenue;
      }
      if (dto.notes !== undefined) data.notes = dto.notes;
      if (nextVehicleId !== existing.vehicleId) {
        data.vehicle = { connect: { id: nextVehicleId } };
      }
      if (nextCompanyId !== existing.companyId) {
        data.company = { connect: { id: nextCompanyId } };
      }

      return tx.assignment.update({
        where: { id },
        data,
        include: clientInclude,
      });
    });

    if (dto.work_date) {
      await this.companyEmailsService.updateEmailStatusAfterAssignmentChange(
        updated.companyId,
        updated.workDate,
      );
    }

    await this.safeAuditLog({
      actorUserId,
      action: 'assignment.updated',
      entityType: 'assignment',
      entityId: updated.id,
      summary: 'Assignment updated',
      metadata: {
        status: updated.status,
        workDate: updated.workDate.toISOString(),
      },
    });

    return toClientAssignment(updated);
  }

  async transition(id: string, to: AssignmentTransitionTarget, actorUserId?: string) {
    const existing = await this.prisma.assignment.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('Assignment not found');

    const allowedFrom = ALLOWED_TRANSITIONS[to];
    if (!allowedFrom.includes(existing.status)) {
      throw new BadRequestException(
        `Cannot transition from ${existing.status} to ${to}`,
      );
    }

    const updated = await this.prisma.assignment.update({
      where: { id },
      data: { status: to as AssignmentStatus },
      include: clientInclude,
    });

    await this.safeAuditLog({
      actorUserId,
      action: 'assignment.updated',
      entityType: 'assignment',
      entityId: updated.id,
      summary: 'Assignment status transitioned',
      metadata: {
        fromStatus: existing.status,
        toStatus: updated.status,
      },
    });

    return toClientAssignment(updated);
  }

  async cancel(id: string, actorUserId?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.assignment.findUnique({
        where: { id },
        select: { id: true, status: true, companyId: true, workDate: true },
      });
      if (!existing) throw new NotFoundException('Assignment not found');

      if (!CANCELLABLE_FROM.includes(existing.status)) {
        throw new BadRequestException(
          `Cannot cancel assignment in status ${existing.status}`,
        );
      }

      await tx.calendarEvent.deleteMany({
        where: {
          assignmentId: id,
          status: CalendarStatus.AT,
          source: CalendarSource.assignment,
        },
      });

      const cancelled = await tx.assignment.update({
        where: { id },
        data: { status: AssignmentStatus.cancelled },
        include: clientInclude,
      });

      return cancelled;
    });

    await this.companyEmailsService.updateEmailStatusAfterAssignmentChange(
      result.companyId,
      result.workDate,
    );

    await this.safeAuditLog({
      actorUserId,
      action: 'assignment.cancelled',
      entityType: 'assignment',
      entityId: result.id,
      summary: 'Assignment cancelled',
      metadata: {
        status: result.status,
        workDate: result.workDate.toISOString(),
      },
    });

    return toClientAssignment(result);
  }
}
