import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AssignmentStatus,
  CalendarSource,
  CalendarStatus,
  DriverStatus,
  Prisma,
  TransportRequestStatus,
  VehicleStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CompanyEmailsService } from '../company-emails/company-emails.service';

type DayRange = {
  start: Date;
  end: Date;
};

const ACTIVE_ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  AssignmentStatus.planned,
  AssignmentStatus.confirmed,
  AssignmentStatus.in_progress,
];

@Injectable()
export class TransportRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companyEmailsService: CompanyEmailsService,
    private readonly auditService: AuditService,
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
      return 'Driver not found';
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
      return `Driver has ${driverBlockedByCalendar.status} on requested date`;
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
      return 'Driver already has an active assignment on requested date';
    }

    const vehicle = await tx.vehicle.findUnique({
      where: { id: input.vehicleId },
      select: { id: true, status: true },
    });
    if (!vehicle) {
      return 'Vehicle not found';
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
      return 'Vehicle already has an active assignment on requested date';
    }

    return null;
  }

  async listRequests(query?: { status?: string; driver_id?: string; date?: string }) {
    const where: Prisma.TransportRequestWhereInput = {};
    if (query?.status && Object.values(TransportRequestStatus).includes(query.status as TransportRequestStatus)) {
      where.status = query.status as TransportRequestStatus;
    }
    if (query?.driver_id) where.driverId = query.driver_id;
    if (query?.date) {
      const d = new Date(query.date);
      if (!Number.isNaN(d.getTime())) {
        const start = new Date(d);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        where.requestedDate = { gte: start, lt: end };
      }
    }
    return this.prisma.transportRequest.findMany({
      where,
      include: {
        driver: true,
        vehicle: true,
        company: true,
      },
      orderBy: { requestedDate: 'asc' },
    });
  }

  async createRequest(input: {
    driverId: string;
    vehicleId: string;
    companyId: string;
    cargoName: string;
    cargoOwner: string;
    pickupAddress: string;
    deliveryAddress: string;
    requestedDate: Date;
    startTime: string;
    endTime: string;
    notes?: string;
  }, actorUserId?: string) {
    const created = await this.prisma.transportRequest.create({
      data: {
        driverId: input.driverId,
        vehicleId: input.vehicleId,
        companyId: input.companyId,
        cargoName: input.cargoName,
        cargoOwner: input.cargoOwner,
        pickupAddress: input.pickupAddress,
        deliveryAddress: input.deliveryAddress,
        requestedDate: input.requestedDate,
        startTime: input.startTime,
        endTime: input.endTime,
        notes: input.notes,
        status: TransportRequestStatus.pending,
      },
      include: { driver: true, vehicle: true, company: true },
    });

    await this.safeAuditLog({
      actorUserId,
      action: 'transport_request.created',
      entityType: 'transport_request',
      entityId: created.id,
      summary: 'Transport request created',
      metadata: {
        status: created.status,
        driverId: created.driverId,
        vehicleId: created.vehicleId,
      },
    });

    return created;
  }

  async getById(id: string) {
    const request = await this.prisma.transportRequest.findUnique({
      where: { id },
      include: { driver: true, vehicle: true, company: true, assignment: true },
    });
    if (!request) throw new NotFoundException('Transport request not found');
    return request;
  }

  async approveRequest(requestId: string, currentUserId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const request = await tx.transportRequest.findUnique({
        where: { id: requestId },
        include: {
          driver: true,
          vehicle: true,
          company: true,
        },
      });

      if (!request) {
        throw new NotFoundException('Transport request not found');
      }

      if (request.status === TransportRequestStatus.approved) {
        throw new BadRequestException('Transport request is already approved');
      }

      if (
        request.status !== TransportRequestStatus.pending &&
        request.status !== TransportRequestStatus.needs_review
      ) {
        throw new BadRequestException('Only pending or needs_review transport requests can be approved');
      }

      const conflictReason = await this.validateAvailability(tx, {
        driverId: request.driverId,
        vehicleId: request.vehicleId,
        date: request.requestedDate,
      });

      if (conflictReason) {
        // TODO(notifications): create notification when request moves to needs_review.
        const conflictedRequest = await tx.transportRequest.update({
          where: { id: request.id },
          data: {
            status: TransportRequestStatus.needs_review,
            conflictReason,
          },
          include: {
            driver: true,
            vehicle: true,
            company: true,
          },
        });

        return {
          ok: false as const,
          conflictReason,
          request: conflictedRequest,
        };
      }

      const assignment = await tx.assignment.create({
        data: {
          driverId: request.driverId,
          vehicleId: request.vehicleId,
          companyId: request.companyId,
          cargoName: request.cargoName,
          cargoOwner: request.cargoOwner,
          pickupAddress: request.pickupAddress,
          deliveryAddress: request.deliveryAddress,
          workDate: request.requestedDate,
          startTime: request.startTime,
          endTime: request.endTime,
          status: AssignmentStatus.planned,
          createdById: currentUserId,
          notes: 'Created from transport request',
        },
      });

      const calendarEvent = await tx.calendarEvent.create({
        data: {
          driverId: request.driverId,
          assignmentId: assignment.id,
          date: request.requestedDate,
          status: CalendarStatus.AT,
          source: CalendarSource.assignment,
        },
      });

      const approvedRequest = await tx.transportRequest.update({
        where: { id: request.id },
        data: {
          status: TransportRequestStatus.approved,
          assignmentId: assignment.id,
          conflictReason: null,
        },
        include: {
          driver: true,
          vehicle: true,
          company: true,
          assignment: true,
        },
      });

      return {
        ok: true as const,
        request: approvedRequest,
        assignment,
        calendarEvent,
      };
    });

    if (!result.ok) {
      throw new BadRequestException(result.conflictReason);
    }

    await this.companyEmailsService.updateEmailStatusAfterAssignmentChange(result.assignment.companyId, result.assignment.workDate);

    await this.safeAuditLog({
      actorUserId: currentUserId,
      action: 'transport_request.approved',
      entityType: 'transport_request',
      entityId: result.request.id,
      summary: 'Transport request approved',
      metadata: {
        status: result.request.status,
        assignmentId: result.assignment.id,
      },
    });

    return {
      request: result.request,
      assignment: result.assignment,
      calendarEvent: result.calendarEvent,
    };
  }

  async rejectRequest(requestId: string, reason?: string, actorUserId?: string) {
    // TODO(notifications): create notification when a new transport request is created.
    const request = await this.prisma.transportRequest.findUnique({
      where: { id: requestId },
      select: { id: true },
    });

    if (!request) {
      throw new NotFoundException('Transport request not found');
    }

    const rejected = await this.prisma.transportRequest.update({
      where: { id: requestId },
      data: {
        status: TransportRequestStatus.rejected,
        conflictReason: reason ?? null,
      },
    });

    await this.safeAuditLog({
      actorUserId,
      action: 'transport_request.rejected',
      entityType: 'transport_request',
      entityId: rejected.id,
      summary: 'Transport request rejected',
      metadata: {
        status: rejected.status,
        reason: reason ?? null,
      },
    });

    return rejected;
  }
}
