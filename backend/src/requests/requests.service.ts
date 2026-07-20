import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CalendarStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { DriverNotifyService } from '../notifications/driver-notify.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { UpdateRequestDto } from './dto/update-request.dto';

type RequestType =
  | 'vacation'
  | 'sick_leave'
  | 'training'
  | 'business_trip'
  | 'doctor_appointment'
  | 'special_leave'
  | 'overtime_compensation'
  | 'free_day'
  | 'uniform_delivery'
  | 'other';

type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

const REQUEST_TYPES: RequestType[] = [
  'vacation',
  'sick_leave',
  'training',
  'business_trip',
  'doctor_appointment',
  'special_leave',
  'overtime_compensation',
  'free_day',
  'uniform_delivery',
  'other',
];

const REQUEST_STATUSES: RequestStatus[] = ['pending', 'approved', 'rejected', 'cancelled'];

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
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

  private parseDateInput(value?: string): Date | undefined {
    if (value === undefined) {
      return undefined;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Invalid date value');
    }

    return parsed;
  }

  private ensureRequestType(value: string): RequestType {
    if (!REQUEST_TYPES.includes(value as RequestType)) {
      throw new BadRequestException('Invalid request type');
    }

    return value as RequestType;
  }

  private ensureRequestStatus(value: string): RequestStatus {
    if (!REQUEST_STATUSES.includes(value as RequestStatus)) {
      throw new BadRequestException('Invalid request status');
    }

    return value as RequestStatus;
  }

  mapRequestTypeToCalendarStatus(type: RequestType): CalendarStatus {
    if (type === 'vacation') return CalendarStatus.UT;
    if (type === 'sick_leave') return CalendarStatus.KT;
    if (type === 'training') return CalendarStatus.SCH;
    if (type === 'business_trip') return CalendarStatus.GR;
    if (type === 'doctor_appointment') return CalendarStatus.AZ;
    if (type === 'special_leave') return CalendarStatus.SZ;
    if (type === 'overtime_compensation') return CalendarStatus.US;
    if (type === 'free_day') return CalendarStatus.FR;
    return CalendarStatus.AB;
  }

  getDatesBetween(startDate: Date, endDate: Date): Date[] {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);

    const dates: Date[] = [];
    const cursor = new Date(start);

    while (cursor <= end) {
      dates.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    return dates;
  }

  async createRequest(dto: CreateRequestDto, actorUserId?: string) {
    const startDate = this.parseDateInput(dto.startDate);
    const endDate = this.parseDateInput(dto.endDate);

    if (!startDate || !endDate) {
      throw new BadRequestException('startDate and endDate are required');
    }

    if (endDate < startDate) {
      throw new BadRequestException('endDate must be greater than or equal to startDate');
    }

    const requestType = this.ensureRequestType(dto.type);

    const driver = await this.prisma.driver.findUnique({ where: { id: dto.driverId }, select: { id: true } });
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const created = await this.prisma.request.create({
      data: {
        driverId: dto.driverId,
        type: requestType,
        startDate,
        endDate,
        reason: dto.reason ?? null,
        status: 'pending',
      },
      include: {
        driver: true,
        approvedBy: true,
        calendarEvents: true,
      },
    });

    await this.safeAuditLog({
      actorUserId,
      action: 'request.created',
      entityType: 'request',
      entityId: created.id,
      summary: 'Request created',
      metadata: {
        driverId: created.driverId,
        type: created.type,
        status: created.status,
      },
    });

    return created;
  }

  async listRequests(filters: {
    driverId?: string;
    status?: string;
    type?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const where: Prisma.RequestWhereInput = {};

    if (filters.driverId) {
      where.driverId = filters.driverId;
    }

    if (filters.status) {
      where.status = this.ensureRequestStatus(filters.status);
    }

    if (filters.type) {
      where.type = this.ensureRequestType(filters.type);
    }

    if (filters.startDate || filters.endDate) {
      const dateRange: Record<string, Date> = {};
      const parsedStart = this.parseDateInput(filters.startDate);
      const parsedEnd = this.parseDateInput(filters.endDate);

      if (parsedStart) {
        dateRange.gte = parsedStart;
      }
      if (parsedEnd) {
        dateRange.lte = parsedEnd;
      }

      where.startDate = dateRange;
    }

    return this.prisma.request.findMany({
      where,
      include: {
        driver: true,
        approvedBy: true,
        calendarEvents: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getRequestById(id: string) {
    const request = await this.prisma.request.findUnique({
      where: { id },
      include: {
        driver: true,
        approvedBy: true,
        calendarEvents: true,
      },
    });

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    return request;
  }

  async updateRequest(id: string, dto: UpdateRequestDto, actorUserId?: string) {
    await this.getRequestById(id);

    const payload: Prisma.RequestUpdateInput = {};

    if (dto.type !== undefined) {
      payload.type = this.ensureRequestType(dto.type);
    }

    if (dto.reason !== undefined) {
      payload.reason = dto.reason;
    }

    if (dto.status !== undefined) {
      payload.status = this.ensureRequestStatus(dto.status);
    }

    const parsedStartDate = this.parseDateInput(dto.startDate);
    if (dto.startDate !== undefined) {
      payload.startDate = parsedStartDate;
    }

    const parsedEndDate = this.parseDateInput(dto.endDate);
    if (dto.endDate !== undefined) {
      payload.endDate = parsedEndDate;
    }

    const current = await this.prisma.request.findUnique({ where: { id } });
    if (!current) {
      throw new NotFoundException('Request not found');
    }

    const effectiveStartDate: Date = parsedStartDate ?? current.startDate;
    const effectiveEndDate: Date = parsedEndDate ?? current.endDate;

    if (effectiveEndDate < effectiveStartDate) {
      throw new BadRequestException('endDate must be greater than or equal to startDate');
    }

    const updated = await this.prisma.request.update({
      where: { id },
      data: payload,
      include: {
        driver: true,
        approvedBy: true,
        calendarEvents: true,
      },
    });

    await this.safeAuditLog({
      actorUserId,
      action: 'request.updated',
      entityType: 'request',
      entityId: updated.id,
      summary: 'Request updated',
      metadata: {
        status: updated.status,
        type: updated.type,
      },
    });

    return updated;
  }

  async approveRequest(id: string, approverUserId?: string) {
    if (!approverUserId) {
      throw new BadRequestException('Authenticated approver is required');
    }

    const approved = await this.prisma.$transaction(async (tx) => {
      const request = await tx.request.findUnique({
        where: { id },
        include: {
          driver: true,
        },
      });

      if (!request) {
        throw new NotFoundException('Request not found');
      }

      if (!request.driver) {
        throw new NotFoundException('Driver not found');
      }

      if (request.status !== 'pending') {
        throw new BadRequestException('Only pending requests can be approved');
      }

      if (request.endDate < request.startDate) {
        throw new BadRequestException('endDate must be greater than or equal to startDate');
      }

      const approver = await tx.user.findUnique({ where: { id: approverUserId }, select: { id: true } });
      if (!approver) {
        throw new NotFoundException('Approver user not found');
      }

      const calendarStatus = this.mapRequestTypeToCalendarStatus(request.type as RequestType);
      const dates = this.getDatesBetween(request.startDate, request.endDate);

      for (const date of dates) {
        await tx.calendarEvent.create({
          data: {
            driverId: request.driverId,
            requestId: request.id,
            date,
            status: calendarStatus,
            source: 'leave',
          },
        });
      }

      return tx.request.update({
        where: { id: request.id },
        data: {
          status: 'approved',
          approvedById: approverUserId,
        },
        include: {
          driver: true,
          approvedBy: true,
          calendarEvents: true,
        },
      });
    });

    await this.safeAuditLog({
      actorUserId: approverUserId,
      action: 'request.approved',
      entityType: 'request',
      entityId: approved.id,
      summary: 'Request approved',
      metadata: {
        approvedById: approverUserId,
        status: approved.status,
      },
    });

    if (approved.driver?.userId) {
      this.driverNotify.notifyUserSafely({
        userId: approved.driver.userId,
        key: 'request_approved',
        type: 'request',
        relatedEntityType: 'request',
        relatedEntityId: approved.id,
      });
    }

    return approved;
  }

  async rejectRequest(id: string, actorUserId?: string) {
    const request = await this.prisma.request.findUnique({ where: { id } });

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    if (request.status !== 'pending') {
      throw new BadRequestException('Only pending requests can be rejected');
    }

    const rejected = await this.prisma.request.update({
      where: { id },
      data: {
        status: 'rejected',
      },
      include: {
        driver: true,
        approvedBy: true,
        calendarEvents: true,
      },
    });

    await this.safeAuditLog({
      actorUserId,
      action: 'request.rejected',
      entityType: 'request',
      entityId: rejected.id,
      summary: 'Request rejected',
      metadata: {
        status: rejected.status,
      },
    });

    if (rejected.driver?.userId) {
      this.driverNotify.notifyUserSafely({
        userId: rejected.driver.userId,
        key: 'request_rejected',
        type: 'request',
        relatedEntityType: 'request',
        relatedEntityId: rejected.id,
      });
    }

    return rejected;
  }

  async cancelRequest(id: string, actorUserId?: string) {
    const cancelled = await this.prisma.$transaction(async (tx) => {
      const request = await tx.request.findUnique({ where: { id } });
      if (!request) {
        throw new NotFoundException('Request not found');
      }

      await tx.calendarEvent.deleteMany({
        where: {
          requestId: id,
        },
      });

      return tx.request.update({
        where: { id },
        data: {
          status: 'cancelled',
        },
        include: {
          driver: true,
          approvedBy: true,
          calendarEvents: true,
        },
      });
    });

    await this.safeAuditLog({
      actorUserId,
      action: 'request.cancelled',
      entityType: 'request',
      entityId: cancelled.id,
      summary: 'Request cancelled',
      metadata: {
        status: cancelled.status,
      },
    });

    return cancelled;
  }
}
