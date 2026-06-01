import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type LogActionParams = {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary?: string | null;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
};

type AuditLogFilters = {
  actorUserId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  dateFrom?: string;
  dateTo?: string;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async logAction(params: LogActionParams) {
    return this.prisma.auditLog.create({
      data: {
        actorUserId: params.actorUserId ?? null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        summary: params.summary ?? null,
        metadata: params.metadata ?? Prisma.JsonNull,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
      },
    });
  }

  async listAuditLogs(filters: AuditLogFilters) {
    const where: Prisma.AuditLogWhereInput = {};

    if (filters.actorUserId) where.actorUserId = filters.actorUserId;
    if (filters.action) where.action = filters.action;
    if (filters.entityType) where.entityType = filters.entityType;
    if (filters.entityId) where.entityId = filters.entityId;

    if (filters.dateFrom || filters.dateTo) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (filters.dateFrom) {
        const dateFrom = new Date(filters.dateFrom);
        if (!Number.isNaN(dateFrom.getTime())) {
          createdAt.gte = dateFrom;
        }
      }
      if (filters.dateTo) {
        const dateTo = new Date(filters.dateTo);
        if (!Number.isNaN(dateTo.getTime())) {
          createdAt.lte = dateTo;
        }
      }
      if (createdAt.gte || createdAt.lte) {
        where.createdAt = createdAt;
      }
    }

    return this.prisma.auditLog.findMany({
      where,
      include: {
        actorUser: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  async getEntityAuditLogs(entityType: string, entityId: string) {
    return this.listAuditLogs({ entityType, entityId });
  }

  async getUserAuditLogs(userId: string) {
    return this.listAuditLogs({ actorUserId: userId });
  }
}
