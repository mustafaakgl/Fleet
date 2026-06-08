import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ServiceRecord } from '@prisma/client';
import { safeAuditLog } from '../audit/audit-helper';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceRecordDto } from './dto/create-service-record.dto';
import { UpdateServiceRecordDto } from './dto/update-service-record.dto';

type ServiceRecordWithRelations = ServiceRecord & {
  vehicle: { id: string; plateNumber: string };
  driver: { id: string; firstName: string; lastName: string } | null;
};

function toClient(row: ServiceRecordWithRelations) {
  return {
    id: row.id,
    vehicle_id: row.vehicleId,
    vehicle_plate: row.vehicle.plateNumber,
    driver_id: row.driverId ?? undefined,
    driver_name: row.driver ? `${row.driver.firstName} ${row.driver.lastName}`.trim() : undefined,
    date: row.date.toISOString(),
    service_type: row.serviceType,
    vendor: row.vendor ?? undefined,
    repair_company: row.repairCompany,
    cost_amount: Number(row.costAmount.toString()),
    mileage_km: row.mileageKm ?? null,
    notes: row.notes ?? undefined,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

const recordInclude = {
  vehicle: { select: { id: true, plateNumber: true } },
  driver: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.ServiceRecordInclude;

@Injectable()
export class ServiceRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(query: { vehicle_id?: string; from?: string; to?: string; repair_company?: string }) {
    const where: Prisma.ServiceRecordWhereInput = {};
    if (query.vehicle_id) where.vehicleId = query.vehicle_id;
    if (query.repair_company) where.repairCompany = query.repair_company;
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
      where.date = dateFilter;
    }

    const rows = await this.prisma.serviceRecord.findMany({
      where,
      orderBy: { date: 'desc' },
      include: recordInclude,
    });
    return rows.map(toClient);
  }

  async getById(id: string) {
    const record = await this.prisma.serviceRecord.findUnique({
      where: { id },
      include: recordInclude,
    });
    if (!record) throw new NotFoundException('Service record not found');
    return toClient(record);
  }

  async getRepairCompanies(): Promise<string[]> {
    const rows = await this.prisma.serviceRecord.findMany({
      distinct: ['repairCompany'],
      select: { repairCompany: true },
      orderBy: { repairCompany: 'asc' },
    });
    return rows.map((r) => r.repairCompany);
  }

  async create(dto: CreateServiceRecordDto, actorUserId?: string) {
    const record = await this.prisma.serviceRecord.create({
      data: {
        vehicleId: dto.vehicle_id,
        driverId: dto.driver_id,
        date: new Date(dto.date),
        serviceType: dto.service_type,
        vendor: dto.vendor?.trim() || null,
        repairCompany: dto.repair_company?.trim() || '—',
        costAmount: dto.cost_amount,
        mileageKm: dto.mileage_km,
        notes: dto.notes,
      },
      include: recordInclude,
    });
    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'service_record.created',
      entityType: 'service_record',
      entityId: record.id,
      summary: 'Service record created',
    });
    return toClient(record);
  }

  async update(id: string, dto: UpdateServiceRecordDto, actorUserId?: string) {
    await this.assertExists(id);
    const data: Prisma.ServiceRecordUpdateInput = {};
    if (dto.vehicle_id !== undefined) {
      data.vehicle = { connect: { id: dto.vehicle_id } };
    }
    if (dto.date !== undefined) data.date = new Date(dto.date);
    if (dto.service_type !== undefined) data.serviceType = dto.service_type;
    if (dto.vendor !== undefined) data.vendor = dto.vendor.trim() || null;
    if (dto.repair_company !== undefined) data.repairCompany = dto.repair_company.trim() || '—';
    if (dto.cost_amount !== undefined) data.costAmount = dto.cost_amount;
    if (dto.mileage_km !== undefined) data.mileageKm = dto.mileage_km;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.driver_id !== undefined) {
      data.driver = dto.driver_id
        ? { connect: { id: dto.driver_id } }
        : { disconnect: true };
    }

    const record = await this.prisma.serviceRecord.update({
      where: { id },
      data,
      include: recordInclude,
    });
    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'service_record.updated',
      entityType: 'service_record',
      entityId: id,
      summary: 'Service record updated',
    });
    return toClient(record);
  }

  async remove(id: string, actorUserId?: string) {
    await this.assertExists(id);
    await this.prisma.serviceRecord.delete({ where: { id } });
    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'service_record.deleted',
      entityType: 'service_record',
      entityId: id,
      summary: 'Service record deleted',
    });
    return { id, deleted: true };
  }

  private async assertExists(id: string): Promise<void> {
    const exists = await this.prisma.serviceRecord.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Service record not found');
  }
}
