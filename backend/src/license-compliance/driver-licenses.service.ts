import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { safeAuditLog } from '../audit/audit-helper';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { LicensePhotoStorageService } from '../storage/license-photo-storage.service';
import { CreateDriverLicenseDto } from './dto/create-driver-license.dto';
import { UpdateDriverLicenseDto } from './dto/update-driver-license.dto';
import {
  normalizeDate,
  parseLicenseClasses,
} from './license-compliance.util';
type UploadedLicensePhotoFile = {
  originalname: string;
  buffer: Buffer;
};

@Injectable()
export class DriverLicensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly photoStorage: LicensePhotoStorageService,
  ) {}

  async list(query: { driver_id?: string; include_deleted?: boolean }) {
    const where: Prisma.DriverLicenseWhereInput = {};
    if (query.driver_id) where.driverId = query.driver_id;
    if (!query.include_deleted) where.deletedAt = null;

    const rows = await this.prisma.driverLicense.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
      },
    });

    return rows.map((row) => this.toClient(row));
  }

  async getById(id: string) {
    const row = await this.prisma.driverLicense.findUnique({
      where: { id },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
      },
    });
    if (!row || row.deletedAt) throw new NotFoundException('Driver license not found');
    return this.toClient(row);
  }

  async getActiveByDriverId(driverId: string) {
    const row = await this.prisma.driverLicense.findFirst({
      where: { driverId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
      },
    });
    if (!row) return null;
    return this.toClient(row);
  }

  async create(
    dto: CreateDriverLicenseDto,
    actorUserId?: string,
    photos?: { front?: UploadedLicensePhotoFile; back?: UploadedLicensePhotoFile },
  ) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: dto.driver_id },
      select: { id: true, tenantId: true },
    });
    if (!driver) throw new NotFoundException('Driver not found');

    const existing = await this.prisma.driverLicense.findFirst({
      where: { driverId: dto.driver_id, deletedAt: null },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Active driver license already exists for this driver');
    }

    const classes = parseLicenseClasses(dto.classes);
    if (classes.length === 0) {
      throw new BadRequestException('At least one valid license class is required');
    }

    const issuedAt = normalizeDate(new Date(dto.issued_at));
    const expiresAt = normalizeDate(new Date(dto.expires_at));
    if (expiresAt <= issuedAt) {
      throw new BadRequestException('expires_at must be after issued_at');
    }

    let frontPhotoStoredPath: string | undefined;
    let backPhotoStoredPath: string | undefined;
    if (photos?.front) {
      frontPhotoStoredPath = await this.photoStorage.saveEncrypted(
        photos.front.originalname,
        'license_front',
        photos.front.buffer,
      );
    }
    if (photos?.back) {
      backPhotoStoredPath = await this.photoStorage.saveEncrypted(
        photos.back.originalname,
        'license_back',
        photos.back.buffer,
      );
    }

    const nextCheckDueAt = normalizeDate(new Date());

    const row = await this.prisma.driverLicense.create({
      data: {
        tenantId: driver.tenantId,
        driverId: dto.driver_id,
        licenseNumber: dto.license_number.trim(),
        classes,
        issuedAt,
        expiresAt,
        issuingAuthority: dto.issuing_authority.trim(),
        frontPhotoStoredPath,
        backPhotoStoredPath,
        nextCheckDueAt,
        checkRequestedAt: new Date(),
      },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
      },
    });

    await this.prisma.driver.update({
      where: { id: dto.driver_id },
      data: {
        licenseNumber: row.licenseNumber,
        licenseExpiryDate: row.expiresAt,
      },
    });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'driver_license.created',
      entityType: 'driver_license',
      entityId: row.id,
      summary: 'Driver license record created',
      metadata: { driverId: dto.driver_id, classes },
    });

    return this.toClient(row);
  }

  async update(id: string, dto: UpdateDriverLicenseDto, actorUserId?: string) {
    const existing = await this.prisma.driverLicense.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) throw new NotFoundException('Driver license not found');

    const data: Prisma.DriverLicenseUpdateInput = {};
    if (dto.license_number !== undefined) data.licenseNumber = dto.license_number.trim();
    if (dto.classes !== undefined) {
      const classes = parseLicenseClasses(dto.classes);
      if (classes.length === 0) throw new BadRequestException('At least one valid license class is required');
      data.classes = classes;
    }
    if (dto.issued_at !== undefined) data.issuedAt = normalizeDate(new Date(dto.issued_at));
    if (dto.expires_at !== undefined) data.expiresAt = normalizeDate(new Date(dto.expires_at));
    if (dto.issuing_authority !== undefined) data.issuingAuthority = dto.issuing_authority.trim();

    const row = await this.prisma.driverLicense.update({
      where: { id },
      data,
      include: {
        driver: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
      },
    });

    if (dto.license_number !== undefined || dto.expires_at !== undefined) {
      await this.prisma.driver.update({
        where: { id: row.driverId },
        data: {
          licenseNumber: row.licenseNumber,
          licenseExpiryDate: row.expiresAt,
        },
      });
    }

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'driver_license.updated',
      entityType: 'driver_license',
      entityId: row.id,
      summary: 'Driver license metadata updated',
    });

    return this.toClient(row);
  }

  async softDeleteForTerminatedDriver(driverId: string, actorUserId?: string) {
    const license = await this.prisma.driverLicense.findFirst({
      where: { driverId, deletedAt: null },
    });
    if (!license) return { deleted: false };

    await this.prisma.driverLicense.update({
      where: { id: license.id },
      data: { deletedAt: new Date() },
    });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'driver_license.soft_deleted',
      entityType: 'driver_license',
      entityId: license.id,
      summary: 'Driver license soft-deleted after termination',
      metadata: { driverId },
    });

    return { deleted: true, id: license.id };
  }

  private toClient(
    row: Prisma.DriverLicenseGetPayload<{
      include: { driver: { select: { id: true; firstName: true; lastName: true; employeeNumber: true } } };
    }>,
  ) {
    return {
      id: row.id,
      driver_id: row.driverId,
      driver_name: `${row.driver.firstName} ${row.driver.lastName}`.trim(),
      employee_number: row.driver.employeeNumber,
      license_number: row.licenseNumber,
      classes: row.classes,
      issued_at: row.issuedAt.toISOString().slice(0, 10),
      expires_at: row.expiresAt.toISOString().slice(0, 10),
      issuing_authority: row.issuingAuthority,
      front_photo_download_url: row.frontPhotoStoredPath
        ? `/driver-licenses/${row.id}/photo/front`
        : null,
      back_photo_download_url: row.backPhotoStoredPath
        ? `/driver-licenses/${row.id}/photo/back`
        : null,
      next_check_due_at: row.nextCheckDueAt?.toISOString().slice(0, 10) ?? null,
      last_approved_check_at: row.lastApprovedCheckAt?.toISOString() ?? null,
      check_requested_at: row.checkRequestedAt?.toISOString() ?? null,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }
}
