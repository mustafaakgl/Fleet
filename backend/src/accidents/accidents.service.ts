import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccidentDto } from './dto/create-accident.dto';
import { UpdateAccidentDto } from './dto/update-accident.dto';

type IncidentType = 'vehicle_accident' | 'cargo_damage';
type IncidentStatus = 'reported' | 'under_review' | 'resolved' | 'rejected';
type RiskLevel = 'green' | 'yellow' | 'red';

const INCIDENT_TYPES: IncidentType[] = ['vehicle_accident', 'cargo_damage'];
const INCIDENT_STATUSES: IncidentStatus[] = ['reported', 'under_review', 'resolved', 'rejected'];

@Injectable()
export class AccidentsService {
  constructor(private readonly prisma: PrismaService) {}

  private parseIncidentDateTime(value: string): Date {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Invalid incidentDateTime');
    }
    return parsed;
  }

  private ensureIncidentType(value: string): IncidentType {
    if (!INCIDENT_TYPES.includes(value as IncidentType)) {
      throw new BadRequestException('Invalid incident type');
    }

    return value as IncidentType;
  }

  private ensureIncidentStatus(value: string): IncidentStatus {
    if (!INCIDENT_STATUSES.includes(value as IncidentStatus)) {
      throw new BadRequestException('Invalid incident status');
    }

    return value as IncidentStatus;
  }

  private async ensureDriverExists(driverId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      select: { id: true },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }
  }

  private async ensureVehicleExists(vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }
  }

  private async ensureCompanyExists(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }
  }

  private async ensureAssignmentExists(assignmentId: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      select: { id: true },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }
  }

  private mapAccidentCountToRiskLevel(accidentCount: number): RiskLevel {
    if (accidentCount >= 3) {
      return 'red';
    }

    if (accidentCount === 2) {
      return 'yellow';
    }

    return 'green';
  }

  async createIncident(data: CreateAccidentDto) {
    if (!data.description || data.description.trim() === '') {
      throw new BadRequestException('description is required');
    }

    await this.ensureDriverExists(data.driverId);
    await this.ensureVehicleExists(data.vehicleId);

    if (data.companyId) {
      await this.ensureCompanyExists(data.companyId);
    }

    if (data.assignmentId) {
      await this.ensureAssignmentExists(data.assignmentId);
    }

    const incidentDateTime = this.parseIncidentDateTime(data.incidentDateTime);
    const incidentType = this.ensureIncidentType(data.type);
    const incidentStatus = data.status ? this.ensureIncidentStatus(data.status) : 'reported';

    return this.prisma.$transaction(async (tx) => {
      const db = tx as any;

      const incident = await db.accident.create({
        data: {
          type: incidentType,
          driverId: data.driverId,
          vehicleId: data.vehicleId,
          companyId: data.companyId ?? null,
          assignmentId: data.assignmentId ?? null,
          incidentDateTime,
          location: data.location ?? null,
          description: data.description,
          cargoName: data.cargoName ?? null,
          cargoOwner: data.cargoOwner ?? null,
          damageValue: data.damageValue ?? null,
          status: incidentStatus,
        },
        include: {
          driver: true,
          vehicle: true,
          company: true,
          assignment: true,
        },
      });

      await this.recalculateDriverRisk(data.driverId, tx);

      return incident;
    });
  }

  async listIncidents(filters: {
    type?: string;
    driverId?: string;
    vehicleId?: string;
    companyId?: string;
    assignmentId?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const where: Record<string, unknown> = {};

    if (filters.type) {
      where.type = this.ensureIncidentType(filters.type);
    }
    if (filters.driverId) {
      where.driverId = filters.driverId;
    }
    if (filters.vehicleId) {
      where.vehicleId = filters.vehicleId;
    }
    if (filters.companyId) {
      where.companyId = filters.companyId;
    }
    if (filters.assignmentId) {
      where.assignmentId = filters.assignmentId;
    }
    if (filters.status) {
      where.status = this.ensureIncidentStatus(filters.status);
    }
    if (filters.dateFrom || filters.dateTo) {
      const dateRange: Record<string, Date> = {};
      if (filters.dateFrom) {
        dateRange.gte = this.parseIncidentDateTime(filters.dateFrom);
      }
      if (filters.dateTo) {
        dateRange.lte = this.parseIncidentDateTime(filters.dateTo);
      }
      where.incidentDateTime = dateRange;
    }

    const db = this.prisma as any;
    return db.accident.findMany({
      where,
      include: {
        driver: true,
        vehicle: true,
        company: true,
        assignment: true,
      },
      orderBy: {
        incidentDateTime: 'desc',
      },
    });
  }

  async getIncidentById(id: string) {
    const db = this.prisma as any;
    const incident = await db.accident.findUnique({
      where: { id },
      include: {
        driver: true,
        vehicle: true,
        company: true,
        assignment: true,
      },
    });

    if (!incident) {
      throw new NotFoundException('Incident not found');
    }

    return incident;
  }

  async updateIncident(id: string, data: UpdateAccidentDto) {
    const existing = await this.getIncidentById(id);

    if (data.driverId !== undefined && data.driverId !== existing.driverId) {
      await this.ensureDriverExists(data.driverId);
    }

    if (data.vehicleId !== undefined && data.vehicleId !== existing.vehicleId) {
      await this.ensureVehicleExists(data.vehicleId);
    }

    if (data.companyId !== undefined && data.companyId !== null) {
      await this.ensureCompanyExists(data.companyId);
    }

    if (data.assignmentId !== undefined && data.assignmentId !== null) {
      await this.ensureAssignmentExists(data.assignmentId);
    }

    const payload: Record<string, unknown> = {};

    if (data.type !== undefined) payload.type = this.ensureIncidentType(data.type);
    if (data.driverId !== undefined) payload.driverId = data.driverId;
    if (data.vehicleId !== undefined) payload.vehicleId = data.vehicleId;
    if (data.companyId !== undefined) payload.companyId = data.companyId;
    if (data.assignmentId !== undefined) payload.assignmentId = data.assignmentId;
    if (data.location !== undefined) payload.location = data.location;
    if (data.description !== undefined) payload.description = data.description;
    if (data.cargoName !== undefined) payload.cargoName = data.cargoName;
    if (data.cargoOwner !== undefined) payload.cargoOwner = data.cargoOwner;
    if (data.damageValue !== undefined) payload.damageValue = data.damageValue;
    if (data.status !== undefined) payload.status = this.ensureIncidentStatus(data.status);

    if (data.incidentDateTime !== undefined) {
      payload.incidentDateTime = this.parseIncidentDateTime(data.incidentDateTime);
    }

    return this.prisma.$transaction(async (tx) => {
      const db = tx as any;

      const updated = await db.accident.update({
        where: { id },
        data: payload,
        include: {
          driver: true,
          vehicle: true,
          company: true,
          assignment: true,
        },
      });

      const affectedDriverIds = new Set<string>([existing.driverId, updated.driverId]);
      for (const driverId of affectedDriverIds) {
        await this.recalculateDriverRisk(driverId, tx);
      }

      return updated;
    });
  }

  async updateIncidentStatus(id: string, status: IncidentStatus) {
    const normalizedStatus = this.ensureIncidentStatus(status);
    const existing = await this.getIncidentById(id);

    return this.prisma.$transaction(async (tx) => {
      const db = tx as any;

      const updated = await db.accident.update({
        where: { id },
        data: { status: normalizedStatus },
        include: {
          driver: true,
          vehicle: true,
          company: true,
          assignment: true,
        },
      });

      await this.recalculateDriverRisk(updated.driverId, tx);
      if (existing.driverId !== updated.driverId) {
        await this.recalculateDriverRisk(existing.driverId, tx);
      }

      return updated;
    });
  }

  async getDriverIncidents(driverId: string) {
    await this.ensureDriverExists(driverId);

    const db = this.prisma as any;
    return db.accident.findMany({
      where: { driverId },
      include: {
        vehicle: true,
        company: true,
        assignment: true,
      },
      orderBy: {
        incidentDateTime: 'desc',
      },
    });
  }

  async getVehicleIncidents(vehicleId: string) {
    await this.ensureVehicleExists(vehicleId);

    const db = this.prisma as any;
    return db.accident.findMany({
      where: { vehicleId },
      include: {
        driver: true,
        company: true,
        assignment: true,
      },
      orderBy: {
        incidentDateTime: 'desc',
      },
    });
  }

  async getCompanyIncidents(companyId: string) {
    await this.ensureCompanyExists(companyId);

    const db = this.prisma as any;
    return db.accident.findMany({
      where: { companyId },
      include: {
        driver: true,
        vehicle: true,
        assignment: true,
      },
      orderBy: {
        incidentDateTime: 'desc',
      },
    });
  }

  async recalculateDriverRisk(driverId: string, tx?: unknown) {
    await this.ensureDriverExists(driverId);

    const db = (tx as any) ?? (this.prisma as any);

    const countedAccidents = await db.accident.count({
      where: {
        driverId,
        type: 'vehicle_accident',
        status: {
          not: 'rejected',
        },
      },
    });

    const riskLevel = this.mapAccidentCountToRiskLevel(countedAccidents);

    const driver = await db.driver.update({
      where: { id: driverId },
      data: {
        riskLevel,
      },
      select: {
        id: true,
        riskLevel: true,
      },
    });

    return {
      driverId: driver.id,
      riskLevel: driver.riskLevel,
      countedAccidents,
    };
  }
}
