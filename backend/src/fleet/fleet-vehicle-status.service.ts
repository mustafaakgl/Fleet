import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssignmentStatus,
  FleetTripStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  computeMaintenanceRuleStatus,
  type MaintenanceRuleStatusView,
} from './core/fleet-maintenance.util';
import { computeCurrentOdometerKm } from './core/fleet-odometer.util';
import type { OdometerCorrectionDto } from './dto/odometer-correction.dto';

const TRACKABLE_ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  AssignmentStatus.planned,
  AssignmentStatus.confirmed,
  AssignmentStatus.in_progress,
];

export type FleetVehicleStatusResponse = {
  vehicleId: string;
  plateNumber: string;
  currentOdometerKm: number;
  gpsAccumulatedKm: number;
  baselineKm: number;
  baselineSource: 'correction' | 'initial' | 'none';
  odometerCorrectedAt: string | null;
  maintenanceRules: MaintenanceRuleStatusView[];
};

@Injectable()
export class FleetVehicleStatusService {
  constructor(private readonly prisma: PrismaService) {}

  async getVehicleStatus(vehicleId: string): Promise<FleetVehicleStatusResponse> {
    await this.assertVehicleExists(vehicleId);
    return this.buildVehicleStatus(vehicleId);
  }

  async getVehicleStatusForDriver(
    userId: string,
    vehicleId: string,
  ): Promise<FleetVehicleStatusResponse> {
    const driver = await this.requireDriverForUser(userId);
    await this.assertDriverAssignedToVehicle(driver.id, vehicleId);
    return this.buildVehicleStatus(vehicleId);
  }

  async applyOdometerCorrection(vehicleId: string, dto: OdometerCorrectionDto) {
    await this.assertVehicleExists(vehicleId);
    return this.saveOdometerCorrection(vehicleId, dto.odometerKm);
  }

  async applyOdometerCorrectionForDriver(
    userId: string,
    vehicleId: string,
    dto: OdometerCorrectionDto,
  ) {
    const driver = await this.requireDriverForUser(userId);
    await this.assertDriverAssignedToVehicle(driver.id, vehicleId);
    return this.saveOdometerCorrection(vehicleId, dto.odometerKm);
  }

  private async buildVehicleStatus(vehicleId: string): Promise<FleetVehicleStatusResponse> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId },
      select: {
        id: true,
        plateNumber: true,
        initialOdometerKm: true,
        odometerCorrectedKm: true,
        odometerCorrectedAt: true,
      },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const trips = await this.prisma.fleetTrip.findMany({
      where: {
        vehicleId,
        status: FleetTripStatus.closed,
      },
      select: {
        startedAt: true,
        endedAt: true,
        distanceKm: true,
      },
      orderBy: { startedAt: 'asc' },
      take: 5000,
    });

    const odometer = computeCurrentOdometerKm(
      {
        initialOdometerKm:
          vehicle.initialOdometerKm != null ? Number(vehicle.initialOdometerKm) : null,
        odometerCorrectedKm:
          vehicle.odometerCorrectedKm != null ? Number(vehicle.odometerCorrectedKm) : null,
        odometerCorrectedAt: vehicle.odometerCorrectedAt,
      },
      trips.map((trip) => ({
        startedAt: trip.startedAt,
        endedAt: trip.endedAt,
        distanceKm: trip.distanceKm != null ? Number(trip.distanceKm) : null,
      })),
    );

    const rules = await this.prisma.fleetMaintenanceRule.findMany({
      where: { vehicleId },
      orderBy: { name: 'asc' },
    });

    const maintenanceRules = rules.map((rule) =>
      computeMaintenanceRuleStatus(
        {
          id: rule.id,
          name: rule.name,
          intervalKm: rule.intervalKm != null ? Number(rule.intervalKm) : null,
          intervalDays: rule.intervalDays,
          lastDoneAtKm: rule.lastDoneAtKm != null ? Number(rule.lastDoneAtKm) : null,
          lastDoneAtDate: rule.lastDoneAtDate,
          createdAt: rule.createdAt,
        },
        odometer.currentOdometerKm,
      ),
    );

    return {
      vehicleId: vehicle.id,
      plateNumber: vehicle.plateNumber,
      currentOdometerKm: odometer.currentOdometerKm,
      gpsAccumulatedKm: odometer.gpsAccumulatedKm,
      baselineKm: odometer.baseline.baselineKm,
      baselineSource: odometer.baseline.source,
      odometerCorrectedAt: vehicle.odometerCorrectedAt?.toISOString() ?? null,
      maintenanceRules,
    };
  }

  private async saveOdometerCorrection(vehicleId: string, odometerKm: number) {
    const correctedAt = new Date();
    const vehicle = await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        odometerCorrectedKm: new Prisma.Decimal(odometerKm),
        odometerCorrectedAt: correctedAt,
      },
      select: {
        id: true,
        plateNumber: true,
        odometerCorrectedKm: true,
        odometerCorrectedAt: true,
      },
    });

    return {
      vehicleId: vehicle.id,
      plateNumber: vehicle.plateNumber,
      odometerCorrectedKm: Number(vehicle.odometerCorrectedKm),
      odometerCorrectedAt: vehicle.odometerCorrectedAt?.toISOString() ?? null,
    };
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

  private async requireDriverForUser(userId: string) {
    const driver = await this.prisma.driver.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (!driver) {
      throw new ForbiddenException('No driver profile linked to this user');
    }
    return driver;
  }

  private async assertDriverAssignedToVehicle(driverId: string, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId },
      select: { id: true, currentDriverId: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    if (vehicle.currentDriverId === driverId) {
      return;
    }

    const { start, end } = this.todayRange();
    const assignments = await this.prisma.assignment.findMany({
      where: {
        driverId,
        vehicleId,
        workDate: { gte: start, lt: end },
        status: { in: TRACKABLE_ASSIGNMENT_STATUSES },
      },
      select: { id: true },
      take: 1,
    });

    if (assignments.length === 0) {
      throw new ForbiddenException('Driver is not assigned to this vehicle today');
    }
  }

  private todayRange(): { start: Date; end: Date } {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }
}
