import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AssignmentStatus,
  CalendarSource,
  CalendarStatus,
  MorningCheckin,
  MorningCheckinStatus,
  Prisma,
} from '@prisma/client';
import { DriverNotifyService } from '../notifications/driver-notify.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMorningCheckinDto } from './dto/create-morning-checkin.dto';
import { UpdateMorningCheckinDto } from './dto/update-morning-checkin.dto';
import { dedupeDriverDayAssignments } from '../assignments/assignment-dedupe';

type MorningCheckinWithDriver = MorningCheckin & {
  driver: { id: string; firstName: string; lastName: string };
};

function toCalendarDateString(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function toClient(row: MorningCheckinWithDriver) {
  return {
    id: row.id,
    driver_id: row.driverId,
    driver_name: `${row.driver.firstName} ${row.driver.lastName}`.trim(),
    date: toCalendarDateString(row.date),
    submitted_at: row.submittedAt.toISOString(),
    vehicle_plate: row.vehiclePlate ?? null,
    company_name: row.companyName ?? null,
    status: row.status,
    conflict_reason: row.conflictReason ?? null,
    assignment_id: row.assignmentId ?? null,
    notes: row.notes ?? undefined,
  };
}

const includeDriver = {
  driver: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.MorningCheckinInclude;

@Injectable()
export class MorningCheckinsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly driverNotify: DriverNotifyService,
  ) {}

  async list(query: { date?: string; driver_id?: string; status?: string }) {
    const where: Prisma.MorningCheckinWhereInput = {};
    if (query.driver_id) where.driverId = query.driver_id;
    if (query.status && Object.values(MorningCheckinStatus).includes(query.status as MorningCheckinStatus)) {
      where.status = query.status as MorningCheckinStatus;
    }
    if (query.date) {
      const d = new Date(query.date);
      if (!Number.isNaN(d.getTime())) {
        const start = new Date(d);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        where.date = { gte: start, lt: end };
      }
    }

    const rows = await this.prisma.morningCheckin.findMany({
      where,
      orderBy: [{ date: 'desc' }, { submittedAt: 'desc' }],
      include: includeDriver,
    });
    return rows.map(toClient);
  }

  async getById(id: string) {
    const row = await this.prisma.morningCheckin.findUnique({
      where: { id },
      include: includeDriver,
    });
    if (!row) throw new NotFoundException('Morning check-in not found');
    return toClient(row);
  }

  async create(dto: CreateMorningCheckinDto) {
    const row = await this.prisma.morningCheckin.create({
      data: {
        driverId: dto.driver_id,
        date: new Date(dto.date),
        vehiclePlate: dto.vehicle_plate,
        companyName: dto.company_name,
        status: dto.status ?? MorningCheckinStatus.waiting_for_review,
        notes: dto.notes,
      },
      include: includeDriver,
    });
    return toClient(row);
  }

  async update(id: string, dto: UpdateMorningCheckinDto) {
    await this.assertExists(id);
    const data: Prisma.MorningCheckinUpdateInput = {};
    if (dto.vehicle_plate !== undefined) data.vehiclePlate = dto.vehicle_plate;
    if (dto.company_name !== undefined) data.companyName = dto.company_name;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.conflict_reason !== undefined) data.conflictReason = dto.conflict_reason;
    if (dto.notes !== undefined) data.notes = dto.notes;

    const row = await this.prisma.morningCheckin.update({
      where: { id },
      data,
      include: includeDriver,
    });
    return toClient(row);
  }

  async addToEinsatzplan(id: string, currentUserId: string) {
    const checkin = await this.prisma.morningCheckin.findUnique({ where: { id } });
    if (!checkin) throw new NotFoundException('Morning check-in not found');
    if (checkin.status === MorningCheckinStatus.added_to_einsatzplan) {
      if (checkin.assignmentId) {
        const assignment = await this.prisma.assignment.findUnique({
          where: { id: checkin.assignmentId },
        });
        const row = await this.prisma.morningCheckin.findUniqueOrThrow({
          where: { id },
          include: includeDriver,
        });
        return { checkin: toClient(row), assignment, alreadyAdded: true };
      }
      throw new BadRequestException('Check-in already added to Einsatzplan');
    }
    if (!checkin.vehiclePlate) {
      throw new BadRequestException('vehicle_plate is required to add to Einsatzplan');
    }
    if (!checkin.companyName) {
      throw new BadRequestException('company_name is required to add to Einsatzplan');
    }

    const [vehicle, company] = await Promise.all([
      this.prisma.vehicle.findFirst({ where: { plateNumber: checkin.vehiclePlate }, select: { id: true } }),
      this.prisma.company.findFirst({ where: { name: checkin.companyName }, select: { id: true } }),
    ]);
    if (!vehicle) throw new BadRequestException(`Vehicle "${checkin.vehiclePlate}" not found`);
    if (!company) throw new BadRequestException(`Company "${checkin.companyName}" not found`);

    const { start, end } = dayRange(checkin.date);

    const result = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.morningCheckin.updateMany({
        where: {
          id,
          status: {
            notIn: [MorningCheckinStatus.added_to_einsatzplan, MorningCheckinStatus.rejected],
          },
        },
        data: { status: MorningCheckinStatus.added_to_einsatzplan },
      });
      if (locked.count === 0) {
        const current = await tx.morningCheckin.findUniqueOrThrow({
          where: { id },
          include: includeDriver,
        });
        if (current.assignmentId) {
          const assignment = await tx.assignment.findUniqueOrThrow({
            where: { id: current.assignmentId },
          });
          return { checkin: current, assignment, created: false };
        }
        throw new BadRequestException('Check-in already added to Einsatzplan');
      }

      let assignment = await tx.assignment.findFirst({
        where: {
          driverId: checkin.driverId,
          workDate: { gte: start, lt: end },
          status: { not: AssignmentStatus.cancelled },
        },
        orderBy: { createdAt: 'asc' },
      });

      let created = false;
      if (assignment) {
        assignment = await tx.assignment.update({
          where: { id: assignment.id },
          data: {
            vehicleId: vehicle.id,
            companyId: company.id,
            cargoOwner: checkin.companyName!,
            notes: assignment.notes ?? 'Updated from morning check-in',
          },
        });
      } else {
        created = true;
        assignment = await tx.assignment.create({
          data: {
            driverId: checkin.driverId,
            vehicleId: vehicle.id,
            companyId: company.id,
            cargoName: 'Mobile check-in',
            cargoOwner: checkin.companyName!,
            pickupAddress: 'TBD',
            deliveryAddress: 'TBD',
            workDate: checkin.date,
            startTime: '07:00',
            endTime: '15:00',
            status: AssignmentStatus.planned,
            createdById: currentUserId,
            notes: 'Created from morning check-in',
          },
        });
      }

      const calendarExists = await tx.calendarEvent.findFirst({
        where: {
          driverId: checkin.driverId,
          assignmentId: assignment.id,
          date: { gte: start, lt: end },
        },
        select: { id: true },
      });
      if (!calendarExists) {
        await tx.calendarEvent.create({
          data: {
            driverId: checkin.driverId,
            assignmentId: assignment.id,
            date: checkin.date,
            status: CalendarStatus.AT,
            source: CalendarSource.assignment,
          },
        });
      }

      const updated = await tx.morningCheckin.update({
        where: { id },
        data: { assignmentId: assignment.id },
        include: includeDriver,
      });

      return { checkin: updated, assignment, created };
    });

    await dedupeDriverDayAssignments(this.prisma, {
      driverId: checkin.driverId,
      date: toCalendarDateString(checkin.date),
    });

    const driver = await this.prisma.driver.findUnique({
      where: { id: checkin.driverId },
      select: { userId: true },
    });
    if (result.created && driver?.userId) {
      this.driverNotify.notifyUserSafely({
        userId: driver.userId,
        key: 'checkin_added_to_einsatzplan',
        params: {
          date: toCalendarDateString(result.checkin.date),
          company: checkin.companyName ?? '',
        },
        type: 'system',
        priority: 'high',
        relatedEntityType: 'assignment',
        relatedEntityId: result.assignment.id,
      });
    }

    return {
      checkin: toClient(result.checkin),
      assignment: result.assignment,
      alreadyAdded: !result.created,
    };
  }

  private async assertExists(id: string): Promise<void> {
    const exists = await this.prisma.morningCheckin.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Morning check-in not found');
  }
}
