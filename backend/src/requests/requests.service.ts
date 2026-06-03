import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

  mapRequestTypeToCalendarStatus(type: RequestType): string {
    if (type === 'vacation') return 'UT';
    if (type === 'sick_leave') return 'KT';
    if (type === 'training') return 'SCH';
    if (type === 'business_trip') return 'GR';
    if (type === 'doctor_appointment') return 'AZ';
    if (type === 'special_leave') return 'SZ';
    if (type === 'overtime_compensation') return 'US';
    if (type === 'free_day') return 'FR';
    return 'AB';
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

    const db = this.prisma as any;
    const created = await db.request.create({
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
    const where: Record<string, unknown> = {};

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

    const db = this.prisma as any;
    return db.request.findMany({
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
    const db = this.prisma as any;
    const request = await db.request.findUnique({
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

    const payload: Record<string, unknown> = {};

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

    const db = this.prisma as any;
    const current = await db.request.findUnique({ where: { id } });

    const effectiveStartDate: Date = parsedStartDate ?? current.startDate;
    const effectiveEndDate: Date = parsedEndDate ?? current.endDate;

    if (effectiveEndDate < effectiveStartDate) {
      throw new BadRequestException('endDate must be greater than or equal to startDate');
    }

    const updated = await db.request.update({
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

  async approveRequest(id: string, currentUserId: string, actorUserId?: string) {
    if (!currentUserId) {
      throw new BadRequestException('currentUserId is required');
    }

    const approved = await this.prisma.$transaction(async (tx) => {
      const db = tx as any;

      const request = await db.request.findUnique({
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

      const approver = await db.user.findUnique({ where: { id: currentUserId }, select: { id: true } });
      if (!approver) {
        throw new NotFoundException('Approver user not found');
      }

      const calendarStatus = this.mapRequestTypeToCalendarStatus(request.type as RequestType);
      const dates = this.getDatesBetween(request.startDate, request.endDate);

      for (const date of dates) {
        await db.calendarEvent.create({
          data: {
            driverId: request.driverId,
            requestId: request.id,
            date,
            status: calendarStatus,
            source: 'leave',
          },
        });
      }

      await db.request.update({
        where: { id: request.id },
        data: {
          status: 'approved',
          approvedById: currentUserId,
        },
      });

      return db.request.findUnique({
        where: { id: request.id },
        include: {
          driver: true,
          approvedBy: true,
          calendarEvents: true,
        },
      });
    });

    await this.safeAuditLog({
      actorUserId: actorUserId ?? currentUserId,
      action: 'request.approved',
      entityType: 'request',
      entityId: approved.id,
      summary: 'Request approved',
      metadata: {
        approvedById: currentUserId,
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
    const db = this.prisma as any;
    const request = await db.request.findUnique({ where: { id } });

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    if (request.status !== 'pending') {
      throw new BadRequestException('Only pending requests can be rejected');
    }

    const rejected = await db.request.update({
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
      const db = tx as any;

      const request = await db.request.findUnique({ where: { id } });
      if (!request) {
        throw new NotFoundException('Request not found');
      }

      await db.calendarEvent.deleteMany({
        where: {
          requestId: id,
        },
      });

      return db.request.update({
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
