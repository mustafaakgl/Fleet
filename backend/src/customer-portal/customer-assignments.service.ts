import { Injectable, NotFoundException } from '@nestjs/common';
import { AssignmentStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { toCustomerAssignmentDto } from './customer-assignment.mapper';
import type { CustomerAssignmentDto, CustomerDashboardStats } from './customer-assignment.types';
import type { ListCustomerAssignmentsQueryDto } from './dto/list-customer-assignments-query.dto';

const ACTIVE_STATUSES: AssignmentStatus[] = [
  AssignmentStatus.planned,
  AssignmentStatus.confirmed,
  AssignmentStatus.in_progress,
];

const UPCOMING_STATUSES: AssignmentStatus[] = [AssignmentStatus.planned, AssignmentStatus.confirmed];

const assignmentSelect = {
  id: true,
  status: true,
  workDate: true,
  startTime: true,
  endTime: true,
  cargoName: true,
  cargoOwner: true,
  pickupAddress: true,
  deliveryAddress: true,
  routeName: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  driver: {
    select: {
      firstName: true,
      lastName: true,
    },
  },
  vehicle: {
    select: {
      plateNumber: true,
    },
  },
  company: {
    select: {
      name: true,
      portalSettings: {
        select: {
          showDriverFullName: true,
          showInternalNotes: true,
        },
      },
    },
  },
} satisfies Prisma.AssignmentSelect;

@Injectable()
export class CustomerAssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
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

  private getStartOfDay(date = new Date()): Date {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  private getEndOfDay(date: Date): Date {
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return end;
  }

  private parseDateBoundary(value: string | undefined, endOfDay: boolean): Date | undefined {
    if (!value) {
      return undefined;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return undefined;
    }

    return endOfDay ? this.getEndOfDay(parsed) : this.getStartOfDay(parsed);
  }

  private buildCompanyScope(companyIds: string[]): Prisma.AssignmentWhereInput {
    return {
      companyId: { in: companyIds },
    };
  }

  private buildListWhere(
    companyIds: string[],
    query: ListCustomerAssignmentsQueryDto,
  ): Prisma.AssignmentWhereInput {
    const where: Prisma.AssignmentWhereInput = this.buildCompanyScope(companyIds);

    if (query.status) {
      where.status = query.status;
    }

    const from = this.parseDateBoundary(query.from, false);
    const to = this.parseDateBoundary(query.to, true);

    if (from || to) {
      where.workDate = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    }

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { cargoName: { contains: search, mode: 'insensitive' } },
        { cargoOwner: { contains: search, mode: 'insensitive' } },
        { pickupAddress: { contains: search, mode: 'insensitive' } },
        { deliveryAddress: { contains: search, mode: 'insensitive' } },
        { routeName: { contains: search, mode: 'insensitive' } },
        { company: { name: { contains: search, mode: 'insensitive' } } },
        { vehicle: { plateNumber: { contains: search, mode: 'insensitive' } } },
        { driver: { firstName: { contains: search, mode: 'insensitive' } } },
        { driver: { lastName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    return where;
  }

  async getDashboard(actorUserId: string, companyIds: string[]): Promise<CustomerDashboardStats> {
    const todayStart = this.getStartOfDay();
    const todayEnd = this.getEndOfDay(todayStart);
    const companyScope = this.buildCompanyScope(companyIds);

    const [activeTransports, inProgress, completedToday, upcoming] = await Promise.all([
      this.prisma.assignment.count({
        where: {
          ...companyScope,
          status: { in: ACTIVE_STATUSES },
          workDate: { gte: todayStart },
        },
      }),
      this.prisma.assignment.count({
        where: {
          ...companyScope,
          status: AssignmentStatus.in_progress,
        },
      }),
      this.prisma.assignment.count({
        where: {
          ...companyScope,
          status: AssignmentStatus.completed,
          workDate: {
            gte: todayStart,
            lte: todayEnd,
          },
        },
      }),
      this.prisma.assignment.count({
        where: {
          ...companyScope,
          status: { in: UPCOMING_STATUSES },
          workDate: { gt: todayEnd },
        },
      }),
    ]);

    await this.safeAuditLog({
      actorUserId,
      action: 'customer.dashboard_viewed',
      entityType: 'customer_portal',
      summary: 'Customer dashboard viewed',
      metadata: { companyIds },
    });

    return {
      activeTransports,
      inProgress,
      completedToday,
      upcoming,
      pendingProofs: 0,
    };
  }

  async listAssignments(
    actorUserId: string,
    companyIds: string[],
    query: ListCustomerAssignmentsQueryDto,
  ): Promise<{ data: CustomerAssignmentDto[]; page: number; limit: number; total: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildListWhere(companyIds, query);

    const [total, rows] = await Promise.all([
      this.prisma.assignment.count({ where }),
      this.prisma.assignment.findMany({
        where,
        select: assignmentSelect,
        orderBy: [{ workDate: 'desc' }, { startTime: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    await this.safeAuditLog({
      actorUserId,
      action: 'customer.assignments_list_viewed',
      entityType: 'customer_portal',
      summary: 'Customer assignments list viewed',
      metadata: {
        companyIds,
        filters: {
          status: query.status ?? null,
          from: query.from ?? null,
          to: query.to ?? null,
          search: query.search ?? null,
          page,
          limit,
        },
      },
    });

    return {
      data: rows.map(toCustomerAssignmentDto),
      page,
      limit,
      total,
    };
  }

  async getAssignmentById(
    actorUserId: string,
    companyIds: string[],
    assignmentId: string,
  ): Promise<CustomerAssignmentDto> {
    const assignment = await this.prisma.assignment.findFirst({
      where: {
        id: assignmentId,
        companyId: { in: companyIds },
      },
      select: assignmentSelect,
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    await this.safeAuditLog({
      actorUserId,
      action: 'customer.assignment_viewed',
      entityType: 'assignment',
      entityId: assignmentId,
      summary: 'Customer assignment detail viewed',
      metadata: {
        companyIds,
        assignmentId,
      },
    });

    return toCustomerAssignmentDto(assignment);
  }
}
