import {
  BadRequestException,
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
import { LocalStorageService } from '../storage/local-storage.service';
import {
  computeFuelConsumptionIntervals,
  computeWeightedAverageLitersPer100Km,
  type FuelConsumptionInterval,
} from './core/fleet-fuel-consumption.util';
import {
  buildDriverFuelBreakdown,
  buildWeeklyFuelTrend,
  type DriverFuelBreakdown,
  type WeeklyFuelTrendPoint,
} from './core/fleet-fuel-analytics.util';
import {
  aggregateEstimatedLiters,
  estimateTripLiters,
} from './core/fleet-fuel-estimation.util';
import { FLEET_TRIP_PROCESSING_CONFIG } from './core/fleet-trip-processing.config';
import type { CreateFuelEntryDto } from './dto/create-fuel-entry.dto';
import type { CreateFuelEntryOfficeDto } from './dto/create-fuel-entry-office.dto';
import type { FleetFuelOverviewQueryDto } from './dto/fleet-fuel-overview.query';
import type { FuelAnalyticsQueryDto } from './dto/fuel-analytics.query';
import type { ListFuelEntriesQueryDto } from './dto/list-fuel-entries.query';

const TRACKABLE_ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  AssignmentStatus.planned,
  AssignmentStatus.confirmed,
  AssignmentStatus.in_progress,
];

export type FleetFuelEntrySummary = {
  id: string;
  vehicleId: string;
  driverId: string;
  enteredAt: string;
  liters: number;
  totalCost: number;
  currency: string;
  odometerKm: number | null;
  isFullTank: boolean;
  hasReceipt: boolean;
  createdAt: string;
  updatedAt: string;
  vehiclePlate?: string;
  driverName?: string;
};

export type FleetFuelEntryDetail = FleetFuelEntrySummary & {
  vehiclePlate: string;
  driverName: string;
  previousEntryAt: string | null;
  previousOdometerKm: number | null;
};

export type FleetFuelAnalyticsResponse = {
  vehicleId: string;
  from: string | null;
  to: string | null;
  avgConsumptionLPer100Km: number;
  intervals: FuelConsumptionInterval[];
  avgLitersPer100Km: number | null;
  avgEstimatedLitersPer100Km: number | null;
  totalLiters: number;
  totalEstimatedLiters: number;
  totalCost: number;
  totalDistanceKm: number;
  tripDistanceKm: number;
  estimatedVsRealDeltaLiters: number | null;
  weeklyTrend: WeeklyFuelTrendPoint[];
  driverBreakdown: DriverFuelBreakdown[];
  entries: FleetFuelEntrySummary[];
};

export type FleetFuelOverviewVehicleSummary = {
  vehicleId: string;
  plateNumber: string;
  avgLitersPer100Km: number | null;
  avgEstimatedLitersPer100Km: number | null;
  totalLiters: number;
  totalEstimatedLiters: number;
  tripDistanceKm: number;
  totalCost: number;
};

export type FleetFuelOverviewResponse = {
  from: string | null;
  to: string | null;
  vehicles: FleetFuelOverviewVehicleSummary[];
  totals: {
    totalLiters: number;
    totalEstimatedLiters: number;
    tripDistanceKm: number;
    totalCost: number;
    avgLitersPer100Km: number | null;
    avgEstimatedLitersPer100Km: number | null;
  };
};

@Injectable()
export class FleetFuelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LocalStorageService,
  ) {}

  async createFuelEntryForDriver(
    userId: string,
    dto: CreateFuelEntryDto,
    receipt?: { originalname: string; filename: string; mimetype: string },
  ): Promise<FleetFuelEntrySummary> {
    const driver = await this.requireDriverForUser(userId);
    await this.assertDriverAssignedToVehicle(driver.id, dto.vehicleId);

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: dto.vehicleId },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const enteredAt = dto.enteredAt ? new Date(dto.enteredAt) : new Date();
    const entry = await this.prisma.$transaction(async (tx) => {
      const created = await tx.fleetFuelEntry.create({
        data: {
          vehicleId: dto.vehicleId,
          driverId: driver.id,
          enteredAt,
          liters: new Prisma.Decimal(dto.liters),
          totalCost: new Prisma.Decimal(dto.totalCost),
          currency: dto.currency?.trim().toUpperCase() || 'EUR',
          odometerKm:
            dto.odometerKm != null ? new Prisma.Decimal(dto.odometerKm) : null,
          isFullTank: dto.isFullTank ?? false,
          receiptStoredPath: receipt
            ? this.storage.buildStoredPath('documents', receipt.filename)
            : null,
          receiptMimeType: receipt?.mimetype ?? null,
        },
      });

      if (dto.odometerKm != null) {
        await tx.vehicle.update({
          where: { id: dto.vehicleId },
          data: {
            odometerCorrectedKm: new Prisma.Decimal(dto.odometerKm),
            odometerCorrectedAt: enteredAt,
          },
        });
      }

      return created;
    });

    return this.serializeFuelEntry(entry);
  }

  async listFuelEntries(query: ListFuelEntriesQueryDto): Promise<FleetFuelEntrySummary[]> {
    const entries = await this.prisma.fleetFuelEntry.findMany({
      where: this.buildListWhere(query),
      orderBy: { enteredAt: 'desc' },
      take: 500,
      include: {
        vehicle: { select: { plateNumber: true } },
        driver: { select: { firstName: true, lastName: true } },
      },
    });

    return entries.map((entry) => ({
      ...this.serializeFuelEntry(entry),
      vehiclePlate: entry.vehicle.plateNumber,
      driverName: `${entry.driver.firstName} ${entry.driver.lastName}`.trim(),
    }));
  }

  async getFuelEntryById(id: string): Promise<FleetFuelEntryDetail> {
    const entry = await this.prisma.fleetFuelEntry.findFirst({
      where: { id },
      include: {
        vehicle: { select: { plateNumber: true } },
        driver: { select: { firstName: true, lastName: true } },
      },
    });
    if (!entry) {
      throw new NotFoundException('Fuel entry not found');
    }

    const previous = await this.prisma.fleetFuelEntry.findFirst({
      where: {
        vehicleId: entry.vehicleId,
        enteredAt: { lt: entry.enteredAt },
      },
      orderBy: { enteredAt: 'desc' },
      select: { enteredAt: true, odometerKm: true },
    });

    return {
      ...this.serializeFuelEntry(entry),
      vehiclePlate: entry.vehicle.plateNumber,
      driverName: `${entry.driver.firstName} ${entry.driver.lastName}`.trim(),
      previousEntryAt: previous ? previous.enteredAt.toISOString() : null,
      previousOdometerKm:
        previous?.odometerKm != null ? Number(previous.odometerKm) : null,
    };
  }

  async createFuelEntry(dto: CreateFuelEntryOfficeDto): Promise<FleetFuelEntrySummary> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: dto.vehicleId },
      select: { id: true, currentDriverId: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const driverId = dto.driverId ?? vehicle.currentDriverId;
    if (!driverId) {
      throw new BadRequestException(
        'driverId is required when the vehicle has no assigned driver',
      );
    }

    const driver = await this.prisma.driver.findFirst({
      where: { id: driverId },
      select: { id: true },
    });
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const enteredAt = dto.enteredAt ? new Date(dto.enteredAt) : new Date();
    const entry = await this.prisma.$transaction(async (tx) => {
      const created = await tx.fleetFuelEntry.create({
        data: {
          vehicleId: dto.vehicleId,
          driverId,
          enteredAt,
          liters: new Prisma.Decimal(dto.liters),
          totalCost: new Prisma.Decimal(dto.totalCost),
          currency: dto.currency?.trim().toUpperCase() || 'EUR',
          odometerKm:
            dto.odometerKm != null ? new Prisma.Decimal(dto.odometerKm) : null,
          isFullTank: dto.isFullTank ?? false,
        },
      });

      if (dto.odometerKm != null) {
        await tx.vehicle.update({
          where: { id: dto.vehicleId },
          data: {
            odometerCorrectedKm: new Prisma.Decimal(dto.odometerKm),
            odometerCorrectedAt: enteredAt,
          },
        });
      }

      return created;
    });

    return this.serializeFuelEntry(entry);
  }

  async listFuelEntriesForDriver(
    userId: string,
    query: ListFuelEntriesQueryDto,
  ): Promise<FleetFuelEntrySummary[]> {
    const driver = await this.requireDriverForUser(userId);
    return this.listFuelEntries({ ...query, driverId: driver.id });
  }

  async getVehicleFuelAnalytics(
    vehicleId: string,
    query: FuelAnalyticsQueryDto,
  ): Promise<FleetFuelAnalyticsResponse> {
    await this.assertVehicleExists(vehicleId);
    return this.buildVehicleFuelAnalytics(vehicleId, query);
  }

  async getVehicleFuelAnalyticsForDriver(
    userId: string,
    vehicleId: string,
    query: FuelAnalyticsQueryDto,
  ): Promise<FleetFuelAnalyticsResponse> {
    const driver = await this.requireDriverForUser(userId);
    await this.assertDriverAssignedToVehicle(driver.id, vehicleId);
    return this.buildVehicleFuelAnalytics(vehicleId, query);
  }

  async getFleetFuelOverview(
    query: FleetFuelOverviewQueryDto,
  ): Promise<FleetFuelOverviewResponse> {
    const vehicleIds = await this.resolveOverviewVehicleIds(query);
    const vehicles = await Promise.all(
      vehicleIds.map(async (vehicleId) => {
        const analytics = await this.buildVehicleFuelAnalytics(vehicleId, query);
        const vehicle = await this.prisma.vehicle.findFirst({
          where: { id: vehicleId },
          select: { plateNumber: true },
        });
        return {
          vehicleId,
          plateNumber: vehicle?.plateNumber ?? vehicleId,
          avgLitersPer100Km: analytics.avgLitersPer100Km,
          avgEstimatedLitersPer100Km: analytics.avgEstimatedLitersPer100Km,
          totalLiters: analytics.totalLiters,
          totalEstimatedLiters: analytics.totalEstimatedLiters,
          tripDistanceKm: analytics.tripDistanceKm,
          totalCost: analytics.totalCost,
        } satisfies FleetFuelOverviewVehicleSummary;
      }),
    );

    const totalLiters = round(
      vehicles.reduce((sum, vehicle) => sum + vehicle.totalLiters, 0),
      3,
    );
    const totalEstimatedLiters = round(
      vehicles.reduce((sum, vehicle) => sum + vehicle.totalEstimatedLiters, 0),
      3,
    );
    const tripDistanceKm = round(
      vehicles.reduce((sum, vehicle) => sum + vehicle.tripDistanceKm, 0),
      3,
    );
    const totalCost = round(
      vehicles.reduce((sum, vehicle) => sum + vehicle.totalCost, 0),
      2,
    );

    return {
      from: query.from ?? null,
      to: query.to ?? null,
      vehicles,
      totals: {
        totalLiters,
        totalEstimatedLiters,
        tripDistanceKm,
        totalCost,
        avgLitersPer100Km:
          tripDistanceKm > 0 && totalLiters > 0
            ? round((totalLiters / tripDistanceKm) * 100, 2)
            : null,
        avgEstimatedLitersPer100Km:
          tripDistanceKm > 0 && totalEstimatedLiters > 0
            ? round((totalEstimatedLiters / tripDistanceKm) * 100, 2)
            : null,
      },
    };
  }

  private async resolveOverviewVehicleIds(query: FleetFuelOverviewQueryDto): Promise<string[]> {
    if (query.vehicleId) {
      await this.assertVehicleExists(query.vehicleId);
      return [query.vehicleId];
    }

    const startedAt = query.from || query.to ? this.buildDateFilter(query.from, query.to) : undefined;
    const [tripVehicles, fuelVehicles] = await Promise.all([
      this.prisma.fleetTrip.findMany({
        where: {
          status: FleetTripStatus.closed,
          ...(startedAt ? { startedAt } : {}),
        },
        select: { vehicleId: true },
        distinct: ['vehicleId'],
        take: 500,
      }),
      this.prisma.fleetFuelEntry.findMany({
        where: this.buildListWhere({ from: query.from, to: query.to }),
        select: { vehicleId: true },
        distinct: ['vehicleId'],
        take: 500,
      }),
    ]);

    return [...new Set([...tripVehicles, ...fuelVehicles].map((row) => row.vehicleId))];
  }

  private async buildVehicleFuelAnalytics(
    vehicleId: string,
    query: FuelAnalyticsQueryDto,
  ): Promise<FleetFuelAnalyticsResponse> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId },
      select: {
        id: true,
        avgConsumptionLPer100Km: true,
      },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const avgConsumptionLPer100Km =
      vehicle.avgConsumptionLPer100Km != null
        ? Number(vehicle.avgConsumptionLPer100Km)
        : FLEET_TRIP_PROCESSING_CONFIG.defaultAvgConsumptionLPer100Km;

    const listQuery: ListFuelEntriesQueryDto = {
      vehicleId,
      from: query.from,
      to: query.to,
    };
    const entries = await this.prisma.fleetFuelEntry.findMany({
      where: this.buildListWhere(listQuery),
      orderBy: { enteredAt: 'asc' },
      take: 1000,
    });

    const trips = await this.prisma.fleetTrip.findMany({
      where: {
        vehicleId,
        status: FleetTripStatus.closed,
        ...(query.from || query.to
          ? {
              startedAt: this.buildDateFilter(query.from, query.to),
            }
          : {}),
      },
      select: {
        id: true,
        driverId: true,
        startedAt: true,
        endedAt: true,
        distanceKm: true,
        durationS: true,
        idleS: true,
        _count: {
          select: {
            drivingEvents: true,
          },
        },
      },
      orderBy: { startedAt: 'asc' },
      take: 5000,
    });

    const consumptionEntries = entries.map((entry) => ({
      id: entry.id,
      enteredAt: entry.enteredAt,
      liters: Number(entry.liters),
      totalCost: Number(entry.totalCost),
      odometerKm: entry.odometerKm != null ? Number(entry.odometerKm) : null,
      isFullTank: entry.isFullTank,
    }));

    const tripSlices = trips.map((trip) => ({
      startedAt: trip.startedAt,
      endedAt: trip.endedAt,
      distanceKm: trip.distanceKm != null ? Number(trip.distanceKm) : null,
    }));

    const tripEstimates = trips
      .map((trip) => {
        const distanceKm = trip.distanceKm != null ? Number(trip.distanceKm) : 0;
        if (distanceKm <= 0) {
          return null;
        }

        const estimateInput = {
          distanceKm,
          durationS: trip.durationS ?? 0,
          idleS: trip.idleS ?? 0,
          eventCount: trip._count.drivingEvents,
        };

        return {
          driverId: trip.driverId,
          startedAt: trip.startedAt,
          distanceKm,
          estimatedLiters: estimateTripLiters(estimateInput, avgConsumptionLPer100Km),
          eventCount: trip._count.drivingEvents,
          estimateInput,
        };
      })
      .filter((trip): trip is NonNullable<typeof trip> => trip != null);

    const estimation = aggregateEstimatedLiters(
      tripEstimates.map((trip) => trip.estimateInput),
      avgConsumptionLPer100Km,
    );

    const intervals = computeFuelConsumptionIntervals(consumptionEntries, tripSlices);
    const avgLitersPer100Km = computeWeightedAverageLitersPer100Km(intervals);
    const weeklyTrend = buildWeeklyFuelTrend(intervals, tripEstimates);
    const driverBreakdown = buildDriverFuelBreakdown(
      tripEstimates,
      entries.map((entry) => ({
        driverId: entry.driverId,
        enteredAt: entry.enteredAt,
        liters: Number(entry.liters),
      })),
    );

    const totalLiters = round(
      consumptionEntries.reduce((sum, entry) => sum + entry.liters, 0),
      3,
    );

    return {
      vehicleId,
      from: query.from ?? null,
      to: query.to ?? null,
      avgConsumptionLPer100Km,
      intervals,
      avgLitersPer100Km,
      avgEstimatedLitersPer100Km: estimation.avgEstimatedLitersPer100Km,
      totalLiters,
      totalEstimatedLiters: estimation.totalEstimatedLiters,
      totalCost: round(
        consumptionEntries.reduce((sum, entry) => sum + entry.totalCost, 0),
        2,
      ),
      totalDistanceKm: round(
        intervals.reduce((sum, interval) => sum + interval.distanceKm, 0),
        3,
      ),
      tripDistanceKm: estimation.totalDistanceKm,
      estimatedVsRealDeltaLiters:
        totalLiters > 0
          ? round(estimation.totalEstimatedLiters - totalLiters, 3)
          : null,
      weeklyTrend,
      driverBreakdown,
      entries: entries
        .slice()
        .reverse()
        .map((entry) => this.serializeFuelEntry(entry)),
    };
  }

  private buildListWhere(query: ListFuelEntriesQueryDto): Prisma.FleetFuelEntryWhereInput {
    const where: Prisma.FleetFuelEntryWhereInput = {};

    if (query.vehicleId) {
      where.vehicleId = query.vehicleId;
    }
    if (query.driverId) {
      where.driverId = query.driverId;
    }
    if (query.from || query.to) {
      where.enteredAt = this.buildDateFilter(query.from, query.to);
    }

    return where;
  }

  private buildDateFilter(from?: string, to?: string): Prisma.DateTimeFilter {
    const enteredAt: Prisma.DateTimeFilter = {};
    if (from) {
      enteredAt.gte = new Date(from);
    }
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      enteredAt.lte = end;
    }
    return enteredAt;
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

  private serializeFuelEntry(entry: {
    id: string;
    vehicleId: string;
    driverId: string;
    enteredAt: Date;
    liters: Prisma.Decimal;
    totalCost: Prisma.Decimal;
    currency: string;
    odometerKm: Prisma.Decimal | null;
    isFullTank: boolean;
    receiptStoredPath: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): FleetFuelEntrySummary {
    return {
      id: entry.id,
      vehicleId: entry.vehicleId,
      driverId: entry.driverId,
      enteredAt: entry.enteredAt.toISOString(),
      liters: Number(entry.liters),
      totalCost: Number(entry.totalCost),
      currency: entry.currency,
      odometerKm: entry.odometerKm != null ? Number(entry.odometerKm) : null,
      isFullTank: entry.isFullTank,
      hasReceipt: Boolean(entry.receiptStoredPath),
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    };
  }
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
