import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Vehicle } from '@prisma/client';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { changedFieldNames, safeAuditLog } from '../audit/audit-helper';
import { AuditService } from '../audit/audit.service';
import { BillingService } from '../billing/billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { mimeTypeFromFileName } from '../storage/file-path.util';
import { ObjectStorageService } from '../storage/object-storage.service';
import { StorageService } from '../storage/storage.service';
import { TenantContext } from '../tenant/tenant-context';
import { loadHandoverPhotosBySlot } from '../vehicle-handovers/handover-photo.util';
import { ADMIN_ONLY_ROLES } from '../common/utils/permissions';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { ListVehiclesQueryDto } from './dto/list-vehicles-query.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';

type VehicleWithCurrentDriver = Vehicle & {
  currentDriver?: { id: string; firstName: string; lastName: string } | null;
};

function toClientVehicle(row: VehicleWithCurrentDriver) {
  return {
    id: row.id,
    plate_number: row.plateNumber,
    brand: row.brand,
    model: row.model,
    vin: row.vin ?? undefined,
    internal_code: row.internalCode,
    year: row.year ?? undefined,
    status: row.status,
    tuv_expiry_date: row.tuvExpiryDate?.toISOString(),
    sp_expiry_date: row.spExpiryDate?.toISOString(),
    insurance_expiry_date: row.insuranceExpiryDate?.toISOString(),
    registration_expiry_date: row.registrationExpiryDate?.toISOString(),
    current_driver: row.currentDriver
      ? {
          id: row.currentDriver.id,
          first_name: row.currentDriver.firstName,
          last_name: row.currentDriver.lastName,
        }
      : null,
    photo_url: row.photoUrl ? `/vehicles/${row.id}/photo` : undefined,
    created_at: row.createdAt.toISOString(),
  };
}

const currentDriverInclude = {
  currentDriver: {
    select: { id: true, firstName: true, lastName: true },
  },
} satisfies Prisma.VehicleInclude;

type UploadedVehiclePhotoFile = {
  filename: string;
};

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly objectStorage: ObjectStorageService,
    private readonly auditService: AuditService,
    private readonly billingService: BillingService,
  ) {}

  private buildVehicleWhere(
    query: ListVehiclesQueryDto,
    options?: { includeDeleted?: boolean },
  ): Prisma.VehicleWhereInput {
    const search = (query.search ?? '').trim();
    const filters: Prisma.VehicleWhereInput[] = [];

    if (!options?.includeDeleted) {
      filters.push({ deletedAt: null } as Prisma.VehicleWhereInput);
    }

    if (query.status) {
      filters.push({ status: query.status });
    }

    if (search.length > 0) {
      filters.push({
        OR: [
          { plateNumber: { contains: search, mode: 'insensitive' } },
          { internalCode: { contains: search, mode: 'insensitive' } },
          { brand: { contains: search, mode: 'insensitive' } },
          { model: { contains: search, mode: 'insensitive' } },
          { vin: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    if (filters.length === 0) {
      return {};
    }

    if (filters.length === 1) {
      return filters[0];
    }

    return { AND: filters };
  }

  private async assertActiveExists(id: string): Promise<void> {
    const exists = await this.prisma.vehicle.findFirst({
      where: { id, deletedAt: null } as Prisma.VehicleWhereInput,
      select: { id: true },
    } as any);
    if (!exists) {
      throw new NotFoundException('Vehicle not found');
    }
  }

  async findAll(query: ListVehiclesQueryDto) {
    const page = Number.isFinite(query.page) ? Math.max(1, Number(query.page)) : 1;
    const limit = Number.isFinite(query.limit) ? Math.min(100, Math.max(1, Number(query.limit))) : 20;
    const where = this.buildVehicleWhere(query);
    const sortByMap: Record<string, Prisma.VehicleOrderByWithRelationInput> = {
      plateNumber: { plateNumber: 'asc' },
      internalCode: { internalCode: 'asc' },
      brand: { brand: 'asc' },
      model: { model: 'asc' },
      status: { status: 'asc' },
      createdAt: { createdAt: 'asc' },
      updatedAt: { updatedAt: 'asc' },
    };
    const normalizedSort = query.sortBy && sortByMap[query.sortBy] ? query.sortBy : 'plateNumber';
    const sortOrder: Prisma.SortOrder = query.sortOrder === 'desc' ? 'desc' : 'asc';
    const orderBy = { [normalizedSort]: sortOrder } as Prisma.VehicleOrderByWithRelationInput;

    const [total, rows] = await Promise.all([
      this.prisma.vehicle.count({ where } as any),
      this.prisma.vehicle.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: currentDriverInclude,
      } as any),
    ]);
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    return {
      data: rows.map(toClientVehicle),
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  async findAllIncludingDeleted(query: ListVehiclesQueryDto, actorRole?: string) {
    if (!actorRole || !ADMIN_ONLY_ROLES.includes(actorRole as any)) {
      throw new ForbiddenException('Only admins can access deleted vehicles');
    }

    const page = Number.isFinite(query.page) ? Math.max(1, Number(query.page)) : 1;
    const limit = Number.isFinite(query.limit) ? Math.min(100, Math.max(1, Number(query.limit))) : 20;
    const where = this.buildVehicleWhere(query, { includeDeleted: true });
    const sortByMap: Record<string, Prisma.VehicleOrderByWithRelationInput> = {
      plateNumber: { plateNumber: 'asc' },
      internalCode: { internalCode: 'asc' },
      brand: { brand: 'asc' },
      model: { model: 'asc' },
      status: { status: 'asc' },
      createdAt: { createdAt: 'asc' },
      updatedAt: { updatedAt: 'asc' },
    };
    const normalizedSort = query.sortBy && sortByMap[query.sortBy] ? query.sortBy : 'plateNumber';
    const sortOrder: Prisma.SortOrder = query.sortOrder === 'desc' ? 'desc' : 'asc';
    const orderBy = { [normalizedSort]: sortOrder } as Prisma.VehicleOrderByWithRelationInput;

    const [total, rows] = await Promise.all([
      this.prisma.vehicle.count({ where } as any),
      this.prisma.vehicle.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: currentDriverInclude,
      } as any),
    ]);
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    return {
      data: rows.map(toClientVehicle),
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  async list(query: ListVehiclesQueryDto) {
    return this.findAll(query);
  }

  async getById(id: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id, deletedAt: null } as Prisma.VehicleWhereInput,
      include: {
        ...currentDriverInclude,
        assignments: {
          orderBy: [{ workDate: 'desc' }, { startTime: 'desc' }],
          take: 5,
          include: {
            driver: { select: { id: true, firstName: true, lastName: true } },
            company: { select: { name: true } },
          },
        },
      },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const documents = await this.prisma.document.findMany({
      where: { ownerType: 'vehicle', ownerId: id },
      orderBy: { createdAt: 'desc' },
    });

    return {
      ...toClientVehicle(vehicle),
      recent_assignments: vehicle.assignments.map((a) => ({
        id: a.id,
        driver: {
          id: a.driver.id,
          name: `${a.driver.firstName} ${a.driver.lastName}`,
        },
        vehicle: { id: vehicle.id, plate_number: vehicle.plateNumber },
        company_name: a.company.name,
        work_date: a.workDate.toISOString(),
        start_time: a.startTime,
        end_time: a.endTime,
        notes: a.notes ?? undefined,
        status: a.status,
      })),
      documents: documents.map((d) => ({
        id: d.id,
        ownerType: d.ownerType,
        ownerId: d.ownerId,
        documentType: d.documentType,
        fileName: d.fileName,
        download_url: d.fileUrl ? `/documents/${d.id}/download` : undefined,
        expiryDate: d.expiryDate?.toISOString(),
        uploadedAt: d.createdAt.toISOString(),
        status: d.status,
        notes: d.notes ?? undefined,
      })),
    };
  }

  async create(dto: CreateVehicleDto, actorUserId?: string, tenantId?: string) {
    await this.billingService.assertCanAddVehicle(tenantId);
    const internalCode = dto.internal_code ?? `V-${Date.now()}`;

    try {
      return await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const vehicle = await tx.vehicle.create({
          data: {
            plateNumber: dto.plate_number,
            internalCode,
            brand: dto.brand,
            model: dto.model,
            year: dto.year,
            vin: dto.vin,
            status: dto.status,
            currentDriverId: dto.current_driver_id,
            tuvExpiryDate: dto.tuv_expiry_date ? new Date(dto.tuv_expiry_date) : undefined,
            spExpiryDate: dto.sp_expiry_date ? new Date(dto.sp_expiry_date) : undefined,
            insuranceExpiryDate: dto.insurance_expiry_date
              ? new Date(dto.insurance_expiry_date)
              : undefined,
            registrationExpiryDate: dto.registration_expiry_date
              ? new Date(dto.registration_expiry_date)
              : undefined,
            notes: dto.notes,
            photoUrl: dto.photo_url,
          },
          include: currentDriverInclude,
        });

        await tx.auditLog.create({
          data: {
            tenantId: TenantContext.getTenantId() ?? null,
            actorUserId: actorUserId ?? null,
            action: 'vehicle.created',
            entityType: 'vehicle',
            entityId: vehicle.id,
            summary: 'Vehicle created',
            metadata: Prisma.JsonNull,
            ipAddress: null,
            userAgent: null,
          },
        });

        return toClientVehicle(vehicle);
      });
    } catch (error) {
      throw new InternalServerErrorException('Failed to create vehicle registration atomically');
    }
  }

  async update(id: string, dto: UpdateVehicleDto, actorUserId?: string) {
    await this.assertExists(id);

    const data: Prisma.VehicleUpdateInput = {};
    if (dto.plate_number !== undefined) data.plateNumber = dto.plate_number;
    if (dto.brand !== undefined) data.brand = dto.brand;
    if (dto.model !== undefined) data.model = dto.model;
    if (dto.internal_code !== undefined) data.internalCode = dto.internal_code;
    if (dto.year !== undefined) data.year = dto.year;
    if (dto.vin !== undefined) data.vin = dto.vin;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.current_driver_id !== undefined) {
      data.currentDriver = dto.current_driver_id
        ? { connect: { id: dto.current_driver_id } }
        : { disconnect: true };
    }
    if (dto.tuv_expiry_date !== undefined) {
      data.tuvExpiryDate = dto.tuv_expiry_date ? new Date(dto.tuv_expiry_date) : null;
    }
    if (dto.sp_expiry_date !== undefined) {
      data.spExpiryDate = dto.sp_expiry_date ? new Date(dto.sp_expiry_date) : null;
    }
    if (dto.insurance_expiry_date !== undefined) {
      data.insuranceExpiryDate = dto.insurance_expiry_date ? new Date(dto.insurance_expiry_date) : null;
    }
    if (dto.registration_expiry_date !== undefined) {
      data.registrationExpiryDate = dto.registration_expiry_date
        ? new Date(dto.registration_expiry_date)
        : null;
    }
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.photo_url !== undefined) data.photoUrl = dto.photo_url || null;

    const updated = await this.prisma.vehicle.update({
      where: { id },
      data,
      include: currentDriverInclude,
    });

    const changed = changedFieldNames(dto as Record<string, unknown>);
    if (changed.length > 0) {
      await safeAuditLog(this.auditService, {
        actorUserId,
        action: 'vehicle.updated',
        entityType: 'vehicle',
        entityId: id,
        summary: 'Vehicle updated',
        metadata: { changed_fields: changed },
      });
    }

    return toClientVehicle(updated);
  }

  async resolveVehiclePhotoDownload(
    id: string,
  ): Promise<{ stream: Readable; fileName: string; mimeType: string }> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id, deletedAt: null } as Prisma.VehicleWhereInput,
      select: { photoUrl: true, plateNumber: true },
    } as any);
    if (!vehicle?.photoUrl) {
      throw new NotFoundException('Vehicle photo not found');
    }

    const opened = await this.objectStorage.openStoredFile(vehicle.photoUrl);
    if (!opened) {
      throw new NotFoundException('Vehicle photo file not found');
    }

    const fileName = `${vehicle.plateNumber.replace(/\s+/g, '-')}-photo.jpg`;
    return {
      stream: opened.stream,
      fileName,
      mimeType: opened.contentType ?? mimeTypeFromFileName(fileName),
    };
  }

  async recordVehiclePhotoDownload(vehicleId: string, actorUserId?: string): Promise<void> {
    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'vehicle_photo.download',
      entityType: 'vehicle',
      entityId: vehicleId,
      summary: 'Vehicle photo downloaded',
    });
  }

  async uploadPhoto(id: string, file: UploadedVehiclePhotoFile, actorUserId?: string) {
    const existing = await this.prisma.vehicle.findFirst({
      where: { id, deletedAt: null } as Prisma.VehicleWhereInput,
    } as any);
    if (!existing) {
      throw new NotFoundException('Vehicle not found');
    }

    const photoUrl = this.storageService.buildStoredPath('vehicles', file.filename);
    const vehicle = await this.prisma.vehicle.update({
      where: { id },
      data: { photoUrl },
      include: currentDriverInclude,
    });

    await this.removeStoredPhotoIfLocal(existing.photoUrl);
    await this.objectStorage.syncLocalFile(photoUrl);

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'vehicle.photo_uploaded',
      entityType: 'vehicle',
      entityId: id,
      summary: 'Vehicle photo uploaded',
    });

    return toClientVehicle(vehicle);
  }

  async deactivate(id: string, actorUserId?: string) {
    return this.remove(id, actorUserId);
  }

  async remove(id: string, actorUserId?: string) {
    const existing = await this.prisma.vehicle.findUnique({
      where: { id },
      select: { id: true, deletedAt: true },
    } as any);

    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Vehicle not found');
    }

    const vehicle = await this.prisma.vehicle.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        // VehicleStatus does not currently have a decommissioned value in schema.
        // Keep it inactive for now to preserve enum integrity.
        status: 'inactive',
      } as Prisma.VehicleUpdateInput,
      include: currentDriverInclude,
    });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'vehicle.deleted',
      entityType: 'vehicle',
      entityId: id,
      summary: 'Vehicle soft deleted',
    });

    return toClientVehicle(vehicle);
  }

  async restore(id: string, actorUserId?: string) {
    const existing = await this.prisma.vehicle.findUnique({
      where: { id },
      select: { id: true, deletedAt: true },
    } as any);

    if (!existing) {
      throw new NotFoundException('Vehicle not found');
    }

    const vehicle = await this.prisma.vehicle.update({
      where: { id },
      data: {
        deletedAt: null,
        status: 'inactive',
      } as Prisma.VehicleUpdateInput,
      include: currentDriverInclude,
    });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'vehicle.restored',
      entityType: 'vehicle',
      entityId: id,
      summary: 'Vehicle restored',
    });

    return toClientVehicle(vehicle);
  }

  async getAssignments(id: string, query: { from?: string; to?: string; status?: string }) {
    await this.assertActiveExists(id);
    const where: Prisma.AssignmentWhereInput = { vehicleId: id };
    if (query.from || query.to) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (query.from) {
        const f = new Date(query.from);
        if (!Number.isNaN(f.getTime())) {
          f.setHours(0, 0, 0, 0);
          dateFilter.gte = f;
        }
      }
      if (query.to) {
        const t = new Date(query.to);
        if (!Number.isNaN(t.getTime())) {
          t.setHours(23, 59, 59, 999);
          dateFilter.lte = t;
        }
      }
      where.workDate = dateFilter;
    }
    if (query.status) where.status = query.status as any;
    return this.prisma.assignment.findMany({
      where,
      include: {
        driver: { select: { id: true, firstName: true, lastName: true } },
        company: { select: { id: true, name: true } },
      },
      orderBy: { workDate: 'desc' },
    });
  }

  async getHandovers(id: string) {
    await this.assertActiveExists(id);
    const rows = await this.prisma.vehicleHandover.findMany({
      where: { vehicleId: id },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { handoverDateTime: 'desc' },
    });

    return Promise.all(
      rows.map(async (row) => {
        const photos = await loadHandoverPhotosBySlot(this.prisma, row.id, {
          downloadPathPrefix: '/documents',
        });
        return {
          ...row,
          handoverDateTime: row.handoverDateTime.toISOString(),
          photos,
        };
      }),
    );
  }

  async getIncidents(id: string) {
    await this.assertActiveExists(id);
    return this.prisma.accident.findMany({
      where: { vehicleId: id },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { incidentDateTime: 'desc' },
    });
  }

  private async removeStoredPhotoIfLocal(photoUrl: string | null | undefined): Promise<void> {
    if (!photoUrl?.startsWith('/uploads/vehicles/')) {
      return;
    }
    const absolutePath = join(process.cwd(), photoUrl.replace(/^\//, ''));
    try {
      await unlink(absolutePath);
    } catch {
      // Previous file may already be gone.
    }
  }

  private async assertExists(id: string): Promise<void> {
    await this.assertActiveExists(id);
  }
}
