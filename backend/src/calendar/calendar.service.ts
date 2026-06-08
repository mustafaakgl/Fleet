import { Injectable, NotFoundException } from '@nestjs/common';
import { CalendarSource, CalendarStatus, Prisma } from '@prisma/client';
import { safeAuditLog } from '../audit/audit-helper';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

type CreateCalendarEventInput = {
  driverId: string;
  assignmentId?: string;
  date: Date;
  status: CalendarStatus;
  source: CalendarSource;
};

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private enumerateDatesInclusive(startDate: Date, endDate: Date): Date[] {
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

  private getClient(tx?: Prisma.TransactionClient): Prisma.TransactionClient | PrismaService {
    return tx ?? this.prisma;
  }

  async createCalendarEvent(input: CreateCalendarEventInput, actorUserId?: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: input.driverId },
      select: { id: true },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const normalizedDate = new Date(input.date);
    normalizedDate.setHours(0, 0, 0, 0);

    if (input.source === CalendarSource.manual) {
      await this.prisma.calendarEvent.deleteMany({
        where: {
          driverId: input.driverId,
          date: normalizedDate,
          source: CalendarSource.manual,
        },
      });
    }

    const event = await this.prisma.calendarEvent.create({
      data: {
        driverId: input.driverId,
        assignmentId: input.assignmentId,
        date: normalizedDate,
        status: input.status,
        source: input.source,
      },
    });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'calendar_event.created',
      entityType: 'calendar_event',
      entityId: event.id,
      summary: 'Manual calendar event created',
    });

    return event;
  }

  async listCalendarEvents(query?: { driver_id?: string; from?: string; to?: string }) {
    const where: Prisma.CalendarEventWhereInput = {};
    if (query?.driver_id) where.driverId = query.driver_id;
    if (query?.from || query?.to) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (query.from) {
        const f = new Date(query.from);
        if (Number.isNaN(f.getTime())) {
          throw new NotFoundException('Invalid from date');
        }
        f.setHours(0, 0, 0, 0);
        dateFilter.gte = f;
      }
      if (query.to) {
        const t = new Date(query.to);
        if (Number.isNaN(t.getTime())) {
          throw new NotFoundException('Invalid to date');
        }
        t.setHours(23, 59, 59, 999);
        dateFilter.lte = t;
      }
      where.date = dateFilter;
    }

    return this.prisma.calendarEvent.findMany({
      where,
      include: { driver: true, assignment: true },
      orderBy: { date: 'asc' },
    });
  }

  async getDriverCalendar(driverId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      select: { id: true },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    return this.prisma.calendarEvent.findMany({
      where: { driverId },
      include: {
        assignment: true,
      },
      orderBy: { date: 'asc' },
    });
  }

  async deleteCalendarEvent(id: string, actorUserId?: string) {
    const existing = await this.prisma.calendarEvent.findUnique({
      where: { id },
      select: { id: true, source: true },
    });
    if (!existing) throw new NotFoundException('Calendar event not found');
    if (existing.source !== CalendarSource.manual) {
      throw new NotFoundException(
        `Only manual calendar events can be deleted directly (this one is from ${existing.source})`,
      );
    }
    await this.prisma.calendarEvent.delete({ where: { id } });
    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'calendar_event.deleted',
      entityType: 'calendar_event',
      entityId: id,
      summary: 'Manual calendar event deleted',
    });
    return { id, deleted: true };
  }

  async createRequestCalendarEvents(
    input: {
      driverId: string;
      requestId: string;
      startDate: Date;
      endDate: Date;
      status: string;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const db = this.getClient(tx);

    const dates = this.enumerateDatesInclusive(input.startDate, input.endDate);
    const rows = dates.map((date) => ({
      driverId: input.driverId,
      requestId: input.requestId,
      date,
      status: input.status as any,
      source: CalendarSource.leave,
    }));

    if (rows.length > 0) {
      await db.calendarEvent.createMany({
        data: rows as any,
      });
    }

    return db.calendarEvent.findMany({
      where: {
        requestId: input.requestId,
        source: CalendarSource.leave,
      } as any,
      orderBy: { date: 'asc' },
    });
  }

  async removeRequestCalendarEvents(requestId: string, tx?: Prisma.TransactionClient) {
    const db = this.getClient(tx);

    return db.calendarEvent.deleteMany({
      where: {
        requestId,
        source: CalendarSource.leave,
        status: {
          in: [
            'UT',
            'KT',
            'SCH',
            'GR',
            'AZ',
            'SZ',
            'US',
            'FR',
            'AB',
          ],
        } as any,
      },
    });
  }
}
