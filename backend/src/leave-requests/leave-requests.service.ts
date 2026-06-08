import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RequestStatus, RequestType } from '@prisma/client';
import { changedFieldNames, safeAuditLog } from '../audit/audit-helper';
import { AuditService } from '../audit/audit.service';
import { CalendarService } from '../calendar/calendar.service';
import { DriverNotifyService } from '../notifications/driver-notify.service';
import { OperationalNotifyService } from '../notifications/operational-notify.service';
import { PrismaService } from '../prisma/prisma.service';

type RequestRecord = {
  id: string;
  driverId: string;
  type: RequestType;
  startDate: Date;
  endDate: Date;
  status: RequestStatus;
  approvedById: string | null;
  driver: { id: string; userId: string | null; firstName: string; lastName: string } | null;
};

@Injectable()
export class LeaveRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calendarService: CalendarService,
    private readonly driverNotify: DriverNotifyService,
    private readonly operationalNotify: OperationalNotifyService,
    private readonly auditService: AuditService,
  ) {}

  async list(query: { driver_id?: string; status?: string; type?: string }) {
    const where: Prisma.RequestWhereInput = {};
    if (query.driver_id) where.driverId = query.driver_id;
    if (query.status && Object.values(RequestStatus).includes(query.status as RequestStatus)) {
      where.status = query.status as RequestStatus;
    }
    if (query.type && Object.values(RequestType).includes(query.type as RequestType)) {
      where.type = query.type as RequestType;
    }
    return this.prisma.request.findMany({
      where,
      include: { driver: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { startDate: 'desc' },
    });
  }

  async getById(id: string) {
    const request = await this.prisma.request.findUnique({
      where: { id },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true } },
        calendarEvents: true,
      },
    });
    if (!request) throw new NotFoundException('Request not found');
    return request;
  }

  async create(input: {
    driverId: string;
    type: RequestType;
    startDate: Date;
    endDate: Date;
    reason?: string;
  }) {
    if (input.endDate < input.startDate) {
      throw new BadRequestException('endDate must be greater than or equal to startDate');
    }
    const driver = await this.prisma.driver.findUnique({
      where: { id: input.driverId },
      select: { id: true },
    });
    if (!driver) throw new NotFoundException('Driver not found');

    const created = await this.prisma.request.create({
      data: {
        driverId: input.driverId,
        type: input.type,
        startDate: input.startDate,
        endDate: input.endDate,
        reason: input.reason,
        status: RequestStatus.pending,
      },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true, userId: true } },
      },
    });

    const driverName = created.driver
      ? `${created.driver.firstName} ${created.driver.lastName}`.trim()
      : 'Driver';

    this.operationalNotify.notifyOperationalUsersSafely({
      key: 'driver_request_created',
      params: {
        driverName,
        requestType: created.type.replaceAll('_', ' '),
      },
      type: 'request',
      relatedEntityType: 'request',
      relatedEntityId: created.id,
    });

    await safeAuditLog(this.auditService, {
      action: 'leave_request.created',
      entityType: 'request',
      entityId: created.id,
      summary: 'Leave request created',
      metadata: { driverId: created.driverId, type: created.type },
    });

    return created;
  }

  async moveToNeedsReview(requestId: string, actorUserId?: string) {
    const request = await this.prisma.request.findUnique({
      where: { id: requestId },
      select: { id: true, status: true },
    });
    if (!request) throw new NotFoundException('Request not found');
    if (request.status !== RequestStatus.pending) {
      throw new BadRequestException('Only pending requests can be moved to needs_review');
    }
    const updated = await this.prisma.request.update({
      where: { id: requestId },
      data: { status: RequestStatus.needs_review },
      include: { driver: { select: { id: true, firstName: true, lastName: true } } },
    });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'leave_request.needs_review',
      entityType: 'request',
      entityId: requestId,
      summary: 'Leave request moved to needs review',
    });

    return updated;
  }

  private mapRequestTypeToCalendarStatus(type: RequestType): string {
    if (type === 'vacation') {
      return 'UT';
    }

    if (type === 'sick_leave') {
      return 'KT';
    }

    if (type === 'training') {
      return 'SCH';
    }

    if (type === 'business_trip') {
      return 'GR';
    }

    if (type === 'doctor_appointment') {
      return 'AZ';
    }

    if (type === 'special_leave') {
      return 'SZ';
    }

    return 'AB';
  }

  async approveLeaveRequest(requestId: string, currentUserId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const db = tx as any;

      const request = (await db.request.findUnique({
        where: { id: requestId },
        include: { driver: true },
      })) as RequestRecord | null;

      if (!request) {
        throw new NotFoundException('Request not found');
      }

      if (request.status !== 'pending') {
        throw new BadRequestException('Only pending requests can be approved');
      }

      if (!request.driver) {
        throw new NotFoundException('Driver not found');
      }

      if (request.endDate < request.startDate) {
        throw new BadRequestException('endDate must be greater than or equal to startDate');
      }

      const calendarStatus = this.mapRequestTypeToCalendarStatus(request.type);

      const calendarEvents = await this.calendarService.createRequestCalendarEvents(
        {
          driverId: request.driverId,
          requestId: request.id,
          startDate: request.startDate,
          endDate: request.endDate,
          status: calendarStatus,
        },
        tx,
      );

      const updatedRequest = await db.request.update({
        where: { id: request.id },
        data: {
          status: 'approved',
          approvedById: currentUserId,
        },
        include: { driver: true },
      });

      return {
        request: updatedRequest,
        calendarEvents,
      };
    });

    const driverUserId = result.request.driver?.userId;
    if (driverUserId) {
      this.driverNotify.notifyUserSafely({
        userId: driverUserId,
        key: 'request_approved',
        type: 'request',
        relatedEntityType: 'request',
        relatedEntityId: result.request.id,
      });
    }

    await safeAuditLog(this.auditService, {
      actorUserId: currentUserId,
      action: 'leave_request.approved',
      entityType: 'request',
      entityId: result.request.id,
      summary: 'Leave request approved',
      metadata: { driverId: result.request.driverId },
    });

    return result;
  }

  async rejectLeaveRequest(requestId: string, currentUserId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const db = tx as any;

      const request = (await db.request.findUnique({
        where: { id: requestId },
        include: { driver: true },
      })) as RequestRecord | null;

      if (!request) {
        throw new NotFoundException('Request not found');
      }

      if (request.status !== 'pending') {
        throw new BadRequestException('Only pending requests can be rejected');
      }

      if (!request.driver) {
        throw new NotFoundException('Driver not found');
      }

      return db.request.update({
        where: { id: request.id },
        data: {
          status: 'rejected',
          approvedById: currentUserId,
        },
        include: { driver: true },
      });
    });

    const driverUserId = result.driver?.userId;
    if (driverUserId) {
      this.driverNotify.notifyUserSafely({
        userId: driverUserId,
        key: 'request_rejected',
        type: 'request',
        relatedEntityType: 'request',
        relatedEntityId: result.id,
      });
    }

    await safeAuditLog(this.auditService, {
      actorUserId: currentUserId,
      action: 'leave_request.rejected',
      entityType: 'request',
      entityId: result.id,
      summary: 'Leave request rejected',
      metadata: { driverId: result.driverId },
    });

    return result;
  }

  async cancelLeaveRequest(requestId: string, actorUserId?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const db = tx as any;

      const request = (await db.request.findUnique({
        where: { id: requestId },
      })) as RequestRecord | null;

      if (!request) {
        throw new NotFoundException('Request not found');
      }

      if (request.status !== 'approved') {
        throw new BadRequestException('Only approved requests can be cancelled');
      }

      await this.calendarService.removeRequestCalendarEvents(request.id, tx);

      return db.request.update({
        where: { id: request.id },
        data: {
          status: 'cancelled',
        },
      });
    });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'leave_request.cancelled',
      entityType: 'request',
      entityId: result.id,
      summary: 'Leave request cancelled',
      metadata: { changedFields: changedFieldNames({ status: 'cancelled' }) },
    });

    return result;
  }
}
