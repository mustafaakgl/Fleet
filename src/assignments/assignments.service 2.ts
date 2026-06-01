import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AssignmentStatus, CalendarSource, CalendarStatus, DriverStatus, Prisma, VehicleStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CompanyEmailsService } from '../company-emails/company-emails.service';

type DayRange = {
  start: Date;
  end: Date;
};

type CreateAssignmentData = {
  driverId: string;
  vehicleId: string;
  companyId: string;
  cargoName: string;
  cargoOwner: string;
  pickupAddress: string;
  deliveryAddress: string;
  workDate: Date;
  startTime: string;
  endTime: string;
  routeName?: string;
  notes?: string;
};

const ACTIVE_ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  AssignmentStatus.planned,
  AssignmentStatus.confirmed,
  AssignmentStatus.in_progress,
];

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companyEmailsService: CompanyEmailsService,
  ) {}

  private getDayRange(date: Date): DayRange {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    return { start, end };
  }

  private async validateAvailability(
    tx: Prisma.TransactionClient,
    input: {
      driverId: string;
      vehicleId: string;
      date: Date;
    },
  ): Promise<string | null> {
    const { start, end } = this.getDayRange(input.date);

    const driver = await tx.driver.findUnique({
      where: { id: input.driverId },
      select: { id: true, status: true },
    });
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }
    if (driver.status !== DriverStatus.active) {
      return 'Driver must be active';
    }

    const driverBlockedByCalendar = await tx.calendarEvent.findFirst({
      where: {
        driverId: input.driverId,
        date: {
          gte: start,
          lt: end,
        },
        status: {
          in: [CalendarStatus.UT, CalendarStatus.KT],
        },
      },
      select: { id: true, status: true },
    });
    if (driverBlockedByCalendar) {
      return `Driver has ${driverBlockedByCalendar.status} on selected date`;
    }

    const driverActiveAssignment = await tx.assignment.findFirst({
      where: {
        driverId: input.driverId,
        workDate: {
          gte: start,
          lt: end,
        },
        status: {
          in: ACTIVE_ASSIGNMENT_STATUSES,
        },
      },
      select: { id: true },
    });
    if (driverActiveAssignment) {
      return 'Driver already has an active assignment on selected date';
    }

    const vehicle = await tx.vehicle.findUnique({
      where: { id: input.vehicleId },
      select: { id: true, status: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }
    if (vehicle.status !== VehicleStatus.active) {
      return `Vehicle is not available due to status ${vehicle.status}`;
    }

    const vehicleActiveAssignment = await tx.assignment.findFirst({
      where: {
        vehicleId: input.vehicleId,
        workDate: {
          gte: start,
          lt: end,
        },
        status: {
          in: ACTIVE_ASSIGNMENT_STATUSES,
        },
      },
      select: { id: true },
    });
    if (vehicleActiveAssignment) {
      return 'Vehicle already has an active assignment on selected date';
    }

    return null;
  }

  async createAssignment(data: CreateAssignmentData, currentUserId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const conflictReason = await this.validateAvailability(tx, {
        driverId: data.driverId,
        vehicleId: data.vehicleId,
        date: data.workDate,
      });

      if (conflictReason) {
        return {
          ok: false as const,
          conflictReason,
        };
      }

      const assignment = await tx.assignment.create({
        data: {
          driverId: data.driverId,
          vehicleId: data.vehicleId,
          companyId: data.companyId,
          cargoName: data.cargoName,
          cargoOwner: data.cargoOwner,
          pickupAddress: data.pickupAddress,
          deliveryAddress: data.deliveryAddress,
          workDate: data.workDate,
          startTime: data.startTime,
          endTime: data.endTime,
          routeName: data.routeName,
          status: AssignmentStatus.planned,
          notes: data.notes,
          createdById: currentUserId,
        },
      });

      await tx.calendarEvent.create({
        data: {
          driverId: data.driverId,
          assignmentId: assignment.id,
          date: data.workDate,
          status: CalendarStatus.AT,
          source: CalendarSource.assignment,
        },
      });

      return {
        ok: true as const,
        assignment,
      };
    });

    if (!result.ok) {
      throw new BadRequestException(result.conflictReason);
    }

    await this.companyEmailsService.updateEmailStatusAfterAssignmentChange(result.assignment.companyId, result.assignment.workDate);

    return result.assignment;
  }

  async listAssignments() {
    return this.prisma.assignment.findMany({
      orderBy: { workDate: 'asc' },
    });
  }

  async getAssignmentById(assignmentId: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        driver: true,
        vehicle: true,
        company: true,
        calendarEvents: true,
      },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    return assignment;
  }

  async cancelAssignment(assignmentId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const assignment = await tx.assignment.findUnique({
        where: { id: assignmentId },
        select: { id: true },
      });

      if (!assignment) {
        throw new NotFoundException('Assignment not found');
      }

      await tx.calendarEvent.deleteMany({
        where: {
          assignmentId,
          status: CalendarStatus.AT,
          source: CalendarSource.assignment,
        },
      });

      const cancelledAssignment = await tx.assignment.update({
        where: { id: assignmentId },
        data: {
          status: AssignmentStatus.cancelled,
        },
      });

      return cancelledAssignment;
    });

    return result;
  }
}
