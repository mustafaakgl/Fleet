import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  computeMaintenanceRuleStatus,
  type MaintenanceRuleStatusView,
} from './core/fleet-maintenance.util';
import type { CreateMaintenanceRuleDto } from './dto/create-maintenance-rule.dto';
import type { UpdateMaintenanceRuleDto } from './dto/update-maintenance-rule.dto';
import { FleetVehicleStatusService } from './fleet-vehicle-status.service';

export type FleetMaintenanceRuleSummary = {
  id: string;
  vehicleId: string;
  name: string;
  intervalKm: number | null;
  intervalDays: number | null;
  lastDoneAtKm: number | null;
  lastDoneAtDate: string | null;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class FleetMaintenanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vehicleStatus: FleetVehicleStatusService,
  ) {}

  async listVehicleMaintenance(vehicleId: string): Promise<MaintenanceRuleStatusView[]> {
    const status = await this.vehicleStatus.getVehicleStatus(vehicleId);
    return status.maintenanceRules;
  }

  async createRule(dto: CreateMaintenanceRuleDto): Promise<FleetMaintenanceRuleSummary> {
    if (dto.intervalKm == null && dto.intervalDays == null) {
      throw new BadRequestException('At least one of intervalKm or intervalDays is required');
    }

    await this.assertVehicleExists(dto.vehicleId);

    const rule = await this.prisma.fleetMaintenanceRule.create({
      data: {
        vehicleId: dto.vehicleId,
        name: dto.name.trim(),
        intervalKm: dto.intervalKm != null ? new Prisma.Decimal(dto.intervalKm) : null,
        intervalDays: dto.intervalDays ?? null,
      },
    });

    return this.serializeRule(rule);
  }

  async updateRule(ruleId: string, dto: UpdateMaintenanceRuleDto): Promise<FleetMaintenanceRuleSummary> {
    const existing = await this.prisma.fleetMaintenanceRule.findFirst({
      where: { id: ruleId },
    });
    if (!existing) {
      throw new NotFoundException('Maintenance rule not found');
    }

    const rule = await this.prisma.fleetMaintenanceRule.update({
      where: { id: ruleId },
      data: {
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.intervalKm !== undefined
          ? {
              intervalKm:
                dto.intervalKm != null ? new Prisma.Decimal(dto.intervalKm) : null,
            }
          : {}),
        ...(dto.intervalDays !== undefined ? { intervalDays: dto.intervalDays } : {}),
        ...(dto.lastDoneAtKm !== undefined
          ? {
              lastDoneAtKm:
                dto.lastDoneAtKm != null ? new Prisma.Decimal(dto.lastDoneAtKm) : null,
            }
          : {}),
        ...(dto.lastDoneAtDate !== undefined
          ? {
              lastDoneAtDate: dto.lastDoneAtDate ? new Date(dto.lastDoneAtDate) : null,
            }
          : {}),
      },
    });

    return this.serializeRule(rule);
  }

  async markRuleDone(ruleId: string): Promise<MaintenanceRuleStatusView> {
    const existing = await this.prisma.fleetMaintenanceRule.findFirst({
      where: { id: ruleId },
    });
    if (!existing) {
      throw new NotFoundException('Maintenance rule not found');
    }

    const status = await this.vehicleStatus.getVehicleStatus(existing.vehicleId);
    const today = new Date().toISOString().slice(0, 10);

    const rule = await this.prisma.fleetMaintenanceRule.update({
      where: { id: ruleId },
      data: {
        lastDoneAtKm: new Prisma.Decimal(status.currentOdometerKm),
        lastDoneAtDate: new Date(today),
      },
    });

    return computeMaintenanceRuleStatus(
      {
        id: rule.id,
        name: rule.name,
        intervalKm: rule.intervalKm != null ? Number(rule.intervalKm) : null,
        intervalDays: rule.intervalDays,
        lastDoneAtKm: rule.lastDoneAtKm != null ? Number(rule.lastDoneAtKm) : null,
        lastDoneAtDate: rule.lastDoneAtDate,
        createdAt: rule.createdAt,
      },
      status.currentOdometerKm,
    );
  }

  async deleteRule(ruleId: string): Promise<{ deleted: true }> {
    const existing = await this.prisma.fleetMaintenanceRule.findFirst({
      where: { id: ruleId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Maintenance rule not found');
    }

    await this.prisma.fleetMaintenanceRule.delete({ where: { id: ruleId } });
    return { deleted: true };
  }

  private async assertVehicleExists(vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }
  }

  private serializeRule(rule: {
    id: string;
    vehicleId: string;
    name: string;
    intervalKm: Prisma.Decimal | null;
    intervalDays: number | null;
    lastDoneAtKm: Prisma.Decimal | null;
    lastDoneAtDate: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): FleetMaintenanceRuleSummary {
    return {
      id: rule.id,
      vehicleId: rule.vehicleId,
      name: rule.name,
      intervalKm: rule.intervalKm != null ? Number(rule.intervalKm) : null,
      intervalDays: rule.intervalDays,
      lastDoneAtKm: rule.lastDoneAtKm != null ? Number(rule.lastDoneAtKm) : null,
      lastDoneAtDate: rule.lastDoneAtDate?.toISOString().slice(0, 10) ?? null,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    };
  }
}
