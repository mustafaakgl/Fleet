import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Vehicle, VehicleStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';

const ALLOWED_STATUSES: ReadonlySet<VehicleStatus> = new Set([
  'active',
  'maintenance',
  'broken',
  'inactive',
]);

type VehicleWithCurrentDriver = Vehicle & {
  currentDriver: { id: string; firstName: string; lastName: string } | null;
};

function toClientVehicle(row: VehicleWithCurrentDriver) {
  return {
    id: row.id,
    plate_number: row.plateNumber,
    brand: row.brand,
    model: row.model,
    year: row.year ?? undefined,
    status: row.status,
    tuv_expiry_date: row.tuvExpiryDate?.toISOString(),
    sp_expiry_date: row.spExpiryDate?.toISOString(),
    current_driver: row.currentDriver
      ? {
          id: row.currentDriver.id,
          first_name: row.currentDriver.firstName,
          last_name: row.currentDriver.lastName,
        }
      : null,
    created_at: row.createdAt.toISOString(),
  };
}

const currentDriverInclude = {
  currentDriver: {
    select: { id: true, firstName: true, lastName: true },
  },
} satisfies Prisma.VehicleInclude;

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: { status?: string; search?: string; page?: number; limit?: number }) {
    const page = Number.isFinite(query.page) ? Math.max(1, Number(query.page)) : 1;
    const limit = Number.isFinite(query.limit) ? Math.min(200, Math.max(1, Number(query.limit))) : 50;
    const search = (query.search ?? '').trim();

    const where: Prisma.VehicleWhereInput = {};

    if (query.status && ALLOWED_STATUSES.has(query.status as VehicleStatus)) {
      where.status = query.status as VehicleStatus;
    }

    if (search.length > 0) {
      where.OR = [
        { plateNumber: { contains: search, mode: 'insensitive' } },
        { internalCode: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } },
        { model: { contains: search, mode: 'insensitive' } },
        { vin: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.vehicle.count({ where }),
      this.prisma.vehicle.findMany({
        where,
        orderBy: [{ plateNumber: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: currentDriverInclude,
      }),
    ]);

    return {
      total,
      page,
      limit,
      data: rows.map(toClientVehicle),
    };
  }

  async getById(id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
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
        fileUrl: d.fileUrl ?? undefined,
        expiryDate: d.expiryDate?.toISOString(),
        uploadedAt: d.createdAt.toISOString(),
        status: d.status,
        notes: d.notes ?? undefined,
      })),
    };
  }

  async create(dto: CreateVehicleDto) {
    const internalCode = dto.internal_code ?? `V-${Date.now()}`;

    const vehicle = await this.prisma.vehicle.create({
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
        insuranceExpiryDate: dto.insurance_expiry_date ? new Date(dto.insurance_expiry_date) : undefined,
        registrationExpiryDate: dto.registration_expiry_date
          ? new Date(dto.registration_expiry_date)
          : undefined,
        notes: dto.notes,
      },
      include: currentDriverInclude,
    });

    return toClientVehicle(vehicle);
  }

  async update(id: string, dto: UpdateVehicleDto) {
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

    const updated = await this.prisma.vehicle.update({
      where: { id },
      data,
      include: currentDriverInclude,
    });

    return toClientVehicle(updated);
  }

  async deactivate(id: string) {
    await this.assertExists(id);
    const vehicle = await this.prisma.vehicle.update({
      where: { id },
      data: { status: 'inactive' },
      include: currentDriverInclude,
    });
    return toClientVehicle(vehicle);
  }

  async getAssignments(id: string, query: { from?: string; to?: string; status?: string }) {
    await this.assertExists(id);
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
    await this.assertExists(id);
    return this.prisma.vehicleHandover.findMany({
      where: { vehicleId: id },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { handoverDateTime: 'desc' },
    });
  }

  async getIncidents(id: string) {
    await this.assertExists(id);
    return this.prisma.accident.findMany({
      where: { vehicleId: id },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { incidentDateTime: 'desc' },
    });
  }

  private async assertExists(id: string): Promise<void> {
    const exists = await this.prisma.vehicle.findUnique({ where: { id }, select: { id: true } });
    if (!exists) {
      throw new NotFoundException('Vehicle not found');
    }
  }
}
