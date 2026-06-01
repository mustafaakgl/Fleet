import { BadRequestException, Injectable } from '@nestjs/common';
import { maskFinancialFields, type UserRole } from '../common/utils/permissions';
import { PrismaService } from '../prisma/prisma.service';

type AlertPriority = 'low' | 'medium' | 'high' | 'critical';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeDate(dateInput?: string | Date): Date {
    const date = dateInput ? new Date(dateInput) : new Date();
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date');
    }
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private getDayRange(dateInput?: string | Date): { start: Date; end: Date } {
    const start = this.normalizeDate(dateInput);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  private getWeekRange(dateInput?: string | Date): { start: Date; end: Date } {
    const day = this.normalizeDate(dateInput);
    const start = new Date(day);
    const dayOfWeek = start.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    start.setDate(start.getDate() + diff);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  }

  private getMonthRange(dateInput?: string | Date): { start: Date; end: Date } {
    const day = this.normalizeDate(dateInput);
    const start = new Date(day.getFullYear(), day.getMonth(), 1);
    const end = new Date(day.getFullYear(), day.getMonth() + 1, 1);
    return { start, end };
  }

  private toCurrencyNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    if (typeof value === 'object' && value !== null && 'toString' in value) {
      const parsed = Number(String(value));
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  canViewFinancials(role?: UserRole | string): boolean {
    return role === 'admin' || role === 'boss' || role === 'accounting';
  }

  async getKpis(date: Date) {
    const { start, end } = this.getDayRange(date);
    const db = this.prisma as any;

    const [
      activeDrivers,
      vacationRows,
      sickRows,
      vehiclesInUse,
      openAccidents,
      cargoDamages,
      expiringDocuments,
      unsentCompanyEmails,
    ] = await Promise.all([
      db.driver.count({ where: { status: 'active' } }),
      db.calendarEvent.findMany({ where: { status: 'UT', date: { gte: start, lt: end } }, select: { driverId: true } }),
      db.calendarEvent.findMany({ where: { status: 'KT', date: { gte: start, lt: end } }, select: { driverId: true } }),
      db.assignment.count({
        where: {
          workDate: { gte: start, lt: end },
          status: { in: ['planned', 'confirmed', 'in_progress', 'completed'] },
        },
      }),
      db.accident.count({ where: { type: 'vehicle_accident', status: { in: ['reported', 'under_review'] } } }),
      db.accident.count({ where: { type: 'cargo_damage', status: { in: ['reported', 'under_review'] } } }),
      db.document.count({ where: { status: { in: ['expiring_soon', 'expired'] } } }),
      db.companyEmail.count({ where: { status: { in: ['draft', 'needs_review', 'failed'] } } }),
    ]);

    return {
      activeDrivers,
      driversOnVacation: new Set(vacationRows.map((x: any) => x.driverId)).size,
      sickDrivers: new Set(sickRows.map((x: any) => x.driverId)).size,
      vehiclesInUse,
      openAccidents,
      cargoDamages,
      expiringDocuments,
      unsentCompanyEmails,
    };
  }

  async getCriticalAlerts(date: Date) {
    const { start, end } = this.getDayRange(date);
    const db = this.prisma as any;

    const alerts: Array<{
      id: string;
      type: string;
      title: string;
      message: string;
      priority: AlertPriority;
      relatedEntityType: string;
      relatedEntityId: string;
    }> = [];

    const [
      expiredDocuments,
      expiringSoonDocuments,
      missingHandoverPhotos,
      openAccidents,
      openCargoDamages,
      failedCompanyEmails,
      assignments,
    ] = await Promise.all([
      db.document.findMany({ where: { status: 'expired' }, select: { id: true, fileName: true }, orderBy: { updatedAt: 'desc' } }),
      db.document.findMany({ where: { status: 'expiring_soon' }, select: { id: true, fileName: true }, orderBy: { updatedAt: 'desc' } }),
      db.vehicleHandover.findMany({
        where: { photoRequired: true, photoStatus: 'missing' },
        include: { vehicle: { select: { plateNumber: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      db.accident.findMany({
        where: { type: 'vehicle_accident', status: { in: ['reported', 'under_review'] } },
        select: { id: true, description: true },
        orderBy: { incidentDateTime: 'desc' },
      }),
      db.accident.findMany({
        where: { type: 'cargo_damage', status: { in: ['reported', 'under_review'] } },
        select: { id: true, description: true },
        orderBy: { incidentDateTime: 'desc' },
      }),
      db.companyEmail.findMany({ where: { status: 'failed' }, include: { company: { select: { name: true } } }, orderBy: { updatedAt: 'desc' } }),
      db.assignment.findMany({
        where: {
          workDate: { gte: start, lt: end },
          status: { in: ['planned', 'confirmed', 'in_progress', 'completed'] },
        },
        include: { driver: { select: { firstName: true, lastName: true } } },
      }),
    ]);

    for (const doc of expiredDocuments) {
      alerts.push({
        id: `expired-document-${doc.id}`,
        type: 'expired_document',
        title: 'Expired document',
        message: `${doc.fileName} has expired.`,
        priority: 'critical',
        relatedEntityType: 'document',
        relatedEntityId: doc.id,
      });
    }

    for (const doc of expiringSoonDocuments) {
      alerts.push({
        id: `expiring-document-${doc.id}`,
        type: 'expiring_document',
        title: 'Document expiring soon',
        message: `${doc.fileName} is expiring soon.`,
        priority: 'medium',
        relatedEntityType: 'document',
        relatedEntityId: doc.id,
      });
    }

    for (const handover of missingHandoverPhotos) {
      alerts.push({
        id: `handover-photo-${handover.id}`,
        type: 'missing_handover_photo',
        title: 'Missing handover photo',
        message: `Handover photo missing for vehicle ${handover.vehicle?.plateNumber ?? '-'}.`,
        priority: 'high',
        relatedEntityType: 'vehicle_handover',
        relatedEntityId: handover.id,
      });
    }

    for (const accident of openAccidents) {
      alerts.push({
        id: `open-accident-${accident.id}`,
        type: 'open_vehicle_accident',
        title: 'Open vehicle accident',
        message: accident.description,
        priority: 'critical',
        relatedEntityType: 'accident',
        relatedEntityId: accident.id,
      });
    }

    for (const damage of openCargoDamages) {
      alerts.push({
        id: `open-cargo-damage-${damage.id}`,
        type: 'open_cargo_damage',
        title: 'Open cargo damage',
        message: damage.description,
        priority: 'critical',
        relatedEntityType: 'accident',
        relatedEntityId: damage.id,
      });
    }

    for (const email of failedCompanyEmails) {
      alerts.push({
        id: `failed-company-email-${email.id}`,
        type: 'failed_company_email',
        title: 'Failed company email',
        message: `Email failed for ${email.company?.name ?? '-'}.`,
        priority: 'high',
        relatedEntityType: 'company_email',
        relatedEntityId: email.id,
      });
    }

    const assignedDriverIds = Array.from(new Set(assignments.map((a: any) => a.driverId)));
    const unavailableEvents = await db.calendarEvent.findMany({
      where: {
        driverId: { in: assignedDriverIds },
        date: { gte: start, lt: end },
        status: { in: ['UT', 'KT'] },
      },
      select: { driverId: true, status: true },
    });

    const unavailableByDriver = new Map<string, string>();
    for (const event of unavailableEvents) {
      if (!unavailableByDriver.has(event.driverId)) {
        unavailableByDriver.set(event.driverId, event.status);
      }
    }

    for (const assignment of assignments) {
      const status = unavailableByDriver.get(assignment.driverId);
      if (!status) continue;
      alerts.push({
        id: `driver-assigned-unavailable-${assignment.id}`,
        type: 'driver_assigned_while_unavailable',
        title: 'Driver assigned while unavailable',
        message: `${assignment.driver.firstName} ${assignment.driver.lastName} is assigned while ${status}.`,
        priority: 'critical',
        relatedEntityType: 'assignment',
        relatedEntityId: assignment.id,
      });
    }

    return alerts;
  }

  async getTodayOperations(date: Date) {
    const { start, end } = this.getDayRange(date);
    const db = this.prisma as any;

    const assignments = await db.assignment.findMany({
      where: { workDate: { gte: start, lt: end } },
      include: {
        driver: { select: { firstName: true, lastName: true } },
        vehicle: { select: { plateNumber: true } },
        company: { select: { name: true } },
      },
      orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
    });

    return assignments.map((assignment: any) => ({
      id: assignment.id,
      driverName: `${assignment.driver.firstName} ${assignment.driver.lastName}`,
      vehiclePlate: assignment.vehicle.plateNumber,
      companyName: assignment.company.name,
      startTime: assignment.startTime,
      endTime: assignment.endTime,
      status: assignment.status,
    }));
  }

  async getTomorrowPlanning(date: Date) {
    const base = this.normalizeDate(date);
    const tomorrow = new Date(base);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const { start, end } = this.getDayRange(tomorrow);

    const db = this.prisma as any;

    const [plannedAssignments, activeDrivers, unavailableEventRows] = await Promise.all([
      db.assignment.findMany({
        where: {
          workDate: { gte: start, lt: end },
          status: { in: ['planned', 'confirmed', 'in_progress', 'completed'] },
        },
        select: { driverId: true },
      }),
      db.driver.findMany({ where: { status: 'active' }, select: { id: true } }),
      db.calendarEvent.findMany({
        where: {
          date: { gte: start, lt: end },
          status: { in: ['UT', 'KT'] },
        },
        select: {
          driverId: true,
          status: true,
          driver: { select: { firstName: true, lastName: true } },
        },
      }),
    ]);

    const plannedDrivers = new Set(plannedAssignments.map((row: any) => row.driverId)).size;
    const activeDriverIds = new Set<string>(activeDrivers.map((d: any) => String(d.id)));

    const unavailableMap = new Map<string, { status: string; name: string }>();
    for (const row of unavailableEventRows) {
      if (!unavailableMap.has(row.driverId)) {
        unavailableMap.set(row.driverId, {
          status: row.status,
          name: `${row.driver.firstName} ${row.driver.lastName}`,
        });
      }
    }

    let availableDrivers = 0;
    for (const id of activeDriverIds) {
      if (!unavailableMap.has(id)) {
        availableDrivers += 1;
      }
    }

    const missingAssignments = Math.max(availableDrivers - plannedDrivers, 0);
    const unavailableDrivers = Array.from(unavailableMap.entries()).map(([driverId, data]) => ({
      driverId,
      driverName: data.name,
      status: data.status,
    }));

    return {
      plannedDrivers,
      availableDrivers,
      missingAssignments,
      unavailableDrivers,
    };
  }

  async getVehicleHealth() {
    const now = this.normalizeDate(new Date());
    const thirtyDaysLater = new Date(now);
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

    const db = this.prisma as any;
    const vehicles = await db.vehicle.findMany({
      where: {
        OR: [
          { status: 'maintenance' },
          { status: 'broken' },
          { tuvExpiryDate: { gte: now, lte: thirtyDaysLater } },
          { spExpiryDate: { gte: now, lte: thirtyDaysLater } },
        ],
      },
      select: {
        id: true,
        plateNumber: true,
        status: true,
        tuvExpiryDate: true,
        spExpiryDate: true,
      },
      orderBy: { plateNumber: 'asc' },
    });

    const result: Array<{
      vehicleId: string;
      plateNumber: string;
      status: string;
      tuvExpiryDate: Date | null;
      spExpiryDate: Date | null;
      issue: string;
    }> = [];

    for (const vehicle of vehicles) {
      if (vehicle.status === 'maintenance') {
        result.push({
          vehicleId: vehicle.id,
          plateNumber: vehicle.plateNumber,
          status: vehicle.status,
          tuvExpiryDate: vehicle.tuvExpiryDate,
          spExpiryDate: vehicle.spExpiryDate,
          issue: 'maintenance',
        });
      }
      if (vehicle.status === 'broken') {
        result.push({
          vehicleId: vehicle.id,
          plateNumber: vehicle.plateNumber,
          status: vehicle.status,
          tuvExpiryDate: vehicle.tuvExpiryDate,
          spExpiryDate: vehicle.spExpiryDate,
          issue: 'broken',
        });
      }
      if (vehicle.tuvExpiryDate && vehicle.tuvExpiryDate >= now && vehicle.tuvExpiryDate <= thirtyDaysLater) {
        result.push({
          vehicleId: vehicle.id,
          plateNumber: vehicle.plateNumber,
          status: vehicle.status,
          tuvExpiryDate: vehicle.tuvExpiryDate,
          spExpiryDate: vehicle.spExpiryDate,
          issue: 'tuv_expiring_30_days',
        });
      }
      if (vehicle.spExpiryDate && vehicle.spExpiryDate >= now && vehicle.spExpiryDate <= thirtyDaysLater) {
        result.push({
          vehicleId: vehicle.id,
          plateNumber: vehicle.plateNumber,
          status: vehicle.status,
          tuvExpiryDate: vehicle.tuvExpiryDate,
          spExpiryDate: vehicle.spExpiryDate,
          issue: 'sp_expiring_30_days',
        });
      }
    }

    return result;
  }

  async getDriverRiskOverview() {
    const db = this.prisma as any;

    const [driverRows, accidentGroups] = await Promise.all([
      db.driver.findMany({
        select: {
          id: true,
          firstName: true,
          lastName: true,
          riskLevel: true,
        },
      }),
      db.accident.groupBy({
        by: ['driverId'],
        where: {
          type: 'vehicle_accident',
          status: { not: 'rejected' },
        },
        _count: { _all: true },
      }),
    ]);

    const countMap = new Map<string, number>();
    for (const group of accidentGroups) {
      countMap.set(group.driverId, group._count._all);
    }

    const riskWeight = (riskLevel: string): number => {
      if (riskLevel === 'red') return 3;
      if (riskLevel === 'yellow') return 2;
      return 1;
    };

    return driverRows
      .map((driver: any) => ({
        driverId: driver.id,
        driverName: `${driver.firstName} ${driver.lastName}`,
        riskLevel: driver.riskLevel,
        accidentCount: countMap.get(driver.id) ?? 0,
      }))
      .sort((a: any, b: any) => {
        const weightDiff = riskWeight(b.riskLevel) - riskWeight(a.riskLevel);
        if (weightDiff !== 0) return weightDiff;
        return b.accidentCount - a.accidentCount;
      })
      .slice(0, 10);
  }

  async getRevenueAnalytics(date: Date, currentUserRole?: UserRole | string) {
    if (!this.canViewFinancials(currentUserRole)) {
      return null;
    }

    const db = this.prisma as any;

    const sumByRange = async (start: Date, end: Date): Promise<number> => {
      const rows = await db.assignment.findMany({
        where: {
          workDate: { gte: start, lt: end },
          status: { in: ['planned', 'confirmed', 'in_progress', 'completed'] },
        },
        include: {
          company: { select: { defaultDailyRevenue: true } },
        },
      });

      return rows.reduce((sum: number, row: any) => sum + this.toCurrencyNumber(row.company?.defaultDailyRevenue), 0);
    };

    const day = this.getDayRange(date);
    const week = this.getWeekRange(date);
    const month = this.getMonthRange(date);

    const [todayRevenue, weeklyRevenue, monthlyRevenue, dayRows] = await Promise.all([
      sumByRange(day.start, day.end),
      sumByRange(week.start, week.end),
      sumByRange(month.start, month.end),
      db.assignment.findMany({
        where: {
          workDate: { gte: day.start, lt: day.end },
          status: { in: ['planned', 'confirmed', 'in_progress', 'completed'] },
        },
        include: {
          company: {
            select: {
              id: true,
              name: true,
              defaultDailyRevenue: true,
            },
          },
        },
      }),
    ]);

    const byCompanyMap = new Map<string, { companyId: string; companyName: string; assignments: number; revenue: number }>();
    for (const row of dayRows) {
      const companyId = row.company.id;
      const increment = this.toCurrencyNumber(row.company.defaultDailyRevenue);
      const existing = byCompanyMap.get(companyId);
      if (existing) {
        existing.assignments += 1;
        existing.revenue += increment;
      } else {
        byCompanyMap.set(companyId, {
          companyId,
          companyName: row.company.name,
          assignments: 1,
          revenue: increment,
        });
      }
    }

    return {
      todayRevenue,
      weeklyRevenue,
      monthlyRevenue,
      revenueByCompany: Array.from(byCompanyMap.values()).sort((a, b) => b.revenue - a.revenue),
    };
  }

  async getDashboard(date: string, currentUserRole?: UserRole | string) {
    const selectedDate = this.normalizeDate(date);

    const [kpis, criticalAlerts, todayOperations, tomorrowPlanning, vehicleHealth, driverRiskOverview, revenueAnalytics] =
      await Promise.all([
        this.getKpis(selectedDate),
        this.getCriticalAlerts(selectedDate),
        this.getTodayOperations(selectedDate),
        this.getTomorrowPlanning(selectedDate),
        this.getVehicleHealth(),
        this.getDriverRiskOverview(),
        this.getRevenueAnalytics(selectedDate, currentUserRole ?? 'office'),
      ]);

    const dashboardData = {
      kpis,
      criticalAlerts,
      todayOperations,
      tomorrowPlanning,
      vehicleHealth,
      driverRiskOverview,
      revenueAnalytics,
    };

    return maskFinancialFields(dashboardData, currentUserRole);
  }
}
