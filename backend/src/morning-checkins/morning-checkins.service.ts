import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AssignmentStatus,
  CalendarSource,
  CalendarStatus,
  MorningCheckin,
  MorningCheckinStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMorningCheckinDto } from './dto/create-morning-checkin.dto';
import { UpdateMorningCheckinDto } from './dto/update-morning-checkin.dto';

type MorningCheckinWithDriver = MorningCheckin & {
  driver: { id: string; firstName: string; lastName: string };
};

function toClient(row: MorningCheckinWithDriver) {
  return {
    id: row.id,
    driver_id: row.driverId,
    driver_name: `${row.driver.firstName} ${row.driver.lastName}`.trim(),
    date: row.date.toISOString(),
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
  constructor(private readonly prisma: PrismaService) {}

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

    const result = await this.prisma.$transaction(async (tx) => {
      const assignment = await tx.assignment.create({
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

      await tx.calendarEvent.create({
        data: {
          driverId: checkin.driverId,
          assignmentId: assignment.id,
          date: checkin.date,
          status: CalendarStatus.AT,
          source: CalendarSource.assignment,
        },
      });

      const updated = await tx.morningCheckin.update({
        where: { id },
        data: {
          status: MorningCheckinStatus.added_to_einsatzplan,
          assignmentId: assignment.id,
        },
        include: includeDriver,
      });

      return { checkin: updated, assignment };
    });

    return {
      checkin: toClient(result.checkin),
      assignment: result.assignment,
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
