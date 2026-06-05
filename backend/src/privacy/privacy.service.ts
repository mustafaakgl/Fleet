import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import type { Response } from 'express';
import archiver from 'archiver';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { resolveAbsolutePathFromStoredUrl } from '../storage/file-path.util';

function jsonLine(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function buildDriverReadme(driverId: string, exportedAt: Date): string {
  return [
    'DSGVO-Datenexport (Art. 15 DSGVO)',
    '================================',
    '',
    `Exportiert am: ${exportedAt.toISOString()}`,
    `Betroffene Person (Fahrer-ID): ${driverId}`,
    '',
    'Inhalt dieses Archivs:',
    '- driver.json: Stammdaten, Einwilligungen, Risikostatus',
    '- assignments.json: Einsätze',
    '- requests.json: Anträge (Urlaub/Krankheit)',
    '- morning_checkins.json: Morgen-Check-ins',
    '- location_history.json: Standortverlauf (nur bei erteilter Einwilligung)',
    '- location_history_note.txt: Hinweis falls keine Einwilligung',
    '- audit_log_excerpt.json: Protokolleinträge zu diesem Fahrer',
    '- documents/: hochgeladene Dateien',
    '',
    'Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Vertrag/Arbeitsverhältnis),',
    'lit. f (berechtigtes Interesse an Flottenbetrieb und Compliance).',
    'Standortdaten: Art. 6 Abs. 1 lit. a DSGVO (Einwilligung).',
    '',
    'Aufbewahrung: siehe docs/legal/Datenaufbewahrung.md',
    '',
    'Verantwortlicher: [FIRMENNAME] — privacy@[DOMAIN]',
  ].join('\n');
}

function buildUserReadme(userId: string, exportedAt: Date): string {
  return [
    'DSGVO-Datenexport (Art. 15 DSGVO)',
    '================================',
    '',
    `Exportiert am: ${exportedAt.toISOString()}`,
    `Betroffene Person (Benutzer-ID): ${userId}`,
    '',
    'Inhalt:',
    '- user.json: Kontodaten (ohne Passwort-Hash)',
    '- audit_log_excerpt.json: Aktionen dieses Benutzers als Akteur',
    '- notifications.json: Benachrichtigungen',
    '',
    'Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Nutzungsvertrag).',
  ].join('\n');
}

@Injectable()
export class PrivacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly objectStorage: ObjectStorageService,
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

  async streamDriverExport(driverId: string, actorUserId: string, res: Response): Promise<void> {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            status: true,
            language: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const [assignments, requests, morningCheckins, documents, locationHistory, driverAuditLogs] =
      await Promise.all([
        this.prisma.assignment.findMany({
          where: { driverId },
          orderBy: { workDate: 'desc' },
          include: {
            vehicle: { select: { plateNumber: true } },
            company: { select: { name: true } },
          },
        }),
        this.prisma.request.findMany({
          where: { driverId },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.morningCheckin.findMany({
          where: { driverId },
          orderBy: { date: 'desc' },
        }),
        this.prisma.document.findMany({
          where: { ownerType: 'driver', ownerId: driverId },
          orderBy: { createdAt: 'desc' },
        }),
        driver.locationTrackingConsentAt
          ? this.prisma.driverLocationHistory.findMany({
              where: { driverId },
              orderBy: { recordedAt: 'desc' },
              take: 5000,
            })
          : Promise.resolve([]),
        this.auditService.getEntityAuditLogs('driver', driverId),
      ]);

    const exportedAt = new Date();
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (error) => {
      throw error;
    });
    archive.pipe(res);

    archive.append(jsonLine({
      id: driver.id,
      employee_number: driver.employeeNumber,
      first_name: driver.firstName,
      last_name: driver.lastName,
      email: driver.email,
      phone: driver.phone,
      license_number: driver.licenseNumber,
      license_expiry_date: driver.licenseExpiryDate?.toISOString() ?? null,
      passport_number: driver.passportNumber,
      passport_expiry_date: driver.passportExpiryDate?.toISOString() ?? null,
      status: driver.status,
      risk_level: driver.riskLevel,
      date_of_birth: driver.dateOfBirth?.toISOString().slice(0, 10) ?? null,
      notes: driver.notes,
      location_tracking_consent_at: driver.locationTrackingConsentAt?.toISOString() ?? null,
      location_tracking_status: driver.locationTrackingStatus,
      location_tracking_enabled_at: driver.locationTrackingEnabledAt?.toISOString() ?? null,
      location_sharing_started_at: driver.locationSharingStartedAt?.toISOString() ?? null,
      location_sharing_ended_at: driver.locationSharingEndedAt?.toISOString() ?? null,
      linked_user: driver.user,
      created_at: driver.createdAt.toISOString(),
      updated_at: driver.updatedAt.toISOString(),
    }), { name: 'driver.json' });

    archive.append(jsonLine(assignments), { name: 'assignments.json' });
    archive.append(jsonLine(requests), { name: 'requests.json' });
    archive.append(jsonLine(morningCheckins), { name: 'morning_checkins.json' });

    if (driver.locationTrackingConsentAt) {
      archive.append(jsonLine(locationHistory), { name: 'location_history.json' });
    } else {
      archive.append(
        'Keine Standortdaten exportiert: keine dokumentierte Einwilligung (locationTrackingConsentAt).\n',
        { name: 'location_history_note.txt' },
      );
    }

    archive.append(jsonLine(driverAuditLogs), { name: 'audit_log_excerpt.json' });
    archive.append(buildDriverReadme(driverId, exportedAt), { name: 'README.txt' });

    for (const document of documents) {
      if (!document.fileUrl) continue;
      const safeName = document.fileName.replace(/[^\w.\-()+\s]/g, '_');
      const stored = await this.objectStorage.openStoredFile(document.fileUrl);
      if (stored) {
        archive.append(stored.stream, { name: `documents/${document.id}_${safeName}` });
        continue;
      }
      const absolutePath = resolveAbsolutePathFromStoredUrl(document.fileUrl);
      if (!absolutePath || !existsSync(absolutePath)) continue;
      const { createReadStream } = await import('node:fs');
      archive.append(createReadStream(absolutePath), {
        name: `documents/${document.id}_${safeName}`,
      });
    }

    await archive.finalize();

    await this.safeAuditLog({
      actorUserId,
      action: 'privacy.data_export',
      entityType: 'driver',
      entityId: driverId,
      summary: 'Driver GDPR data export',
      metadata: {
        exportType: 'driver',
        documentCount: documents.length,
      },
    });
  }

  async streamUserExport(userId: string, actorUserId: string, res: Response): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        status: true,
        language: true,
        createdAt: true,
        updatedAt: true,
        driver: { select: { id: true } },
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const [auditLogs, notifications] = await Promise.all([
      this.auditService.getUserAuditLogs(userId),
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
    ]);

    const exportedAt = new Date();
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (error) => {
      throw error;
    });
    archive.pipe(res);

    archive.append(jsonLine(user), { name: 'user.json' });
    archive.append(jsonLine(auditLogs), { name: 'audit_log_excerpt.json' });
    archive.append(jsonLine(notifications), { name: 'notifications.json' });
    archive.append(buildUserReadme(userId, exportedAt), { name: 'README.txt' });

    await archive.finalize();

    await this.safeAuditLog({
      actorUserId,
      action: 'privacy.data_export',
      entityType: 'user',
      entityId: userId,
      summary: 'User GDPR data export',
      metadata: { exportType: 'user' },
    });
  }

  async anonymizeDriver(driverId: string, reason: string, actorUserId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: {
        user: { select: { id: true, status: true } },
      },
    });
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }
    if (driver.firstName === 'ANONYMIZED' && driver.lastName === 'ANONYMIZED') {
      throw new BadRequestException('Driver is already anonymized');
    }

    const documents = await this.prisma.document.findMany({
      where: { ownerType: 'driver', ownerId: driverId },
      select: { id: true, fileUrl: true },
    });

    for (const document of documents) {
      if (!document.fileUrl) continue;
      const absolutePath = resolveAbsolutePathFromStoredUrl(document.fileUrl);
      if (absolutePath) {
        try {
          await unlink(absolutePath);
        } catch {
          // File may already be missing.
        }
      }
    }

    const anonymizedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.document.deleteMany({
        where: { ownerType: 'driver', ownerId: driverId },
      });

      await tx.driverLocationHistory.deleteMany({ where: { driverId } });
      await tx.driverLocationLatest.deleteMany({ where: { driverId } });

      await tx.vehicle.updateMany({
        where: { currentDriverId: driverId },
        data: { currentDriverId: null },
      });

      await tx.driver.update({
        where: { id: driverId },
        data: {
          firstName: 'ANONYMIZED',
          lastName: 'ANONYMIZED',
          email: null,
          phone: null,
          licenseNumber: null,
          licenseExpiryDate: null,
          passportNumber: null,
          passportExpiryDate: null,
          dateOfBirth: null,
          notes: `Anonymized on ${anonymizedAt.toISOString()}. Reason: ${reason}`,
          status: 'terminated',
          employeeNumber: `ANON-${driverId}`,
          locationTrackingConsentAt: null,
          locationTrackingStatus: 'denied',
          locationTrackingEnabledAt: null,
          locationSharingStartedAt: null,
          locationSharingEndedAt: null,
          userId: null,
        },
      });

      if (driver.userId) {
        await tx.user.update({
          where: { id: driver.userId },
          data: { status: 'inactive' },
        });
      }
    });

    await this.safeAuditLog({
      actorUserId,
      action: 'privacy.driver_anonymized',
      entityType: 'driver',
      entityId: driverId,
      summary: 'Driver personal data anonymized',
      metadata: {
        reason,
        documentsRemoved: documents.length,
        linkedUserDeactivated: Boolean(driver.userId),
        assignmentsRetained: true,
      },
    });

    return {
      driver_id: driverId,
      anonymized_at: anonymizedAt.toISOString(),
      removed: {
        personal_fields: true,
        documents: documents.length,
        location_history: true,
        linked_user_deactivated: Boolean(driver.userId),
      },
      retained: {
        assignments: true,
        legal_basis:
          'Aufbewahrung von Einsatz-/Abrechnungsdaten gemäß handels- und steuerrechtlichen Pflichten (bis zu 10 Jahre).',
      },
    };
  }

  async purgeOldLocationHistory(): Promise<{ deleted: number; cutoff: string }> {
    const retentionDays = Number(process.env.LOCATION_HISTORY_RETENTION_DAYS ?? 90);
    const days = Number.isFinite(retentionDays) && retentionDays > 0 ? retentionDays : 90;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const result = await this.prisma.driverLocationHistory.deleteMany({
      where: { recordedAt: { lt: cutoff } },
    });

    if (result.count > 0) {
      await this.safeAuditLog({
        action: 'privacy.retention_purge',
        entityType: 'driver_location_history',
        summary: 'Location history retention purge',
        metadata: {
          deletedCount: result.count,
          retentionDays: days,
          cutoff: cutoff.toISOString(),
        },
      });
    }

    return { deleted: result.count, cutoff: cutoff.toISOString() };
  }

  async purgeOldAuditLogs(): Promise<{ deleted: number; cutoff: string }> {
    const retentionDays = Number(process.env.AUDIT_LOG_RETENTION_DAYS ?? 730);
    const days = Number.isFinite(retentionDays) && retentionDays > 0 ? retentionDays : 730;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const result = await this.prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    if (result.count > 0) {
      await this.safeAuditLog({
        action: 'privacy.retention_purge',
        entityType: 'audit_log',
        summary: 'Audit log retention purge',
        metadata: { deletedCount: result.count, retentionDays: days, cutoff: cutoff.toISOString() },
      });
    }

    return { deleted: result.count, cutoff: cutoff.toISOString() };
  }

  async purgeOldNotifications(): Promise<{ deleted: number; cutoff: string }> {
    const retentionDays = Number(process.env.NOTIFICATION_RETENTION_DAYS ?? 730);
    const days = Number.isFinite(retentionDays) && retentionDays > 0 ? retentionDays : 730;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const result = await this.prisma.notification.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    if (result.count > 0) {
      await this.safeAuditLog({
        action: 'privacy.retention_purge',
        entityType: 'notification',
        summary: 'Notification retention purge',
        metadata: { deletedCount: result.count, retentionDays: days, cutoff: cutoff.toISOString() },
      });
    }

    return { deleted: result.count, cutoff: cutoff.toISOString() };
  }

  async purgeOldMessages(): Promise<{ deleted: number; cutoff: string }> {
    const retentionDays = Number(process.env.MESSAGE_RETENTION_DAYS ?? 730);
    const days = Number.isFinite(retentionDays) && retentionDays > 0 ? retentionDays : 730;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const staleMessages = await this.prisma.message.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      take: 10_000,
    });

    if (staleMessages.length === 0) {
      return { deleted: 0, cutoff: cutoff.toISOString() };
    }

    const ids = staleMessages.map((row) => row.id);
    await this.prisma.messageRead.deleteMany({ where: { messageId: { in: ids } } });
    const result = await this.prisma.message.deleteMany({ where: { id: { in: ids } } });

    if (result.count > 0) {
      await this.safeAuditLog({
        action: 'privacy.retention_purge',
        entityType: 'message',
        summary: 'Messenger message retention purge',
        metadata: { deletedCount: result.count, retentionDays: days, cutoff: cutoff.toISOString() },
      });
    }

    return { deleted: result.count, cutoff: cutoff.toISOString() };
  }

  async purgeExpiredDocuments(): Promise<{ deleted: number; cutoff: string }> {
    const graceDays = Number(process.env.DOCUMENT_EXPIRY_GRACE_DAYS ?? 30);
    const days = Number.isFinite(graceDays) && graceDays >= 0 ? graceDays : 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const expired = await this.prisma.document.findMany({
      where: {
        expiryDate: { not: null, lt: cutoff },
      },
      select: { id: true, fileUrl: true },
      take: 500,
    });

    let deleted = 0;
    for (const document of expired) {
      if (document.fileUrl) {
        await this.objectStorage.deleteStoredFile(document.fileUrl);
        const absolutePath = resolveAbsolutePathFromStoredUrl(document.fileUrl);
        if (absolutePath && existsSync(absolutePath)) {
          await unlink(absolutePath).catch(() => undefined);
        }
      }
      await this.prisma.document.delete({ where: { id: document.id } });
      deleted += 1;
    }

    if (deleted > 0) {
      await this.safeAuditLog({
        action: 'privacy.retention_purge',
        entityType: 'document',
        summary: 'Expired document purge',
        metadata: {
          deletedCount: deleted,
          graceDays: days,
          cutoff: cutoff.toISOString(),
        },
      });
    }

    return { deleted, cutoff: cutoff.toISOString() };
  }
}
