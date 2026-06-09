import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ServiceRecord } from '@prisma/client';
import { safeAuditLog } from '../audit/audit-helper';
import { AuditService } from '../audit/audit.service';
import { parseCsv, pickField } from '../import/csv.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceRecordDto } from './dto/create-service-record.dto';
import { UpdateServiceRecordDto } from './dto/update-service-record.dto';

type ImportError = { row: number; message: string };
export type ServiceRecordImportResult = {
  created: number;
  skipped: number;
  errors: ImportError[];
};

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

  private parseImportDate(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;

    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return trimmed.slice(0, 10);
    }

    const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (slashMatch) {
      const month = slashMatch[1].padStart(2, '0');
      const day = slashMatch[2].padStart(2, '0');
      return `${slashMatch[3]}-${month}-${day}`;
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
  }

  private buildImportNotes(input: {
    reference?: string;
    priority?: string;
    labels?: string;
    notes?: string;
  }): string | undefined {
    const blocks: string[] = [];
    if (input.reference?.trim()) blocks.push(`Reference: ${input.reference.trim()}`);
    if (input.labels?.trim()) blocks.push(`Labels: ${input.labels.trim()}`);
    if (input.priority?.trim()) blocks.push(`Priority: ${input.priority.trim()}`);
    if (input.notes?.trim()) blocks.push(input.notes.trim());
    return blocks.length > 0 ? blocks.join('\n\n') : undefined;
  }

  private async resolveDriverId(driverName: string): Promise<string | undefined> {
    const normalized = driverName.trim();
    if (!normalized) return undefined;

    const parts = normalized.split(/\s+/).filter(Boolean);
    const drivers = await this.prisma.driver.findMany({
      where:
        parts.length >= 2
          ? {
              AND: [
                { firstName: { contains: parts[0], mode: 'insensitive' } },
                { lastName: { contains: parts.slice(1).join(' '), mode: 'insensitive' } },
              ],
            }
          : {
              OR: [
                { firstName: { contains: normalized, mode: 'insensitive' } },
                { lastName: { contains: normalized, mode: 'insensitive' } },
              ],
            },
      select: { id: true },
      take: 1,
    });

    return drivers[0]?.id;
  }

  async importFromCsv(fileContent: string, actorUserId?: string): Promise<ServiceRecordImportResult> {
    const { rows } = parseCsv(fileContent);
    if (rows.length === 0) {
      throw new BadRequestException('CSV file is empty or has no data rows');
    }

    const result: ServiceRecordImportResult = { created: 0, skipped: 0, errors: [] };
    const vehicleCache = new Map<string, string | null>();

    for (let index = 0; index < rows.length; index += 1) {
      const rowNumber = index + 2;
      const row = rows[index];

      try {
        const vehiclePlate = pickField(row, [
          'vehicle_plate',
          'plate_number',
          'plate',
          'kennzeichen',
          'vehicle',
        ]);
        const vehicleIdRaw = pickField(row, ['vehicle_id']);
        const completionDate = pickField(row, [
          'completion_date',
          'date',
          'completion date',
          'abschlussdatum',
        ]);
        const serviceTask = pickField(row, [
          'service_task',
          'service_type',
          'service task',
          'task',
        ]);
        const costRaw = pickField(row, ['cost', 'cost_amount', 'total', 'total_cost', 'amount']);
        const mileageRaw = pickField(row, ['mileage_km', 'meter', 'mileage', 'km']);
        const vendor = pickField(row, ['vendor', 'werkstatt', 'supplier']);
        const repairCompany = pickField(row, ['repair_company', 'repairment_company', 'repair company']);
        const driverName = pickField(row, ['driver_name', 'driver', 'fahrer', 'sofor']);
        const driverIdRaw = pickField(row, ['driver_id']);
        const reference = pickField(row, ['reference', 'work_order', 'work order']);
        const priority = pickField(row, ['priority', 'priority_class', 'repair_priority_class']);
        const labels = pickField(row, ['labels', 'label']);
        const notes = pickField(row, ['notes', 'comments', 'comment']);

        if (!completionDate || !serviceTask) {
          result.errors.push({
            row: rowNumber,
            message: 'completion_date and service_task are required',
          });
          continue;
        }

        const parsedDate = this.parseImportDate(completionDate);
        if (!parsedDate) {
          result.errors.push({ row: rowNumber, message: 'Invalid completion_date format' });
          continue;
        }

        const costAmount = Number(costRaw.replace(',', '.'));
        if (!Number.isFinite(costAmount) || costAmount < 0) {
          result.errors.push({ row: rowNumber, message: 'Valid cost amount is required' });
          continue;
        }

        let vehicleId = vehicleIdRaw || undefined;
        if (!vehicleId && vehiclePlate) {
          const cacheKey = vehiclePlate.toLowerCase();
          if (!vehicleCache.has(cacheKey)) {
            const vehicle = await this.prisma.vehicle.findFirst({
              where: { plateNumber: { equals: vehiclePlate, mode: 'insensitive' } },
              select: { id: true },
            });
            vehicleCache.set(cacheKey, vehicle?.id ?? null);
          }
          vehicleId = vehicleCache.get(cacheKey) ?? undefined;
        }

        if (!vehicleId) {
          result.errors.push({
            row: rowNumber,
            message: 'Vehicle not found (use vehicle_plate or vehicle_id)',
          });
          continue;
        }

        const mileageKm = mileageRaw ? Number(mileageRaw.replace(',', '.')) : undefined;
        const driverId =
          driverIdRaw || (driverName ? await this.resolveDriverId(driverName) : undefined);

        await this.create(
          {
            vehicle_id: vehicleId,
            driver_id: driverId,
            date: parsedDate,
            service_type: serviceTask,
            vendor: vendor || undefined,
            repair_company: repairCompany || vendor || undefined,
            cost_amount: costAmount,
            mileage_km:
              mileageKm !== undefined && Number.isFinite(mileageKm) ? Math.round(mileageKm) : undefined,
            notes: this.buildImportNotes({ reference, priority, labels, notes }),
          },
          actorUserId,
        );
        result.created += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Import failed';
        result.errors.push({ row: rowNumber, message });
      }
    }

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'import.service_records_csv',
      entityType: 'import',
      summary: 'Service records CSV import completed',
      metadata: {
        created: result.created,
        skipped: result.skipped,
        error_count: result.errors.length,
      },
    });

    return result;
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
