import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FleetTripStatus,
  FuelEntryWorkflowStatus,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LocalStorageService } from '../storage/local-storage.service';
import { DriverVehicleService } from './driver-vehicle.service';
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

/** A refuel is flagged as expensive once it exceeds the period average by this margin. */
const FUEL_PRICE_TOLERANCE_PERCENT = 5;
/** A vehicle counts as over target once it burns this much more than its norm consumption. */
const FUEL_TARGET_TOLERANCE_PERCENT = 10;

export type FleetFuelEntrySummary = {
  id: string;
  vehicleId: string;
  driverId: string;
  enteredAt: string;
  /** Taslak fiste HENUZ BILINMIYOR — 0 degil null. */
  liters: number | null;
  /** YAKIT satirinin brut toplami; taslakta null. Fisin genel toplami DEGIL. */
  totalCost: number | null;
  currency: string;
  workflowStatus: FuelEntryWorkflowStatus;
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

export type FleetFuelAnalyticsVehicleRow = FleetFuelOverviewVehicleSummary & {
  brand: string;
  model: string;
  deltaLiters: number | null;
  deltaPercent: number | null;
  suspiciousEventCount: number;
  realDistanceKm: number;
  costPerKm: number | null;
  costPer100Km: number | null;
  targetLitersPer100Km: number;
  targetDeviationPercent: number | null;
};

export type FleetFuelAnalyticsDriverRow = DriverFuelBreakdown & {
  driverName: string;
  deltaLiters: number | null;
  deltaPercent: number | null;
};

export type FleetFuelPriceOutlier = {
  entryId: string;
  vehicleId: string;
  plateNumber: string;
  driverName: string;
  enteredAt: string;
  liters: number;
  totalCost: number;
  pricePerLiter: number;
  deviationPercent: number;
  excessCost: number;
};

export type FleetFuelAnalyticsSuspiciousEvent = {
  id: string;
  type: 'fuel_theft_suspected' | 'fuel_deviation';
  vehicleId: string;
  plateNumber: string;
  occurredAt: string;
  title: string;
  message: string;
};

export type FleetFuelAnalyticsCockpitResponse = {
  generatedAt: string;
  from: string | null;
  to: string | null;
  vehicleId: string | null;
  driverId: string | null;
  assumptions: {
    co2KgPerLiter: number;
    suspiciousDeltaPercent: number;
    priceTolerancePercent: number;
    targetTolerancePercent: number;
  };
  totals: {
    totalLiters: number;
    totalEstimatedLiters: number;
    tripDistanceKm: number;
    realDistanceKm: number;
    totalCost: number;
    avgLitersPer100Km: number | null;
    avgEstimatedLitersPer100Km: number | null;
    estimatedVsRealDeltaLiters: number | null;
    estimatedVsRealDeltaPercent: number | null;
    co2Kg: number;
    estimatedCo2Kg: number;
    averagePricePerLiter: number | null;
    minPricePerLiter: number | null;
    maxPricePerLiter: number | null;
    costPerKm: number | null;
    costPer100Km: number | null;
    aboveAveragePriceEntryCount: number;
    aboveAverageExcessCost: number;
    overTargetVehicleCount: number;
    ratedVehicleCount: number;
    averageTargetDeviationPercent: number | null;
    suspiciousEventCount: number;
  };
  vehicles: FleetFuelAnalyticsVehicleRow[];
  weeklyTrend: WeeklyFuelTrendPoint[];
  driverBreakdown: FleetFuelAnalyticsDriverRow[];
  priceOutliers: FleetFuelPriceOutlier[];
  suspiciousEvents: FleetFuelAnalyticsSuspiciousEvent[];
  entries: FleetFuelEntrySummary[];
};

@Injectable()
export class FleetFuelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LocalStorageService,
    private readonly driverVehicle: DriverVehicleService,
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
          // DOGRUDAN GIRIS UCU — davranis Faz 6'da BILINCLI olarak degismedi.
          // Yeni varsayilan `driver_review`; burada acikca `approved` yaziliyor
          // cunku bu uc fis inceleme akisinin parcasi DEGIL: degerler zaten
          // elle giriliyor ve kayit bugune kadar dogrudan raporlara giriyordu.
          // Varsayilana birakmak, calisan bir akisi sessizce raporlardan
          // dusururdu ve geri almanin yolu (muhasebe onay ekrani) Faz 7'de.
          workflowStatus: FuelEntryWorkflowStatus.approved,
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
      // Listeleme: bekleyen fisler de gorunur. Bu uc toplam maliyet
      // hesaplamiyor; her satir kendi durumunu tasiyor.
      where: this.buildListWhere(query, 'all_statuses'),
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

    // Bir onceki dolum: yalnizca ONAYLANMIS kayitlar. Bu deger ekranda
    // "onceki km" olarak gosteriliyor ve iki dolum arasi tuketim okumasinin
    // dayanagi; heniz onaylanmamis bir taslak araya girerse aralik yanlis
    // kapanir — ustelik taslakta kilometre cogu zaman hic yoktur.
    const previous = await this.prisma.fleetFuelEntry.findFirst({
      where: {
        vehicleId: entry.vehicleId,
        enteredAt: { lt: entry.enteredAt },
        workflowStatus: FuelEntryWorkflowStatus.approved,
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
          // OFIS GIRISI — kaydi zaten muhasebe/ofis olusturuyor, yani onay
          // adimi bu istegin kendisi. `driver_review`'da birakmak, ofisin
          // girdigi kaydi kendi onayini bekler halde tutardi.
          workflowStatus: FuelEntryWorkflowStatus.approved,
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

  async getFleetFuelAnalyticsCockpit(
    query: FleetFuelOverviewQueryDto,
  ): Promise<FleetFuelAnalyticsCockpitResponse> {
    const vehicleIds = await this.resolveOverviewVehicleIds(query);
    const rows = await Promise.all(
      vehicleIds.map(async (vehicleId) => {
        const analytics = await this.buildVehicleFuelAnalytics(vehicleId, query);
        const vehicle = await this.prisma.vehicle.findFirst({
          where: { id: vehicleId },
          select: { plateNumber: true, brand: true, model: true },
        });

        return {
          vehicleId,
          plateNumber: vehicle?.plateNumber ?? vehicleId,
          brand: vehicle?.brand ?? '—',
          model: vehicle?.model ?? '—',
          analytics,
        };
      }),
    );

    const suspiciousEventsRaw =
      vehicleIds.length > 0
        ? await this.prisma.notification.findMany({
            where: {
              type: NotificationType.fuel_theft_suspected,
              relatedEntityId: { in: vehicleIds },
              ...(query.from || query.to ? { createdAt: this.buildDateFilter(query.from, query.to) } : {}),
            },
            select: {
              id: true,
              relatedEntityId: true,
              createdAt: true,
              title: true,
              message: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 200,
          })
        : [];

    const driverIds = [...new Set(rows.flatMap((row) => row.analytics.driverBreakdown.map((driver) => driver.driverId)))];
    const driverNames = new Map<string, string>();
    if (driverIds.length > 0) {
      const drivers = await this.prisma.driver.findMany({
        where: { id: { in: driverIds } },
        select: { id: true, firstName: true, lastName: true },
      });
      for (const driver of drivers) {
        driverNames.set(driver.id, `${driver.firstName} ${driver.lastName}`.trim());
      }
    }

    const vehicles = rows
      .map((row) => {
        const deltaLiters =
          row.analytics.estimatedVsRealDeltaLiters != null
            ? round(row.analytics.estimatedVsRealDeltaLiters, 3)
            : null;
        const deltaPercent =
          row.analytics.totalLiters > 0 && deltaLiters != null
            ? round((deltaLiters / row.analytics.totalLiters) * 100, 2)
            : null;
        const suspiciousEventCount =
          suspiciousEventsRaw.filter((event) => event.relatedEntityId === row.vehicleId).length +
          (deltaPercent !== null && Math.abs(deltaPercent) >= 15 ? 1 : 0);
        const realDistanceKm = row.analytics.totalDistanceKm;
        const costDistanceKm = realDistanceKm > 0 ? realDistanceKm : row.analytics.tripDistanceKm;
        const costPerKm =
          costDistanceKm > 0 && row.analytics.totalCost > 0
            ? round(row.analytics.totalCost / costDistanceKm, 3)
            : null;
        const targetLitersPer100Km = row.analytics.avgConsumptionLPer100Km;
        const targetDeviationPercent =
          targetLitersPer100Km > 0 && row.analytics.avgLitersPer100Km != null
            ? round(
                ((row.analytics.avgLitersPer100Km - targetLitersPer100Km) / targetLitersPer100Km) * 100,
                2,
              )
            : null;

        return {
          vehicleId: row.vehicleId,
          plateNumber: row.plateNumber,
          brand: row.brand,
          model: row.model,
          avgLitersPer100Km: row.analytics.avgLitersPer100Km,
          avgEstimatedLitersPer100Km: row.analytics.avgEstimatedLitersPer100Km,
          totalLiters: row.analytics.totalLiters,
          totalEstimatedLiters: row.analytics.totalEstimatedLiters,
          tripDistanceKm: row.analytics.tripDistanceKm,
          totalCost: row.analytics.totalCost,
          deltaLiters,
          deltaPercent,
          suspiciousEventCount,
          realDistanceKm,
          costPerKm,
          costPer100Km: costPerKm != null ? round(costPerKm * 100, 2) : null,
          targetLitersPer100Km,
          targetDeviationPercent,
        } satisfies FleetFuelAnalyticsVehicleRow;
      })
      .sort((left, right) => {
        const leftDelta = Math.abs(left.deltaPercent ?? 0);
        const rightDelta = Math.abs(right.deltaPercent ?? 0);
        if (leftDelta !== rightDelta) return rightDelta - leftDelta;
        return right.totalCost - left.totalCost;
      });

    const driverBreakdownMap = new Map<string, FleetFuelAnalyticsDriverRow>();
    for (const row of rows) {
      for (const driver of row.analytics.driverBreakdown) {
        const driverName = driverNames.get(driver.driverId) ?? driver.driverId;
        const deltaLiters = round(driver.estimatedLiters - driver.realLiters, 3);
        const deltaPercent =
          driver.realLiters > 0 ? round((deltaLiters / driver.realLiters) * 100, 2) : null;
        const existing = driverBreakdownMap.get(driver.driverId);

        if (!existing) {
          driverBreakdownMap.set(driver.driverId, {
            ...driver,
            driverName,
            deltaLiters,
            deltaPercent,
          });
          continue;
        }

        const tripDistanceKm = round(existing.tripDistanceKm + driver.tripDistanceKm, 3);
        const realLiters = round(existing.realLiters + driver.realLiters, 3);
        const realCost = round(existing.realCost + driver.realCost, 2);
        const estimatedLiters = round(existing.estimatedLiters + driver.estimatedLiters, 3);
        const eventCount = existing.eventCount + driver.eventCount;

        driverBreakdownMap.set(driver.driverId, {
          ...existing,
          driverName,
          tripDistanceKm,
          realLiters,
          realCost,
          estimatedLiters,
          eventCount,
          realLitersPer100Km:
            tripDistanceKm > 0 && realLiters > 0 ? round((realLiters / tripDistanceKm) * 100, 2) : null,
          estimatedLitersPer100Km:
            tripDistanceKm > 0 && estimatedLiters > 0
              ? round((estimatedLiters / tripDistanceKm) * 100, 2)
              : null,
          costPer100Km:
            tripDistanceKm > 0 && realCost > 0 ? round((realCost / tripDistanceKm) * 100, 2) : null,
          deltaLiters: round(estimatedLiters - realLiters, 3),
          deltaPercent: realLiters > 0 ? round(((estimatedLiters - realLiters) / realLiters) * 100, 2) : null,
        });
      }
    }

    const weeklyTrendMap = new Map<string, WeeklyFuelTrendPoint>();
    for (const row of rows) {
      for (const point of row.analytics.weeklyTrend) {
        const bucket = weeklyTrendMap.get(point.weekStart) ?? {
          weekStart: point.weekStart,
          tripDistanceKm: 0,
          realDistanceKm: 0,
          realLiters: 0,
          estimatedLiters: 0,
          realLitersPer100Km: null,
          estimatedLitersPer100Km: null,
          realCost: 0,
          entryLiters: 0,
          entryCost: 0,
          costPer100Km: null,
          averagePricePerLiter: null,
        };
        bucket.tripDistanceKm += point.tripDistanceKm;
        bucket.realDistanceKm += point.realDistanceKm;
        bucket.realLiters += point.realLiters;
        bucket.estimatedLiters += point.estimatedLiters;
        bucket.realCost += point.realCost;
        bucket.entryLiters += point.entryLiters;
        bucket.entryCost += point.entryCost;
        weeklyTrendMap.set(point.weekStart, bucket);
      }
    }

    const weeklyTrend = [...weeklyTrendMap.values()]
      .map((point) => ({
        ...point,
        tripDistanceKm: round(point.tripDistanceKm, 3),
        realDistanceKm: round(point.realDistanceKm, 3),
        realLiters: round(point.realLiters, 3),
        estimatedLiters: round(point.estimatedLiters, 3),
        realCost: round(point.realCost, 2),
        entryLiters: round(point.entryLiters, 3),
        entryCost: round(point.entryCost, 2),
        realLitersPer100Km:
          point.realDistanceKm > 0 && point.realLiters > 0
            ? round((point.realLiters / point.realDistanceKm) * 100, 2)
            : null,
        estimatedLitersPer100Km:
          point.tripDistanceKm > 0 && point.estimatedLiters > 0
            ? round((point.estimatedLiters / point.tripDistanceKm) * 100, 2)
            : null,
        costPer100Km:
          point.realDistanceKm > 0 && point.realCost > 0
            ? round((point.realCost / point.realDistanceKm) * 100, 2)
            : null,
        averagePricePerLiter:
          point.entryLiters > 0 && point.entryCost > 0
            ? round(point.entryCost / point.entryLiters, 3)
            : null,
      }))
      .sort((left, right) => left.weekStart.localeCompare(right.weekStart));

    const entries = await this.prisma.fleetFuelEntry.findMany({
      where: this.buildListWhere(query),
      orderBy: { enteredAt: 'desc' },
      take: 200,
      include: {
        vehicle: { select: { plateNumber: true } },
        driver: { select: { firstName: true, lastName: true } },
      },
    });

    const totalLiters = round(rows.reduce((sum, row) => sum + row.analytics.totalLiters, 0), 3);
    const totalEstimatedLiters = round(
      rows.reduce((sum, row) => sum + row.analytics.totalEstimatedLiters, 0),
      3,
    );
    const tripDistanceKm = round(rows.reduce((sum, row) => sum + row.analytics.tripDistanceKm, 0), 3);
    const realDistanceKm = round(rows.reduce((sum, row) => sum + row.analytics.totalDistanceKm, 0), 3);
    const totalCost = round(rows.reduce((sum, row) => sum + row.analytics.totalCost, 0), 2);
    const estimatedVsRealDeltaLiters = round(totalEstimatedLiters - totalLiters, 3);
    const costDistanceKm = realDistanceKm > 0 ? realDistanceKm : tripDistanceKm;
    const costPerKm = costDistanceKm > 0 && totalCost > 0 ? round(totalCost / costDistanceKm, 3) : null;
    const averagePricePerLiter = totalLiters > 0 ? round(totalCost / totalLiters, 3) : null;

    const entryPrices = entries
      .map((entry) => {
        const liters = Number(entry.liters);
        const cost = Number(entry.totalCost);
        if (liters <= 0 || cost <= 0) {
          return null;
        }
        return { entry, liters, cost, pricePerLiter: cost / liters };
      })
      .filter((row): row is NonNullable<typeof row> => row != null);

    const priceOutliers: FleetFuelPriceOutlier[] =
      averagePricePerLiter != null
        ? entryPrices
            .filter(
              (row) =>
                row.pricePerLiter >=
                averagePricePerLiter * (1 + FUEL_PRICE_TOLERANCE_PERCENT / 100),
            )
            .map((row) => ({
              entryId: row.entry.id,
              vehicleId: row.entry.vehicleId,
              plateNumber: row.entry.vehicle.plateNumber,
              driverName: `${row.entry.driver.firstName} ${row.entry.driver.lastName}`.trim(),
              enteredAt: row.entry.enteredAt.toISOString(),
              liters: round(row.liters, 2),
              totalCost: round(row.cost, 2),
              pricePerLiter: round(row.pricePerLiter, 3),
              deviationPercent: round(
                ((row.pricePerLiter - averagePricePerLiter) / averagePricePerLiter) * 100,
                2,
              ),
              excessCost: round((row.pricePerLiter - averagePricePerLiter) * row.liters, 2),
            }))
            .sort((left, right) => right.excessCost - left.excessCost)
        : [];

    const ratedVehicles = vehicles.filter((vehicle) => vehicle.targetDeviationPercent != null);
    const overTargetVehicleCount = ratedVehicles.filter(
      (vehicle) => (vehicle.targetDeviationPercent ?? 0) >= FUEL_TARGET_TOLERANCE_PERCENT,
    ).length;

    return {
      generatedAt: new Date().toISOString(),
      from: query.from ?? null,
      to: query.to ?? null,
      vehicleId: query.vehicleId ?? null,
      driverId: query.driverId ?? null,
      assumptions: {
        co2KgPerLiter: 2.64,
        suspiciousDeltaPercent: 15,
        priceTolerancePercent: FUEL_PRICE_TOLERANCE_PERCENT,
        targetTolerancePercent: FUEL_TARGET_TOLERANCE_PERCENT,
      },
      totals: {
        totalLiters,
        totalEstimatedLiters,
        tripDistanceKm,
        realDistanceKm,
        totalCost,
        avgLitersPer100Km:
          tripDistanceKm > 0 && totalLiters > 0 ? round((totalLiters / tripDistanceKm) * 100, 2) : null,
        avgEstimatedLitersPer100Km:
          tripDistanceKm > 0 && totalEstimatedLiters > 0
            ? round((totalEstimatedLiters / tripDistanceKm) * 100, 2)
            : null,
        estimatedVsRealDeltaLiters,
        estimatedVsRealDeltaPercent:
          totalLiters > 0 ? round((estimatedVsRealDeltaLiters / totalLiters) * 100, 2) : null,
        co2Kg: round(totalLiters * 2.64, 2),
        estimatedCo2Kg: round(totalEstimatedLiters * 2.64, 2),
        averagePricePerLiter,
        minPricePerLiter:
          entryPrices.length > 0
            ? round(Math.min(...entryPrices.map((row) => row.pricePerLiter)), 3)
            : null,
        maxPricePerLiter:
          entryPrices.length > 0
            ? round(Math.max(...entryPrices.map((row) => row.pricePerLiter)), 3)
            : null,
        costPerKm,
        costPer100Km: costPerKm != null ? round(costPerKm * 100, 2) : null,
        aboveAveragePriceEntryCount: priceOutliers.length,
        aboveAverageExcessCost: round(
          priceOutliers.reduce((sum, row) => sum + row.excessCost, 0),
          2,
        ),
        overTargetVehicleCount,
        ratedVehicleCount: ratedVehicles.length,
        averageTargetDeviationPercent:
          ratedVehicles.length > 0
            ? round(
                ratedVehicles.reduce((sum, vehicle) => sum + (vehicle.targetDeviationPercent ?? 0), 0) /
                  ratedVehicles.length,
                2,
              )
            : null,
        suspiciousEventCount:
          suspiciousEventsRaw.length + vehicles.filter((vehicle) => Math.abs(vehicle.deltaPercent ?? 0) >= 15).length,
      },
      vehicles,
      weeklyTrend,
      driverBreakdown: [...driverBreakdownMap.values()].sort(
        (left, right) => right.tripDistanceKm - left.tripDistanceKm,
      ),
      priceOutliers,
      suspiciousEvents: [
        ...suspiciousEventsRaw.map((event) => {
          const vehicle = rows.find((row) => row.vehicleId === event.relatedEntityId);
          return {
            id: event.id,
            type: 'fuel_theft_suspected' as const,
            vehicleId: event.relatedEntityId ?? '',
            plateNumber: vehicle?.plateNumber ?? event.relatedEntityId ?? '—',
            occurredAt: event.createdAt.toISOString(),
            title: event.title,
            message: event.message,
          };
        }),
        ...vehicles
          .filter((vehicle) => Math.abs(vehicle.deltaPercent ?? 0) >= 15)
          .map((vehicle) => ({
            id: `deviation-${vehicle.vehicleId}`,
            type: 'fuel_deviation' as const,
            vehicleId: vehicle.vehicleId,
            plateNumber: vehicle.plateNumber,
            occurredAt: new Date().toISOString(),
            title: 'Fuel deviation flagged',
            message: `${vehicle.plateNumber} has an estimated vs real delta of ${vehicle.deltaPercent?.toFixed(1) ?? '0.0'}%`,
          })),
      ],
      entries: entries.map((entry) => ({
        ...this.serializeFuelEntry(entry),
        vehiclePlate: entry.vehicle.plateNumber,
        driverName: `${entry.driver.firstName} ${entry.driver.lastName}`.trim(),
      })),
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
          ...(query.driverId ? { driverId: query.driverId } : {}),
          ...(startedAt ? { startedAt } : {}),
        },
        select: { vehicleId: true },
        distinct: ['vehicleId'],
        take: 500,
      }),
      this.prisma.fleetFuelEntry.findMany({
        where: this.buildListWhere({ from: query.from, to: query.to, driverId: query.driverId }),
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
        ...(query.driverId ? { driverId: query.driverId } : {}),
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

    const entryRows = entries.map((entry) => ({
      driverId: entry.driverId,
      enteredAt: entry.enteredAt,
      liters: Number(entry.liters),
      totalCost: Number(entry.totalCost),
    }));

    const intervals = computeFuelConsumptionIntervals(consumptionEntries, tripSlices);
    const avgLitersPer100Km = computeWeightedAverageLitersPer100Km(intervals);
    const weeklyTrend = buildWeeklyFuelTrend(intervals, tripEstimates, entryRows);
    const driverBreakdown = buildDriverFuelBreakdown(tripEstimates, entryRows);

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

  /**
   * @param scope Hangi is akisi durumlarinin sayilacagi.
   *
   * VARSAYILAN `approved_only` VE BU BILINCLI: Faz 6'dan itibaren surucu
   * dogrudan fis yukluyor ve bu kayitlar muhasebe onayindan GECMEDEN
   * veritabaninda duruyor. Varsayilan "hepsi" olsaydi, ileride eklenen her yeni
   * maliyet sorgusu sessizce onaylanmamis fisleri de toplar ve arac maliyeti
   * gercekte olmayan giderlerle sisirdi. Parametreyi unutan cagri GUVENLI
   * tarafta kalsin diye varsayilan daraltici.
   *
   * `all_statuses` yalnizca LISTELEME uclarinda: ofis ve surucu bekleyen
   * fislerini gorebilmeli — ama o sayfalar toplam maliyet hesaplamiyor.
   */
  private buildListWhere(
    query: ListFuelEntriesQueryDto,
    scope: 'approved_only' | 'all_statuses' = 'approved_only',
  ): Prisma.FleetFuelEntryWhereInput {
    const where: Prisma.FleetFuelEntryWhereInput = {};

    if (scope === 'approved_only') {
      where.workflowStatus = FuelEntryWorkflowStatus.approved;
    }

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

  /** Ortak servise devrediliyor — bkz. DriverVehicleService. */
  private async assertDriverAssignedToVehicle(driverId: string, vehicleId: string) {
    await this.driverVehicle.assertDriverAssignedToVehicle(driverId, vehicleId);
  }

  private todayRange(): { start: Date; end: Date } {
    return this.driverVehicle.todayRange();
  }

  private serializeFuelEntry(entry: {
    id: string;
    vehicleId: string;
    driverId: string;
    enteredAt: Date;
    liters: Prisma.Decimal | null;
    totalCost: Prisma.Decimal | null;
    currency: string;
    workflowStatus: FuelEntryWorkflowStatus;
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
      liters: entry.liters != null ? Number(entry.liters) : null,
      totalCost: entry.totalCost != null ? Number(entry.totalCost) : null,
      currency: entry.currency,
      workflowStatus: entry.workflowStatus,
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
