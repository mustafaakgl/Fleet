import { Injectable } from '@nestjs/common';
import { AssignmentStatus, DefectSeverity, DefectStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  dayRange,
  DEPARTURE_CHECK_REQUIRED_CODE,
  todayDate,
  vehicleDefectWarningMessage,
  vehicleHasBlockingCriticalDefect,
  VEHICLE_DEFECT_WARNING_CODE,
} from './departure-check.util';

const ACTIVE_ASSIGNMENT_STATUSES = [
  AssignmentStatus.planned,
  AssignmentStatus.confirmed,
  AssignmentStatus.in_progress,
];

@Injectable()
export class DepartureCheckService {
  constructor(private readonly prisma: PrismaService) {}

  async getOpenCriticalDefects(vehicleId: string) {
    return this.prisma.defect.findMany({
      where: {
        vehicleId,
        severity: DefectSeverity.kritisch,
        status: { not: DefectStatus.bestaetigt },
        anonymizedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        severity: true,
        createdAt: true,
      },
    });
  }

  async getVehicleCompliance(vehicleId: string) {
    const openCritical = await this.getOpenCriticalDefects(vehicleId);
    return {
      vehicle_id: vehicleId,
      has_blocking_defect: openCritical.length > 0,
      open_critical_defects: openCritical.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        status: row.status,
        severity: row.severity,
        created_at: row.createdAt.toISOString(),
      })),
      blocks_assignment: openCritical.length > 0,
      blocks_departure_check: openCritical.length > 0,
    };
  }

  async assertAssignmentAllowed(
    vehicleId: string,
    acknowledgeWarning: boolean | undefined,
  ): Promise<
    | { allowed: true }
    | { allowed: false; code: string; message: string; open_critical_count: number }
  > {
    const compliance = await this.getVehicleCompliance(vehicleId);
    if (!compliance.blocks_assignment) {
      return { allowed: true };
    }
    if (acknowledgeWarning) {
      return { allowed: true };
    }
    return {
      allowed: false,
      code: VEHICLE_DEFECT_WARNING_CODE,
      message: vehicleDefectWarningMessage(),
      open_critical_count: compliance.open_critical_defects.length,
    };
  }

  async assertDepartureCheckAllowed(vehicleId: string): Promise<
    | { allowed: true }
    | { allowed: false; code: string; message: string; open_critical_count: number }
  > {
    const compliance = await this.getVehicleCompliance(vehicleId);
    if (!compliance.blocks_departure_check) {
      return { allowed: true };
    }
    return {
      allowed: false,
      code: VEHICLE_DEFECT_WARNING_CODE,
      message:
        'Kritische Mängel am Fahrzeug — Abfahrtskontrolle kann erst nach Bestätigung (BESTÄTIGT) starten.',
      open_critical_count: compliance.open_critical_defects.length,
    };
  }

  async assertWorkSessionAllowed(
    driverId: string,
    referenceDate = new Date(),
  ): Promise<
    | { allowed: true }
    | {
        allowed: false;
        code: string;
        message: string;
        vehicle_id?: string;
        assignment_id?: string;
      }
  > {
    const { start, end } = dayRange(referenceDate);
    const assignment = await this.prisma.assignment.findFirst({
      where: {
        driverId,
        workDate: { gte: start, lt: end },
        status: { in: ACTIVE_ASSIGNMENT_STATUSES },
      },
      orderBy: { startTime: 'asc' },
      select: { id: true, vehicleId: true },
    });

    if (!assignment) {
      return { allowed: true };
    }

    const existingCheck = await this.prisma.departureCheck.findUnique({
      where: {
        driverId_vehicleId_workDate: {
          driverId,
          vehicleId: assignment.vehicleId,
          workDate: todayDate(referenceDate),
        },
      },
      select: { id: true },
    });

    if (existingCheck) {
      return { allowed: true };
    }

    const vehicleGate = await this.assertDepartureCheckAllowed(assignment.vehicleId);
    if (!vehicleGate.allowed) {
      return {
        allowed: false,
        code: vehicleGate.code,
        message: vehicleGate.message,
        vehicle_id: assignment.vehicleId,
        assignment_id: assignment.id,
      };
    }

    return {
      allowed: false,
      code: DEPARTURE_CHECK_REQUIRED_CODE,
      message: 'Abfahrtskontrolle für heute erforderlich, bevor die Arbeit beginnt.',
      vehicle_id: assignment.vehicleId,
      assignment_id: assignment.id,
    };
  }

  async getMissingChecksToday(referenceDate = new Date()) {
    const { start, end } = dayRange(referenceDate);
    const assignments = await this.prisma.assignment.findMany({
      where: {
        workDate: { gte: start, lt: end },
        status: { in: ACTIVE_ASSIGNMENT_STATUSES },
      },
      include: {
        driver: {
          select: { id: true, firstName: true, lastName: true, employeeNumber: true },
        },
        vehicle: {
          select: { id: true, plateNumber: true, internalCode: true },
        },
      },
      orderBy: [{ startTime: 'asc' }],
    });

    const checks = await this.prisma.departureCheck.findMany({
      where: {
        workDate: todayDate(referenceDate),
        driverId: { in: assignments.map((row) => row.driverId) },
      },
      select: { driverId: true, vehicleId: true },
    });

    const completed = new Set(checks.map((row) => `${row.driverId}:${row.vehicleId}`));

    return assignments
      .filter((assignment) => !completed.has(`${assignment.driverId}:${assignment.vehicleId}`))
      .map((assignment) => ({
        driver_id: assignment.driver.id,
        driver_name: `${assignment.driver.firstName} ${assignment.driver.lastName}`.trim(),
        employee_number: assignment.driver.employeeNumber,
        vehicle_id: assignment.vehicle.id,
        vehicle_plate: assignment.vehicle.plateNumber,
        assignment_id: assignment.id,
        start_time: assignment.startTime,
        work_date: assignment.workDate.toISOString().slice(0, 10),
      }));
  }

  async findDriversDueForDepartureCheckReminder(referenceDate = new Date()) {
    const missing = await this.getMissingChecksToday(referenceDate);
    const due: Array<{
      driverId: string;
      userId: string | null;
      tenantId: string;
      assignmentId: string;
      vehicleId: string;
      shiftStartedAt: Date;
    }> = [];

    for (const row of missing) {
      const driver = await this.prisma.driver.findUnique({
        where: { id: row.driver_id },
        select: { id: true, userId: true, tenantId: true },
      });
      if (!driver?.userId) continue;

      const shiftStartedAt = new Date(`${row.work_date}T${row.start_time}:00`);
      due.push({
        driverId: driver.id,
        userId: driver.userId,
        tenantId: driver.tenantId,
        assignmentId: row.assignment_id,
        vehicleId: row.vehicle_id,
        shiftStartedAt,
      });
    }

    return due;
  }

  async vehicleDefectStats(vehicleId: string) {
    const [openCount, bySeverity, byStatus, totalClosed] = await Promise.all([
      this.prisma.defect.count({
        where: {
          vehicleId,
          status: { not: DefectStatus.bestaetigt },
          anonymizedAt: null,
        },
      }),
      this.prisma.defect.groupBy({
        by: ['severity'],
        where: { vehicleId, anonymizedAt: null },
        _count: { _all: true },
      }),
      this.prisma.defect.groupBy({
        by: ['status'],
        where: { vehicleId, anonymizedAt: null },
        _count: { _all: true },
      }),
      this.prisma.defect.count({
        where: { vehicleId, status: DefectStatus.bestaetigt, anonymizedAt: null },
      }),
    ]);

    return {
      open_count: openCount,
      closed_count: totalClosed,
      by_severity: Object.fromEntries(bySeverity.map((row) => [row.severity, row._count._all])),
      by_status: Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])),
      has_blocking_critical: vehicleHasBlockingCriticalDefect(
        await this.prisma.defect.findMany({
          where: {
            vehicleId,
            severity: DefectSeverity.kritisch,
            status: { not: DefectStatus.bestaetigt },
            anonymizedAt: null,
          },
          select: { severity: true, status: true },
        }),
      ),
    };
  }
}
