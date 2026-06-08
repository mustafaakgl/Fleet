import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';

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
  page?: number;
  limit?: number;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async logAction(params: LogActionParams) {
    const tenantId = TenantContext.getTenantId();
    return this.prisma.auditLog.create({
      data: {
        tenantId: tenantId ?? null,
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

    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(500, Math.max(1, filters.limit ?? 100));
    const skip = (page - 1) * limit;

    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
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
        skip,
        take: limit,
      }),
    ]);

    return {
      data: rows,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async exportAuditLogsCsv(filters: AuditLogFilters): Promise<string> {
    const allRows: Awaited<ReturnType<typeof this.listAuditLogs>>['data'] = [];
    const pageSize = 500;
    let page = 1;
    let pages = 1;

    do {
      const result = await this.listAuditLogs({ ...filters, page, limit: pageSize });
      allRows.push(...result.data);
      pages = result.pages;
      page += 1;
    } while (page <= pages && page <= 20);

    const header = 'created_at,action,entity_type,entity_id,actor_email,summary';
    const lines = allRows.map((row) => {
      const cols = [
        row.createdAt.toISOString(),
        row.action,
        row.entityType,
        row.entityId ?? '',
        row.actorUser?.email ?? '',
        (row.summary ?? '').replace(/"/g, '""'),
      ];
      return cols.map((value) => `"${value}"`).join(',');
    });
    return [header, ...lines].join('\n');
  }

  async getEntityAuditLogs(entityType: string, entityId: string) {
    return this.listAuditLogs({ entityType, entityId });
  }

  async getUserAuditLogs(userId: string) {
    return this.listAuditLogs({ actorUserId: userId });
  }
}
