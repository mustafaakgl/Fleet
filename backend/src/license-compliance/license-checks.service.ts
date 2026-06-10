import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LicenseCheckStatus, LicenseCheckType, Prisma } from '@prisma/client';
import type { Response } from 'express';
import { safeAuditLog } from '../audit/audit-helper';
import { AuditService } from '../audit/audit.service';
import { DriverNotifyService } from '../notifications/driver-notify.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { LicensePhotoStorageService } from '../storage/license-photo-storage.service';
import { RejectLicenseCheckDto } from './dto/reject-license-check.dto';
import type { PhotoCaptureMeta, SubmitLicenseCheckDto } from './dto/submit-license-check.dto';
import {
  addMonths,
  CHECK_ESCALATION_DAYS,
  CHECK_REMINDER_DAYS,
  diffInDays,
  isTerminalCheckStatus,
  normalizeDate,
  PERIODIC_CHECK_INTERVAL_MONTHS,
} from './license-compliance.util';
import { LicenseComplianceService } from './license-compliance.service';

type UploadedCheckPhoto = {
  originalname: string;
  buffer: Buffer;
};

const includeDriver = {
  driver: { select: { id: true, firstName: true, lastName: true, employeeNumber: true, userId: true } },
  driverLicense: {
    select: {
      id: true,
      licenseNumber: true,
      classes: true,
      expiresAt: true,
      frontPhotoStoredPath: true,
      backPhotoStoredPath: true,
    },
  },
  verifiedBy: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.LicenseCheckInclude;

@Injectable()
export class LicenseChecksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly photoStorage: LicensePhotoStorageService,
    private readonly compliance: LicenseComplianceService,
    private readonly driverNotify: DriverNotifyService,
    private readonly notifications: NotificationsService,
    private readonly push: PushNotificationsService,
  ) {}

  async list(query: { status?: string; driver_id?: string }) {
    const where: Prisma.LicenseCheckWhereInput = {};
    if (query.driver_id) where.driverId = query.driver_id;
    if (
      query.status &&
      Object.values(LicenseCheckStatus).includes(query.status as LicenseCheckStatus)
    ) {
      where.status = query.status as LicenseCheckStatus;
    }

    const rows = await this.prisma.licenseCheck.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      include: includeDriver,
    });
    return rows.map((row) => this.toClient(row, { includePhotoUrls: true }));
  }

  async listPending() {
    return this.list({ status: LicenseCheckStatus.pending });
  }

  async getById(id: string, options?: { driverSelf?: boolean }) {
    const row = await this.prisma.licenseCheck.findUnique({
      where: { id },
      include: includeDriver,
    });
    if (!row) throw new NotFoundException('License check not found');
    return this.toClient(row, {
      includePhotoUrls: !options?.driverSelf,
      driverSelf: options?.driverSelf,
    });
  }

  async getDriverStatus(userId: string) {
    const driver = await this.prisma.driver.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (!driver) throw new NotFoundException('Driver profile not found');

    const compliance = await this.compliance.getDriverCompliance(driver.id);
    const license = await this.prisma.driverLicense.findFirst({
      where: { driverId: driver.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    const pending = await this.prisma.licenseCheck.count({
      where: { driverId: driver.id, status: LicenseCheckStatus.pending },
    });

    return {
      ...compliance,
      check_requested_at: license?.checkRequestedAt?.toISOString() ?? null,
      can_submit:
        pending === 0 &&
        license !== null &&
        (Boolean(license.checkRequestedAt) || compliance.badge !== 'green'),
      task_due: license?.nextCheckDueAt?.toISOString().slice(0, 10) ?? null,
    };
  }

  async getDriverHistory(userId: string) {
    const driver = await this.prisma.driver.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (!driver) throw new NotFoundException('Driver profile not found');

    const rows = await this.prisma.licenseCheck.findMany({
      where: { driverId: driver.id },
      orderBy: { createdAt: 'desc' },
      include: includeDriver,
    });

    return rows.map((row) =>
      this.toClient(row, { includePhotoUrls: true, driverSelf: true }),
    );
  }

  async submitDriverCheck(
    userId: string,
    dto: SubmitLicenseCheckDto,
    files: {
      front?: UploadedCheckPhoto;
      back?: UploadedCheckPhoto;
      selfie?: UploadedCheckPhoto;
    },
  ) {
    const driver = await this.prisma.driver.findFirst({
      where: { userId },
      select: { id: true, tenantId: true, userId: true },
    });
    if (!driver) throw new NotFoundException('Driver profile not found');

    if (!files.front || !files.back || !files.selfie) {
      throw new BadRequestException('front, back, and selfie photos are required');
    }

    const license = await this.prisma.driverLicense.findFirst({
      where: { driverId: driver.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!license) {
      throw new BadRequestException('No active driver license on file — contact dispatch');
    }

    const existingPending = await this.prisma.licenseCheck.findFirst({
      where: { driverId: driver.id, status: LicenseCheckStatus.pending },
      select: { id: true },
    });
    if (existingPending) {
      throw new ConflictException('A pending license check already exists');
    }

    let photoMetadata: Record<string, PhotoCaptureMeta> | undefined;
    if (dto.photo_metadata) {
      try {
        photoMetadata = JSON.parse(dto.photo_metadata) as Record<string, PhotoCaptureMeta>;
      } catch {
        throw new BadRequestException('photo_metadata must be valid JSON');
      }
    }

    const [frontPath, backPath, selfiePath] = await Promise.all([
      this.photoStorage.saveEncrypted(files.front.originalname, 'front', files.front.buffer),
      this.photoStorage.saveEncrypted(files.back.originalname, 'back', files.back.buffer),
      this.photoStorage.saveEncrypted(files.selfie.originalname, 'selfie', files.selfie.buffer),
    ]);

    const hasApprovedBefore = await this.prisma.licenseCheck.count({
      where: { driverId: driver.id, status: LicenseCheckStatus.approved },
    });

    const row = await this.prisma.licenseCheck.create({
      data: {
        tenantId: driver.tenantId,
        driverId: driver.id,
        driverLicenseId: license.id,
        checkType: hasApprovedBefore > 0 ? LicenseCheckType.periodic : LicenseCheckType.initial,
        status: LicenseCheckStatus.pending,
        notes: dto.notes,
        frontPhotoStoredPath: frontPath,
        backPhotoStoredPath: backPath,
        selfiePhotoStoredPath: selfiePath,
        photoMetadata: photoMetadata ?? Prisma.JsonNull,
        dueAt: license.nextCheckDueAt ?? normalizeDate(new Date()),
      },
      include: includeDriver,
    });

    await this.prisma.driverLicense.update({
      where: { id: license.id },
      data: {
        checkRequestedAt: null,
        lastReminderSentAt: null,
        lastEscalationSentAt: null,
      },
    });

    await safeAuditLog(this.auditService, {
      actorUserId: userId,
      action: 'license_check.submitted',
      entityType: 'license_check',
      entityId: row.id,
      summary: 'Driver submitted digital license check',
      metadata: { driverId: driver.id },
    });

    await this.notifications.notifyAdminsAndOffice({
      title: 'Führerscheinkontrolle eingereicht',
      message: `${row.driver.firstName} ${row.driver.lastName} hat eine Führerscheinkontrolle eingereicht.`,
      type: 'document',
      priority: 'high',
      relatedEntityType: 'license_check',
      relatedEntityId: row.id,
    });

    return this.toClient(row, { includePhotoUrls: true, driverSelf: true });
  }

  async approve(id: string, actorUserId: string) {
    const row = await this.prisma.licenseCheck.findUnique({
      where: { id },
      include: includeDriver,
    });
    if (!row) throw new NotFoundException('License check not found');
    if (row.status !== LicenseCheckStatus.pending) {
      throw new BadRequestException('Only pending checks can be approved');
    }

    const verifiedAt = new Date();
    const nextCheckDueAt = addMonths(verifiedAt, PERIODIC_CHECK_INTERVAL_MONTHS);

    const updated = await this.prisma.$transaction(async (tx) => {
      const check = await tx.licenseCheck.update({
        where: { id },
        data: {
          status: LicenseCheckStatus.approved,
          verifiedById: actorUserId,
          verifiedAt,
        },
        include: includeDriver,
      });

      if (row.driverLicenseId) {
        await tx.driverLicense.update({
          where: { id: row.driverLicenseId },
          data: {
            lastApprovedCheckAt: verifiedAt,
            nextCheckDueAt,
            checkRequestedAt: null,
            lastReminderSentAt: null,
            lastEscalationSentAt: null,
          },
        });
      }

      return check;
    });

    if (row.driver.userId) {
      this.driverNotify.notifyUserSafely({
        userId: row.driver.userId,
        key: 'license_check_approved',
        type: 'system',
        priority: 'medium',
        relatedEntityType: 'license_check',
        relatedEntityId: id,
      });
      void this.push.sendToUser(row.driver.userId, {
        title: 'Führerscheinkontrolle bestätigt',
        body: 'Deine digitale Führerscheinkontrolle wurde bestätigt.',
        data: { type: 'license_check', id },
      });
    }

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'license_check.approved',
      entityType: 'license_check',
      entityId: id,
      summary: 'License check approved',
      metadata: { driverId: row.driverId },
    });

    return this.toClient(updated, { includePhotoUrls: true });
  }

  async reject(id: string, dto: RejectLicenseCheckDto, actorUserId: string) {
    const row = await this.prisma.licenseCheck.findUnique({
      where: { id },
      include: includeDriver,
    });
    if (!row) throw new NotFoundException('License check not found');
    if (row.status !== LicenseCheckStatus.pending) {
      throw new BadRequestException('Only pending checks can be rejected');
    }

    const updated = await this.prisma.licenseCheck.update({
      where: { id },
      data: {
        status: LicenseCheckStatus.rejected,
        verifiedById: actorUserId,
        verifiedAt: new Date(),
        rejectionReason: dto.rejection_reason.trim(),
        notes: dto.notes ?? row.notes,
      },
      include: includeDriver,
    });

    if (row.driverLicenseId) {
      await this.prisma.driverLicense.update({
        where: { id: row.driverLicenseId },
        data: { checkRequestedAt: new Date() },
      });
    }

    if (row.driver.userId) {
      this.driverNotify.notifyUserSafely({
        userId: row.driver.userId,
        key: 'license_check_rejected',
        params: { reason: dto.rejection_reason },
        type: 'system',
        priority: 'high',
        relatedEntityType: 'license_check',
        relatedEntityId: id,
      });
      void this.push.sendToUser(row.driver.userId, {
        title: 'Führerscheinkontrolle abgelehnt',
        body: dto.rejection_reason,
        data: { type: 'license_check', id },
      });
    }

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'license_check.rejected',
      entityType: 'license_check',
      entityId: id,
      summary: 'License check rejected',
      metadata: { driverId: row.driverId, reason: dto.rejection_reason },
    });

    return this.toClient(updated, { includePhotoUrls: true });
  }

  async streamPhoto(
    checkId: string,
    slot: 'front' | 'back' | 'selfie',
    actorUserId: string,
    actorRole: string,
    res: Response,
    options?: { driverSelfUserId?: string },
  ) {
    const row = await this.prisma.licenseCheck.findUnique({ where: { id: checkId } });
    if (!row) throw new NotFoundException('License check not found');

    if (options?.driverSelfUserId) {
      const driver = await this.prisma.driver.findFirst({
        where: { userId: options.driverSelfUserId, id: row.driverId },
        select: { id: true },
      });
      if (!driver) throw new ForbiddenException('Not allowed to access this photo');
    } else if (actorRole !== 'admin') {
      throw new ForbiddenException('Only admin role may access license check photos');
    }

    const storedPath =
      slot === 'front'
        ? row.frontPhotoStoredPath
        : slot === 'back'
          ? row.backPhotoStoredPath
          : row.selfiePhotoStoredPath;

    if (!storedPath) throw new NotFoundException('Photo not found');

    const decoded = await this.photoStorage.readDecrypted(storedPath);
    if (!decoded) throw new NotFoundException('Photo file missing');

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'license_check.photo_download',
      entityType: 'license_check',
      entityId: checkId,
      summary: `License check photo downloaded (${slot})`,
      metadata: { slot },
    });

    res.setHeader('Content-Type', decoded.contentType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(decoded.buffer);
  }

  async streamLicenseRecordPhoto(
    licenseId: string,
    slot: 'front' | 'back',
    actorUserId: string,
    actorRole: string,
    res: Response,
  ) {
    if (actorRole !== 'admin') {
      throw new ForbiddenException('Only admin role may access license record photos');
    }

    const license = await this.prisma.driverLicense.findUnique({ where: { id: licenseId } });
    if (!license || license.deletedAt) throw new NotFoundException('Driver license not found');

    const storedPath =
      slot === 'front' ? license.frontPhotoStoredPath : license.backPhotoStoredPath;
    if (!storedPath) throw new NotFoundException('Photo not found');

    const decoded = await this.photoStorage.readDecrypted(storedPath);
    if (!decoded) throw new NotFoundException('Photo file missing');

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'driver_license.photo_download',
      entityType: 'driver_license',
      entityId: licenseId,
      summary: `Driver license record photo downloaded (${slot})`,
      metadata: { slot },
    });

    res.setHeader('Content-Type', decoded.contentType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(decoded.buffer);
  }

  async runDailyJobs(referenceDate = new Date()) {
    const today = normalizeDate(referenceDate);
    let periodicRequests = 0;
    let reminders = 0;
    let escalations = 0;
    let expiryNotices = 0;

    const dueLicenses = await this.compliance.findLicensesDueForPeriodicCheck(today);
    for (const license of dueLicenses) {
      if (!license.checkRequestedAt) {
        await this.prisma.driverLicense.update({
          where: { id: license.id },
          data: { checkRequestedAt: new Date() },
        });
      }

      if (license.driver.userId) {
        this.driverNotify.notifyUserSafely({
          userId: license.driver.userId,
          key: 'license_check_due',
          type: 'system',
          priority: 'high',
          relatedEntityType: 'driver_license',
          relatedEntityId: license.id,
        });
        void this.push.sendToUser(license.driver.userId, {
          title: 'Führerscheinkontrolle fällig',
          body: 'Bitte reiche deine digitale Führerscheinkontrolle in der App ein.',
          data: { type: 'license_check_due', licenseId: license.id },
        });
      }
      periodicRequests += 1;
    }

    const openRequests = await this.prisma.driverLicense.findMany({
      where: {
        deletedAt: null,
        checkRequestedAt: { not: null },
        driver: { status: 'active' },
      },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true, userId: true } },
        checks: {
          where: { status: LicenseCheckStatus.pending },
          select: { id: true },
          take: 1,
        },
      },
    });

    for (const license of openRequests) {
      if (license.checks.length > 0) continue;
      if (!license.checkRequestedAt) continue;

      const daysSinceRequest = diffInDays(normalizeDate(license.checkRequestedAt), today);

      if (
        daysSinceRequest >= CHECK_REMINDER_DAYS &&
        (!license.lastReminderSentAt ||
          diffInDays(normalizeDate(license.lastReminderSentAt), today) >= 1)
      ) {
        if (license.driver.userId) {
          this.driverNotify.notifyUserSafely({
            userId: license.driver.userId,
            key: 'license_check_reminder',
            type: 'system',
            priority: 'high',
            relatedEntityType: 'driver_license',
            relatedEntityId: license.id,
          });
          void this.push.sendToUser(license.driver.userId, {
            title: 'Erinnerung: Führerscheinkontrolle',
            body: 'Deine Führerscheinkontrolle ist noch offen.',
            data: { type: 'license_check_reminder' },
          });
        }
        await this.prisma.driverLicense.update({
          where: { id: license.id },
          data: { lastReminderSentAt: new Date() },
        });
        reminders += 1;
      }

      if (
        daysSinceRequest >= CHECK_ESCALATION_DAYS &&
        !license.lastEscalationSentAt
      ) {
        await this.notifications.notifyAdminsAndOffice({
          title: 'Führerscheinkontrolle überfällig',
          message: `${license.driver.firstName} ${license.driver.lastName} hat die Führerscheinkontrolle nicht eingereicht (${daysSinceRequest} Tage).`,
          type: 'reminder',
          priority: 'critical',
          relatedEntityType: 'driver_license',
          relatedEntityId: license.id,
        });
        await this.prisma.driverLicense.update({
          where: { id: license.id },
          data: { lastEscalationSentAt: new Date() },
        });
        escalations += 1;
      }
    }

    for (const windowDays of [210, 60, 30]) {
      const targets = await this.compliance.findDriversDueForExpiryNotification(windowDays, today);
      for (const license of targets) {
        const dueLabel = license.expiresAt.toISOString().slice(0, 10);
        if (license.driver.userId) {
          this.driverNotify.notifyUserSafely({
            userId: license.driver.userId,
            key: 'license_expiry_soon',
            params: { date: dueLabel, days: String(windowDays) },
            type: 'system',
            priority: 'high',
            relatedEntityType: 'driver_license',
            relatedEntityId: license.id,
          });
        }
        await this.notifications.notifyAdminsAndOffice({
          title: 'Führerschein läuft ab',
          message: `${license.driver.firstName} ${license.driver.lastName}: Führerschein gültig bis ${dueLabel} (${windowDays}-Tage-Hinweis).`,
          type: 'reminder',
          priority: windowDays <= 30 ? 'critical' : 'high',
          relatedEntityType: 'driver_license',
          relatedEntityId: license.id,
        });
        expiryNotices += 1;
      }
    }

    return { periodicRequests, reminders, escalations, expiryNotices };
  }

  async purgeRetainedData(cutoff: Date): Promise<number> {
    const licenses = await this.prisma.driverLicense.findMany({
      where: { deletedAt: { not: null, lt: cutoff } },
      include: {
        checks: {
          select: {
            id: true,
            frontPhotoStoredPath: true,
            backPhotoStoredPath: true,
            selfiePhotoStoredPath: true,
          },
        },
      },
      take: 50,
    });

    let purged = 0;
    for (const license of licenses) {
      for (const check of license.checks) {
        await this.deleteCheckPhotos(check);
        await this.prisma.licenseCheck.delete({ where: { id: check.id } });
      }
      if (license.frontPhotoStoredPath) await this.photoStorage.deleteStored(license.frontPhotoStoredPath);
      if (license.backPhotoStoredPath) await this.photoStorage.deleteStored(license.backPhotoStoredPath);
      await this.prisma.driverLicense.delete({ where: { id: license.id } });
      purged += 1;
    }
    return purged;
  }

  private async deleteCheckPhotos(check: {
    frontPhotoStoredPath: string | null;
    backPhotoStoredPath: string | null;
    selfiePhotoStoredPath: string | null;
  }) {
    await Promise.all([
      this.photoStorage.deleteStored(check.frontPhotoStoredPath),
      this.photoStorage.deleteStored(check.backPhotoStoredPath),
      this.photoStorage.deleteStored(check.selfiePhotoStoredPath),
    ]);
  }

  private toClient(
    row: Prisma.LicenseCheckGetPayload<{ include: typeof includeDriver }>,
    options?: { includePhotoUrls?: boolean; driverSelf?: boolean },
  ) {
    const photoBase = options?.driverSelf
      ? `/driver/license-check/${row.id}/photo`
      : `/license-checks/${row.id}/photo`;

    return {
      id: row.id,
      driver_id: row.driverId,
      driver_name: `${row.driver.firstName} ${row.driver.lastName}`.trim(),
      employee_number: row.driver.employeeNumber,
      driver_license_id: row.driverLicenseId,
      check_date: row.checkDate.toISOString().slice(0, 10),
      check_type: row.checkType,
      status: row.status,
      verified_by: row.verifiedBy
        ? { id: row.verifiedBy.id, name: row.verifiedBy.fullName, email: row.verifiedBy.email }
        : null,
      verified_at: row.verifiedAt?.toISOString() ?? null,
      rejection_reason: row.rejectionReason ?? null,
      notes: row.notes ?? null,
      due_at: row.dueAt?.toISOString().slice(0, 10) ?? null,
      photo_metadata: row.photoMetadata ?? null,
      reference_license: row.driverLicense
        ? {
            id: row.driverLicense.id,
            license_number: row.driverLicense.licenseNumber,
            classes: row.driverLicense.classes,
            expires_at: row.driverLicense.expiresAt.toISOString().slice(0, 10),
            front_photo_url: options?.includePhotoUrls
              ? `/driver-licenses/${row.driverLicense.id}/photo/front`
              : null,
            back_photo_url: options?.includePhotoUrls
              ? `/driver-licenses/${row.driverLicense.id}/photo/back`
              : null,
          }
        : null,
      photos: options?.includePhotoUrls
        ? {
            front_url: row.frontPhotoStoredPath ? `${photoBase}/front` : null,
            back_url: row.backPhotoStoredPath ? `${photoBase}/back` : null,
            selfie_url: row.selfiePhotoStoredPath ? `${photoBase}/selfie` : null,
          }
        : undefined,
      created_at: row.createdAt.toISOString(),
      immutable: isTerminalCheckStatus(row.status),
    };
  }
}
