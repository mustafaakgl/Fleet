import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type WorkSessionEndReason = 'manual' | 'app_background' | 'logout';

@Injectable()
export class WorkSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getActiveSessionForDriver(driverId: string) {
    return this.prisma.workSession.findFirst({
      where: { driverId, status: 'active' },
      orderBy: { startedAt: 'desc' },
    });
  }

  async startSession(driverId: string) {
    const active = await this.getActiveSessionForDriver(driverId);
    if (active) {
      return active;
    }

    return this.prisma.workSession.create({
      data: {
        driverId,
        status: 'active',
      },
    });
  }

  async endSession(driverId: string, reason: WorkSessionEndReason) {
    const active = await this.getActiveSessionForDriver(driverId);
    if (!active) {
      return null;
    }

    return this.prisma.workSession.update({
      where: { id: active.id },
      data: {
        status: 'ended',
        endedAt: new Date(),
        endReason: reason,
      },
    });
  }

  async listSessions(filters: {
    driverId?: string;
    dateFrom?: string;
    dateTo?: string;
    status?: 'active' | 'ended';
  }) {
    const where: Record<string, unknown> = {};

    if (filters.driverId) {
      where.driverId = filters.driverId;
    }
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.dateFrom || filters.dateTo) {
      const range: Record<string, Date> = {};
      if (filters.dateFrom) {
        const parsed = new Date(filters.dateFrom);
        parsed.setHours(0, 0, 0, 0);
        range.gte = parsed;
      }
      if (filters.dateTo) {
        const parsed = new Date(filters.dateTo);
        parsed.setHours(23, 59, 59, 999);
        range.lte = parsed;
      }
      where.startedAt = range;
    }

    return this.prisma.workSession.findMany({
      where,
      include: {
        driver: {
          select: { id: true, firstName: true, lastName: true, employeeNumber: true },
        },
      },
      orderBy: { startedAt: 'desc' },
      take: 200,
    });
  }

  async getSessionById(id: string) {
    const row = await this.prisma.workSession.findUnique({
      where: { id },
      include: {
        driver: {
          select: { id: true, firstName: true, lastName: true, employeeNumber: true },
        },
      },
    });
    if (!row) {
      throw new NotFoundException('Work session not found');
    }
    return row;
  }
}
