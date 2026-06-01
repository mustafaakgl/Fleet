import { Injectable, NotFoundException } from '@nestjs/common';
import { AssignmentStatus, Company, Prisma, CompanyEmailStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

const ACTIVE_ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  AssignmentStatus.planned,
  AssignmentStatus.confirmed,
  AssignmentStatus.in_progress,
];

type CompanyWithCount = Company & {
  _count: { assignments: number };
};

function toClientCompany(row: CompanyWithCount) {
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    address: row.address ?? undefined,
    contact_person: row.contactPerson ?? undefined,
    default_daily_revenue:
      row.defaultDailyRevenue === null ? null : Number(row.defaultDailyRevenue.toString()),
    notes: row.notes ?? undefined,
    active_assignments_count: row._count.assignments,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

const listInclude = {
  _count: {
    select: {
      assignments: { where: { status: { in: ACTIVE_ASSIGNMENT_STATUSES } } },
    },
  },
} satisfies Prisma.CompanyInclude;

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: { search?: string; page?: number; limit?: number }) {
    const page = Number.isFinite(query.page) ? Math.max(1, Number(query.page)) : 1;
    const limit = Number.isFinite(query.limit) ? Math.min(200, Math.max(1, Number(query.limit))) : 50;
    const search = (query.search ?? '').trim();

    const where: Prisma.CompanyWhereInput = {};
    if (search.length > 0) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { contactPerson: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.company.count({ where }),
      this.prisma.company.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: listInclude,
      }),
    ]);

    const distinctCounts = await this.fetchDistinctCounts(rows.map((r) => r.id));

    return {
      total,
      page,
      limit,
      data: rows.map((row) => {
        const counts = distinctCounts.get(row.id) ?? { drivers: 0, vehicles: 0 };
        return {
          ...toClientCompany(row),
          current_drivers_count: counts.drivers,
          current_vehicles_count: counts.vehicles,
        };
      }),
    };
  }

  private async fetchDistinctCounts(
    companyIds: string[],
  ): Promise<Map<string, { drivers: number; vehicles: number }>> {
    const result = new Map<string, { drivers: number; vehicles: number }>();
    if (companyIds.length === 0) return result;

    type Row = { companyId: string; drivers: bigint | number; vehicles: bigint | number };
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT "companyId",
             COUNT(DISTINCT "driverId")::int AS drivers,
             COUNT(DISTINCT "vehicleId")::int AS vehicles
      FROM "Assignment"
      WHERE "companyId" = ANY(${companyIds})
        AND "status" IN ('planned'::"AssignmentStatus", 'confirmed'::"AssignmentStatus", 'in_progress'::"AssignmentStatus")
      GROUP BY "companyId"
    `;

    for (const r of rows) {
      result.set(r.companyId, {
        drivers: Number(r.drivers),
        vehicles: Number(r.vehicles),
      });
    }
    return result;
  }

  async getById(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: listInclude,
    });
    if (!company) throw new NotFoundException('Company not found');

    const [currentDrivers, currentVehicles] = await Promise.all([
      this.prisma.assignment.findMany({
        where: { companyId: id, status: { in: ACTIVE_ASSIGNMENT_STATUSES } },
        distinct: ['driverId'],
        select: { driver: { select: { id: true, firstName: true, lastName: true } } },
      }),
      this.prisma.assignment.findMany({
        where: { companyId: id, status: { in: ACTIVE_ASSIGNMENT_STATUSES } },
        distinct: ['vehicleId'],
        select: { vehicle: { select: { id: true, plateNumber: true } } },
      }),
    ]);

    return {
      ...toClientCompany(company),
      current_drivers: currentDrivers.map((a) => ({
        id: a.driver.id,
        first_name: a.driver.firstName,
        last_name: a.driver.lastName,
      })),
      current_vehicles: currentVehicles.map((a) => ({
        id: a.vehicle.id,
        plate_number: a.vehicle.plateNumber,
      })),
    };
  }

  async create(dto: CreateCompanyDto) {
    const company = await this.prisma.company.create({
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        address: dto.address,
        contactPerson: dto.contact_person,
        defaultDailyRevenue: dto.default_daily_revenue,
        notes: dto.notes,
      },
      include: listInclude,
    });
    return toClientCompany(company);
  }

  async update(id: string, dto: UpdateCompanyDto) {
    await this.assertExists(id);

    const data: Prisma.CompanyUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.contact_person !== undefined) data.contactPerson = dto.contact_person;
    if (dto.default_daily_revenue !== undefined) data.defaultDailyRevenue = dto.default_daily_revenue;
    if (dto.notes !== undefined) data.notes = dto.notes;

    const updated = await this.prisma.company.update({
      where: { id },
      data,
      include: listInclude,
    });
    return toClientCompany(updated);
  }

  async remove(id: string) {
    await this.assertExists(id);
    await this.prisma.company.delete({ where: { id } });
    return { id, deleted: true };
  }

  async getAssignments(id: string, query: { from?: string; to?: string; status?: string }) {
    await this.assertExists(id);
    const where: Prisma.AssignmentWhereInput = { companyId: id };
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
    if (query.status && Object.values(AssignmentStatus).includes(query.status as AssignmentStatus)) {
      where.status = query.status as AssignmentStatus;
    }
    return this.prisma.assignment.findMany({
      where,
      include: {
        driver: { select: { id: true, firstName: true, lastName: true } },
        vehicle: { select: { id: true, plateNumber: true } },
      },
      orderBy: { workDate: 'desc' },
    });
  }

  async getEmailHistory(id: string, query: { status?: string }) {
    await this.assertExists(id);
    const where: Prisma.CompanyEmailWhereInput = { companyId: id };
    if (query.status) {
      where.status = query.status as any;
    }
    return this.prisma.companyEmail.findMany({
      where,
      orderBy: { date: 'desc' },
    });
  }

  async getStats(id: string) {
    await this.assertExists(id);
    const [activeCount, totalCount, distinctCounts, lastAssignment] = await Promise.all([
      this.prisma.assignment.count({
        where: { companyId: id, status: { in: ACTIVE_ASSIGNMENT_STATUSES } },
      }),
      this.prisma.assignment.count({ where: { companyId: id } }),
      this.fetchDistinctCounts([id]),
      this.prisma.assignment.findFirst({
        where: { companyId: id },
        orderBy: { workDate: 'desc' },
        select: { workDate: true },
      }),
    ]);
    const counts = distinctCounts.get(id) ?? { drivers: 0, vehicles: 0 };
    return {
      active_assignments: activeCount,
      total_assignments: totalCount,
      current_drivers: counts.drivers,
      current_vehicles: counts.vehicles,
      last_assignment_date: lastAssignment?.workDate.toISOString() ?? null,
    };
  }

  private async assertExists(id: string): Promise<void> {
    const exists = await this.prisma.company.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Company not found');
  }
}
