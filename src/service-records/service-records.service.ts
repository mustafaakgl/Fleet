import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ServiceRecord } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceRecordDto } from './dto/create-service-record.dto';
import { UpdateServiceRecordDto } from './dto/update-service-record.dto';

type ServiceRecordWithVehicle = ServiceRecord & {
  vehicle: { id: string; plateNumber: string };
};

function toClient(row: ServiceRecordWithVehicle) {
  return {
    id: row.id,
    vehicle_id: row.vehicleId,
    vehicle_plate: row.vehicle.plateNumber,
    date: row.date.toISOString(),
    service_type: row.serviceType,
    repair_company: row.repairCompany,
    cost_amount: Number(row.costAmount.toString()),
    mileage_km: row.mileageKm ?? null,
    notes: row.notes ?? undefined,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

const vehicleInclude = {
  vehicle: { select: { id: true, plateNumber: true } },
} satisfies Prisma.ServiceRecordInclude;

@Injectable()
export class ServiceRecordsService {
  constructor(private readonly prisma: PrismaService) {}

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
      include: vehicleInclude,
    });
    return rows.map(toClient);
  }

  async getById(id: string) {
    const record = await this.prisma.serviceRecord.findUnique({
      where: { id },
      include: vehicleInclude,
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

  async create(dto: CreateServiceRecordDto) {
    const record = await this.prisma.serviceRecord.create({
      data: {
        vehicleId: dto.vehicle_id,
        date: new Date(dto.date),
        serviceType: dto.service_type,
        repairCompany: dto.repair_company,
        costAmount: dto.cost_amount,
        mileageKm: dto.mileage_km,
        notes: dto.notes,
      },
      include: vehicleInclude,
    });
    return toClient(record);
  }

  async update(id: string, dto: UpdateServiceRecordDto) {
    await this.assertExists(id);
    const data: Prisma.ServiceRecordUpdateInput = {};
    if (dto.date !== undefined) data.date = new Date(dto.date);
    if (dto.service_type !== undefined) data.serviceType = dto.service_type;
    if (dto.repair_company !== undefined) data.repairCompany = dto.repair_company;
    if (dto.cost_amount !== undefined) data.costAmount = dto.cost_amount;
    if (dto.mileage_km !== undefined) data.mileageKm = dto.mileage_km;
    if (dto.notes !== undefined) data.notes = dto.notes;

    const record = await this.prisma.serviceRecord.update({
      where: { id },
      data,
      include: vehicleInclude,
    });
    return toClient(record);
  }

  async remove(id: string) {
    await this.assertExists(id);
    await this.prisma.serviceRecord.delete({ where: { id } });
    return { id, deleted: true };
  }

  private async assertExists(id: string): Promise<void> {
    const exists = await this.prisma.serviceRecord.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Service record not found');
  }
}
