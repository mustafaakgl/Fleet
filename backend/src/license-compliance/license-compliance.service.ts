import { Injectable } from '@nestjs/common';
import { LicenseCheckStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  computeComplianceBadge,
  type LicenseComplianceBadge,
  normalizeDate,
} from './license-compliance.util';

@Injectable()
export class LicenseComplianceService {
  constructor(private readonly prisma: PrismaService) {}

  async getDriverCompliance(driverId: string, referenceDate = new Date()) {
    const license = await this.prisma.driverLicense.findFirst({
      where: { driverId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    const [latestCheck, pendingCount] = await Promise.all([
      this.prisma.licenseCheck.findFirst({
        where: { driverId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, checkDate: true, verifiedAt: true, checkType: true },
      }),
      this.prisma.licenseCheck.count({
        where: { driverId, status: LicenseCheckStatus.pending },
      }),
    ]);

    const badge = computeComplianceBadge({
      license,
      latestCheck,
      hasPendingCheck: pendingCount > 0,
      referenceDate,
    });

    return {
      driver_id: driverId,
      badge,
      license_id: license?.id ?? null,
      license_number: license?.licenseNumber ?? null,
      classes: license?.classes ?? [],
      expires_at: license?.expiresAt?.toISOString().slice(0, 10) ?? null,
      next_check_due_at: license?.nextCheckDueAt?.toISOString().slice(0, 10) ?? null,
      latest_check: latestCheck
        ? {
            id: latestCheck.id,
            status: latestCheck.status,
            check_type: latestCheck.checkType,
            check_date: latestCheck.checkDate.toISOString().slice(0, 10),
            verified_at: latestCheck.verifiedAt?.toISOString() ?? null,
          }
        : null,
      has_pending_check: pendingCount > 0,
      blocks_assignment: badge === 'red',
    };
  }

  async getComplianceSummary(): Promise<
    Array<{
      driver_id: string;
      driver_name: string;
      employee_number: string;
      badge: LicenseComplianceBadge;
      expires_at: string | null;
      next_check_due_at: string | null;
      has_pending_check: boolean;
    }>
  > {
    const drivers = await this.prisma.driver.findMany({
      where: { status: { in: ['active', 'on_leave', 'sick'] } },
      select: { id: true, firstName: true, lastName: true, employeeNumber: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    const results = await Promise.all(
      drivers.map(async (driver) => {
        const compliance = await this.getDriverCompliance(driver.id);
        return {
          driver_id: driver.id,
          driver_name: `${driver.firstName} ${driver.lastName}`.trim(),
          employee_number: driver.employeeNumber,
          badge: compliance.badge,
          expires_at: compliance.expires_at,
          next_check_due_at: compliance.next_check_due_at,
          has_pending_check: compliance.has_pending_check,
        };
      }),
    );

    return results;
  }

  async assertAssignmentAllowed(
    driverId: string,
    acknowledgeWarning: boolean | undefined,
  ): Promise<{ allowed: true } | { allowed: false; code: string; badge: LicenseComplianceBadge; message: string }> {
    const compliance = await this.getDriverCompliance(driverId);
    if (!compliance.blocks_assignment) {
      return { allowed: true };
    }
    if (acknowledgeWarning) {
      return { allowed: true };
    }
    return {
      allowed: false,
      code: 'LICENSE_COMPLIANCE_WARNING',
      badge: compliance.badge,
      message:
        'Digitale Führerscheinkontrolle ungültig oder überfällig (Halterhaftung). Bestätigung erforderlich.',
    };
  }

  async findDriversDueForExpiryNotification(
    notifyBeforeDays: number,
    referenceDate = new Date(),
  ) {
    const today = normalizeDate(referenceDate);
    const target = new Date(today);
    target.setDate(target.getDate() + notifyBeforeDays);

    return this.prisma.driverLicense.findMany({
      where: {
        deletedAt: null,
        expiresAt: target,
      },
      include: {
        driver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            userId: true,
            tenantId: true,
          },
        },
      },
    });
  }

  async findLicensesDueForPeriodicCheck(referenceDate = new Date()) {
    const today = normalizeDate(referenceDate);
    return this.prisma.driverLicense.findMany({
      where: {
        deletedAt: null,
        nextCheckDueAt: { lte: today },
        driver: { status: 'active' },
      },
      include: {
        driver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            userId: true,
          },
        },
      },
    });
  }

  async findOverdueCheckRequests(referenceDate = new Date()) {
    const today = normalizeDate(referenceDate);
    const licenses = await this.prisma.driverLicense.findMany({
      where: {
        deletedAt: null,
        checkRequestedAt: { not: null },
        driver: { status: 'active' },
      },
      include: {
        driver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            userId: true,
          },
        },
        checks: {
          where: { status: LicenseCheckStatus.pending },
          select: { id: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    return licenses.filter((license) => {
      if (!license.checkRequestedAt) return false;
      const hasOpenSubmission = license.checks.length > 0;
      if (hasOpenSubmission) return true;
      return normalizeDate(license.checkRequestedAt) <= today;
    });
  }

}
