import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AssignmentStatus,
  DtcSeverity,
  FleetDrivingEventType,
  FleetTelemetrySource,
  FleetTripStatus,
  DriverStatus,
  LocationSource,
  LocationTrackingStatus,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { IngestTelemetryDto } from './dto/ingest-telemetry.dto';
import type { SubmitLocationDto } from './dto/submit-location.dto';
import type {
  LiveTrackingItem,
  LiveTrackingParams,
  LocationHistoryParams,
  LocationHistoryPoint,
  TrackingPresenceStatus,
} from './tracking.types';

const TRACKABLE_ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  AssignmentStatus.planned,
  AssignmentStatus.confirmed,
  AssignmentStatus.in_progress,
];

const ASSIGNMENT_STATUS_PRIORITY: AssignmentStatus[] = [
  AssignmentStatus.in_progress,
  AssignmentStatus.confirmed,
  AssignmentStatus.planned,
];

const MAX_RECORDED_AT_FUTURE_MS = 5 * 60 * 1000;
const MAX_RECORDED_AT_AGE_MS = 24 * 60 * 60 * 1000;
const DEDUP_TIME_MS = 30 * 1000;
const DEDUP_DISTANCE_M = 25;
const STATIONARY_SPEED_MPS = 5 / 3.6;
const MOVING_UPLOAD_INTERVAL_SEC = 30;
const STATIONARY_UPLOAD_INTERVAL_SEC = 120;
const OFFLINE_THRESHOLD_SEC = 30 * 60;
const DEFAULT_HISTORY_LIMIT = 500;
const MAX_HISTORY_LIMIT = 5000;
const DEFAULT_HISTORY_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const MAX_SHARING_SESSION_MS = 12 * 60 * 60 * 1000;
const VEHICLE_HEALTH_STALE_MINUTES = 30;
const DRIVER_SCORE_WINDOW_DAYS = 30;

const DRIVER_EVENT_WEIGHTS: Record<FleetDrivingEventType, number> = {
  [FleetDrivingEventType.speeding]: 2,
  [FleetDrivingEventType.harsh_accel]: 3,
  [FleetDrivingEventType.harsh_brake]: 3,
  [FleetDrivingEventType.harsh_corner]: 4,
  [FleetDrivingEventType.crash]: 25,
};

type TelematicsHealthStatus = 'healthy' | 'warning' | 'critical' | 'offline';

type TelematicsVehicleHealthRow = {
  vehicleId: string;
  plateNumber: string;
  brand: string;
  model: string;
  driverName: string | null;
  health: TelematicsHealthStatus;
  ignition: boolean | null;
  rpm: number | null;
  fuelLevelPct: number | null;
  coolantTemp: number | null;
  voltage: number | null;
  odometerKm: number | null;
  activeDtcCount: number;
  criticalDtcCount: number;
  topDtcCodes: string[];
  lastTelemetryAt: string | null;
};

type TelematicsDriverScoreRow = {
  driverId: string;
  driverName: string;
  driverStatus: DriverStatus;
  distanceKm: number;
  totalEvents: number;
  weightedEvents: number;
  eventRatePer100Km: number;
  score: number;
  riskLevel: 'low' | 'medium' | 'high';
  breakdown: Record<FleetDrivingEventType, number>;
};

type ResolvedDriver = {
  id: string;
  locationTrackingConsentAt: Date | null;
  locationTrackingStatus: LocationTrackingStatus;
  locationSharingStartedAt: Date | null;
  locationSharingEndedAt: Date | null;
};

@Injectable()
export class TrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async grantLocationConsent(driverId: string) {
    const now = new Date();

    await this.prisma.driver.update({
      where: { id: driverId },
      data: {
        locationTrackingConsentAt: now,
        locationTrackingEnabledAt: now,
        locationTrackingStatus: LocationTrackingStatus.paused,
      },
    });

    return {
      consentGranted: true,
      consentAt: now.toISOString(),
      trackingStatus: LocationTrackingStatus.paused,
      sharingActive: false,
    };
  }

  async startLocationSharing(driverId: string) {
    const driver = await this.loadResolvedDriver(driverId);
    await this.expireSharingSessionIfNeeded(driver);

    if (!driver.locationTrackingConsentAt) {
      throw new ForbiddenException('Location tracking consent is required before sharing');
    }

    if (this.isSharingSessionActive(driver)) {
      return this.getLocationStatus(driver);
    }

    const now = new Date();
    await this.prisma.driver.update({
      where: { id: driverId },
      data: {
        locationSharingStartedAt: now,
        locationSharingEndedAt: null,
        locationTrackingStatus: LocationTrackingStatus.active,
      },
    });

    return this.getLocationStatus({
      ...driver,
      locationSharingStartedAt: now,
      locationSharingEndedAt: null,
      locationTrackingStatus: LocationTrackingStatus.active,
    });
  }

  async endLocationSharing(driverId: string) {
    const driver = await this.loadResolvedDriver(driverId);
    const now = new Date();

    await this.prisma.driver.update({
      where: { id: driverId },
      data: {
        locationSharingStartedAt: null,
        locationSharingEndedAt: now,
        locationTrackingStatus: LocationTrackingStatus.paused,
      },
    });

    return this.getLocationStatus({
      ...driver,
      locationSharingStartedAt: null,
      locationSharingEndedAt: now,
      locationTrackingStatus: LocationTrackingStatus.paused,
    });
  }

  async getLocationStatus(driver: ResolvedDriver) {
    const refreshed = await this.expireSharingSessionIfNeeded(driver);
    const hasTrackableAssignmentToday = await this.hasTrackableAssignmentToday(refreshed.id);
    const latest = await this.prisma.driverLocationLatest.findUnique({
      where: { driverId: refreshed.id },
      select: {
        recordedAt: true,
        receivedAt: true,
        vehicleId: true,
      },
    });

    const consentGranted = refreshed.locationTrackingConsentAt !== null;
    const sharingActive = this.isSharingSessionActive(refreshed);
    const trackingAllowed =
      consentGranted && sharingActive && hasTrackableAssignmentToday;

    return {
      consentGranted,
      consentAt: refreshed.locationTrackingConsentAt?.toISOString() ?? null,
      trackingStatus: refreshed.locationTrackingStatus,
      sharingActive,
      sharingStartedAt: refreshed.locationSharingStartedAt?.toISOString() ?? null,
      sharingEndedAt: refreshed.locationSharingEndedAt?.toISOString() ?? null,
      hasTrackableAssignmentToday,
      trackingAllowed,
      lastUpload: latest
        ? {
            recordedAt: latest.recordedAt.toISOString(),
            receivedAt: latest.receivedAt.toISOString(),
            vehicleId: latest.vehicleId,
          }
        : null,
    };
  }

  async ingestTelematicsLocation(dto: {
    vehicleId: string;
    latitude: number;
    longitude: number;
    recordedAt?: string;
    accuracyM?: number;
    speedMps?: number;
    headingDeg?: number;
  }) {
    await this.assertVehicleExists(dto.vehicleId);
    const driverId = await this.resolveDriverIdForVehicleToday(dto.vehicleId);
    if (!driverId) {
      throw new BadRequestException(
        'No active driver assignment found for this vehicle today',
      );
    }

    const recordedAt = dto.recordedAt
      ? this.parseRecordedAt(dto.recordedAt)
      : new Date();

    const locationData = {
      latitude: new Prisma.Decimal(dto.latitude),
      longitude: new Prisma.Decimal(dto.longitude),
      accuracyM: dto.accuracyM ?? null,
      speedMps: dto.speedMps ?? null,
      headingDeg: dto.headingDeg ?? null,
      altitudeM: null,
      recordedAt,
      source: LocationSource.telematics,
      vehicleId: dto.vehicleId,
    };

    await this.prisma.driverLocationLatest.upsert({
      where: { driverId },
      create: {
        driverId,
        ...locationData,
      },
      update: locationData,
    });

    await this.prisma.driverLocationHistory.create({
      data: {
        driverId,
        ...locationData,
      },
    });

    return {
      accepted: true,
      driverId,
      vehicleId: dto.vehicleId,
      source: LocationSource.telematics,
      recordedAt: recordedAt.toISOString(),
    };
  }

  async ingestTelemetry(dto: IngestTelemetryDto) {
    const recordedAt = dto.recordedAt
      ? this.parseRecordedAt(dto.recordedAt)
      : new Date();

    return this.prisma.unscoped.$transaction(async (tx) => {
      const { tenantId, vehicleId } = await this.resolveTelemetryVehicleContext(tx, dto);
      const driverId = await this.resolveDriverIdForVehicleTodayWithClient(tx, vehicleId);

      if (!driverId) {
        throw new BadRequestException(
          'No active driver assignment found for this vehicle today',
        );
      }

      const locationData = {
        tenantId,
        latitude: new Prisma.Decimal(dto.latitude),
        longitude: new Prisma.Decimal(dto.longitude),
        speedMps: dto.speedMps ?? null,
        headingDeg: dto.headingDeg ?? null,
        accuracyM: null,
        altitudeM: null,
        recordedAt,
        source: LocationSource.telematics,
        vehicleId,
      };

      await tx.driverLocationLatest.upsert({
        where: { driverId },
        create: {
          driverId,
          ...locationData,
        },
        update: locationData,
      });

      await tx.driverLocationHistory.create({
        data: {
          driverId,
          ...locationData,
        },
      });

      await tx.vehicleTelemetryLatest.upsert({
        where: { vehicleId },
        create: {
          vehicleId,
          tenantId,
          ignition: dto.ignition ?? false,
          rpm: dto.rpm ?? null,
          fuelLevelPct: this.toDecimalOrNull(dto.fuelLevelPct),
          coolantTemp: this.toDecimalOrNull(dto.coolantTemp),
          voltage: this.toDecimalOrNull(dto.voltage),
          odometerKm: this.toDecimalOrNull(dto.odometerKm),
          recordedAt,
        },
        update: {
          ignition: dto.ignition ?? false,
          rpm: dto.rpm ?? null,
          fuelLevelPct: this.toDecimalOrNull(dto.fuelLevelPct),
          coolantTemp: this.toDecimalOrNull(dto.coolantTemp),
          voltage: this.toDecimalOrNull(dto.voltage),
          odometerKm: this.toDecimalOrNull(dto.odometerKm),
          recordedAt,
        },
      });

      if (dto.dtc?.length) {
        await tx.vehicleDtc.createMany({
          data: dto.dtc.map((item) => ({
            tenantId,
            vehicleId,
            code: item.code.trim(),
            description: item.description?.trim() || null,
            severity:
              item.severity === 'critical' ? DtcSeverity.critical : DtcSeverity.medium,
            occurredAt: recordedAt,
          })),
        });
      }

      let tripId: string | null = null;
      if (dto.events?.length) {
        const trip = await this.findOrCreateDeviceTrip(tx, {
          tenantId,
          vehicleId,
          driverId,
          startedAt: recordedAt,
        });
        tripId = trip.id;

        await tx.fleetDrivingEvent.createMany({
          data: dto.events.map((event) => ({
            tenantId,
            tripId: trip.id,
            driverId,
            type: this.mapTelemetryEventType(event.type),
            occurredAt: recordedAt,
            latitude: new Prisma.Decimal(dto.latitude),
            longitude: new Prisma.Decimal(dto.longitude),
            value: new Prisma.Decimal(event.value),
            threshold: new Prisma.Decimal(event.threshold ?? event.value),
          })),
        });
      }

      return {
        accepted: true,
        tenantId,
        vehicleId,
        driverId,
        tripId,
        source: LocationSource.telematics,
        recordedAt: recordedAt.toISOString(),
      };
    });
  }

  async getTelematicsVehicleHealth() {
    const now = new Date();
    const staleCutoff = new Date(now.getTime() - VEHICLE_HEALTH_STALE_MINUTES * 60 * 1000);

    const [vehicles, dtcs] = await Promise.all([
      this.prisma.vehicle.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          plateNumber: true,
          brand: true,
          model: true,
          currentDriver: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
          telemetryLatest: {
            select: {
              ignition: true,
              rpm: true,
              fuelLevelPct: true,
              coolantTemp: true,
              voltage: true,
              odometerKm: true,
              recordedAt: true,
            },
          },
        },
        orderBy: { plateNumber: 'asc' },
      }),
      this.prisma.vehicleDtc.findMany({
        where: { clearedAt: null },
        select: {
          vehicleId: true,
          code: true,
          severity: true,
          occurredAt: true,
        },
      }),
    ]);

    const dtcByVehicle = new Map<
      string,
      Array<{ code: string; severity: DtcSeverity; occurredAt: Date }>
    >();
    for (const dtc of dtcs) {
      const rows = dtcByVehicle.get(dtc.vehicleId) ?? [];
      rows.push(dtc);
      dtcByVehicle.set(dtc.vehicleId, rows);
    }

    const items: TelematicsVehicleHealthRow[] = vehicles.map((vehicle) => {
      const vehicleDtcs = dtcByVehicle.get(vehicle.id) ?? [];
      const criticalDtcCount = vehicleDtcs.filter((dtc) => dtc.severity === DtcSeverity.critical).length;
      const activeDtcCount = vehicleDtcs.length;

      const telemetry = vehicle.telemetryLatest;
      const fuelLevel = telemetry?.fuelLevelPct ? this.decimalToNumber(telemetry.fuelLevelPct) : null;
      const coolantTemp = telemetry?.coolantTemp ? this.decimalToNumber(telemetry.coolantTemp) : null;
      const voltage = telemetry?.voltage ? this.decimalToNumber(telemetry.voltage) : null;

      let health: TelematicsHealthStatus = 'healthy';
      if (!telemetry || telemetry.recordedAt < staleCutoff) {
        health = 'offline';
      } else if (
        criticalDtcCount > 0
        || (coolantTemp !== null && coolantTemp >= 110)
        || (voltage !== null && voltage < 11.8)
      ) {
        health = 'critical';
      } else if (
        activeDtcCount > 0
        || (fuelLevel !== null && fuelLevel <= 15)
        || (coolantTemp !== null && coolantTemp >= 100)
        || (voltage !== null && voltage < 12.2)
      ) {
        health = 'warning';
      }

      const topDtcCodes = vehicleDtcs
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
        .slice(0, 3)
        .map((dtc) => dtc.code);

      return {
        vehicleId: vehicle.id,
        plateNumber: vehicle.plateNumber,
        brand: vehicle.brand,
        model: vehicle.model,
        driverName: vehicle.currentDriver
          ? `${vehicle.currentDriver.firstName} ${vehicle.currentDriver.lastName}`.trim()
          : null,
        health,
        ignition: telemetry?.ignition ?? null,
        rpm: telemetry?.rpm ?? null,
        fuelLevelPct: fuelLevel,
        coolantTemp,
        voltage,
        odometerKm: telemetry?.odometerKm ? this.decimalToNumber(telemetry.odometerKm) : null,
        activeDtcCount,
        criticalDtcCount,
        topDtcCodes,
        lastTelemetryAt: telemetry?.recordedAt.toISOString() ?? null,
      };
    });

    const summary = {
      totalVehicles: items.length,
      healthy: items.filter((item) => item.health === 'healthy').length,
      warning: items.filter((item) => item.health === 'warning').length,
      critical: items.filter((item) => item.health === 'critical').length,
      offline: items.filter((item) => item.health === 'offline').length,
      activeDtcTotal: items.reduce((acc, item) => acc + item.activeDtcCount, 0),
    };

    return {
      generatedAt: now.toISOString(),
      staleAfterMinutes: VEHICLE_HEALTH_STALE_MINUTES,
      summary,
      items,
    };
  }

  async getTelematicsDriverScores() {
    const now = new Date();
    const since = new Date(now.getTime() - DRIVER_SCORE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const [tripDistanceRows, eventRows] = await Promise.all([
      this.prisma.fleetTrip.groupBy({
        by: ['driverId'],
        where: {
          startedAt: { gte: since },
          status: FleetTripStatus.closed,
        },
        _sum: { distanceKm: true },
      }),
      this.prisma.fleetDrivingEvent.groupBy({
        by: ['driverId', 'type'],
        where: { occurredAt: { gte: since } },
        _count: { _all: true },
      }),
    ]);

    const driverIds = new Set<string>();
    const distanceByDriver = new Map<string, number>();

    for (const row of tripDistanceRows) {
      driverIds.add(row.driverId);
      const distance = row._sum.distanceKm ? this.decimalToNumber(row._sum.distanceKm) : 0;
      distanceByDriver.set(row.driverId, distance);
    }

    const eventByDriver = new Map<string, Record<FleetDrivingEventType, number>>();
    for (const row of eventRows) {
      driverIds.add(row.driverId);
      const current = eventByDriver.get(row.driverId) ?? {
        [FleetDrivingEventType.speeding]: 0,
        [FleetDrivingEventType.harsh_accel]: 0,
        [FleetDrivingEventType.harsh_brake]: 0,
        [FleetDrivingEventType.harsh_corner]: 0,
        [FleetDrivingEventType.crash]: 0,
      };
      current[row.type] = row._count._all;
      eventByDriver.set(row.driverId, current);
    }

    if (driverIds.size === 0) {
      return {
        generatedAt: now.toISOString(),
        periodDays: DRIVER_SCORE_WINDOW_DAYS,
        summary: {
          totalDrivers: 0,
          averageScore: 0,
          totalEvents: 0,
          totalDistanceKm: 0,
          distribution: {
            excellent: 0,
            good: 0,
            watchlist: 0,
            critical: 0,
          },
        },
        items: [] as TelematicsDriverScoreRow[],
      };
    }

    const drivers = await this.prisma.driver.findMany({
      where: {
        id: { in: Array.from(driverIds) },
        status: { not: DriverStatus.terminated },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
      },
    });

    const items: TelematicsDriverScoreRow[] = drivers.map((driver) => {
      const breakdown = eventByDriver.get(driver.id) ?? {
        [FleetDrivingEventType.speeding]: 0,
        [FleetDrivingEventType.harsh_accel]: 0,
        [FleetDrivingEventType.harsh_brake]: 0,
        [FleetDrivingEventType.harsh_corner]: 0,
        [FleetDrivingEventType.crash]: 0,
      };

      const distanceKm = distanceByDriver.get(driver.id) ?? 0;
      const totalEvents = Object.values(breakdown).reduce((acc, value) => acc + value, 0);
      const weightedEvents = (Object.keys(breakdown) as FleetDrivingEventType[]).reduce(
        (acc, key) => acc + breakdown[key] * DRIVER_EVENT_WEIGHTS[key],
        0,
      );

      const normalizedDistance = Math.max(distanceKm, 100);
      const penaltyPer100Km = (weightedEvents / normalizedDistance) * 100;
      const rawScore = 100 - penaltyPer100Km * 2.5;
      const score = Math.max(0, Math.min(100, Number(rawScore.toFixed(1))));

      let riskLevel: 'low' | 'medium' | 'high' = 'high';
      if (score >= 85) {
        riskLevel = 'low';
      } else if (score >= 70) {
        riskLevel = 'medium';
      }

      return {
        driverId: driver.id,
        driverName: `${driver.firstName} ${driver.lastName}`.trim(),
        driverStatus: driver.status,
        distanceKm: Number(distanceKm.toFixed(1)),
        totalEvents,
        weightedEvents,
        eventRatePer100Km: distanceKm > 0 ? Number(((totalEvents / distanceKm) * 100).toFixed(2)) : 0,
        score,
        riskLevel,
        breakdown,
      };
    }).sort((a, b) => a.score - b.score);

    const scoreSum = items.reduce((acc, item) => acc + item.score, 0);
    const summary = {
      totalDrivers: items.length,
      averageScore: items.length > 0 ? Number((scoreSum / items.length).toFixed(1)) : 0,
      totalEvents: items.reduce((acc, item) => acc + item.totalEvents, 0),
      totalDistanceKm: Number(items.reduce((acc, item) => acc + item.distanceKm, 0).toFixed(1)),
      distribution: {
        excellent: items.filter((item) => item.score >= 90).length,
        good: items.filter((item) => item.score >= 75 && item.score < 90).length,
        watchlist: items.filter((item) => item.score >= 60 && item.score < 75).length,
        critical: items.filter((item) => item.score < 60).length,
      },
    };

    return {
      generatedAt: now.toISOString(),
      periodDays: DRIVER_SCORE_WINDOW_DAYS,
      summary,
      items,
    };
  }

  async submitLocation(driver: ResolvedDriver, dto: SubmitLocationDto) {
    const refreshed = await this.expireSharingSessionIfNeeded(driver);
    this.assertTrackingConsent(refreshed);
    this.assertSharingSessionActive(refreshed);

    const hasTrackableAssignmentToday = await this.hasTrackableAssignmentToday(refreshed.id);
    if (!hasTrackableAssignmentToday) {
      throw new ForbiddenException(
        'Location tracking is only allowed when you have an active assignment today',
      );
    }

    const recordedAt = this.parseRecordedAt(dto.recordedAt);
    const vehicleId = await this.resolveVehicleIdForToday(refreshed.id);
    const deduplicated = await this.shouldDeduplicate(refreshed.id, dto, recordedAt);

    const locationData = {
      latitude: new Prisma.Decimal(dto.latitude),
      longitude: new Prisma.Decimal(dto.longitude),
      accuracyM: dto.accuracyM ?? null,
      speedMps: dto.speedMps ?? null,
      headingDeg: dto.headingDeg ?? null,
      altitudeM: dto.altitudeM ?? null,
      recordedAt,
      source: LocationSource.mobile,
      vehicleId,
    };

    await this.prisma.driverLocationLatest.upsert({
      where: { driverId: refreshed.id },
      create: {
        driverId: refreshed.id,
        ...locationData,
      },
      update: locationData,
    });

    if (!deduplicated) {
      await this.prisma.driverLocationHistory.create({
        data: {
          driverId: refreshed.id,
          ...locationData,
        },
      });
    }

    const nextUploadAfterSec = this.resolveNextUploadIntervalSec(dto.speedMps);

    return {
      accepted: true,
      deduplicated,
      vehicleId,
      nextUploadAfterSec,
      lowAccuracy: dto.accuracyM !== undefined && dto.accuracyM > 200,
    };
  }

  async getLiveTracking(params: LiveTrackingParams): Promise<LiveTrackingItem[]> {
    const now = new Date();
    await this.expireAllStaleSharingSessions();
    const sharingDriverIds = await this.listActiveSharingDriverIds();
    const telematicsDriverIds = await this.listRecentTelematicsDriverIds(now);
    const trackedDriverIds = [...new Set([...sharingDriverIds, ...telematicsDriverIds])];
    if (trackedDriverIds.length === 0) {
      return [];
    }

    const assignmentMap = await this.loadCurrentAssignmentsByDriver();
    const latestRows = await this.prisma.driverLocationLatest.findMany({
      where: { driverId: { in: trackedDriverIds } },
      include: {
        driver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            status: true,
          },
        },
        vehicle: {
          select: {
            id: true,
            plateNumber: true,
          },
        },
      },
    });

    const items: LiveTrackingItem[] = latestRows.map((row) =>
      this.mapLatestRowToLiveItem(row, assignmentMap.get(row.driverId) ?? null, params.staleAfterSec, now),
    );

    if (params.includeOffline) {
      const driversWithLatest = new Set(latestRows.map((row) => row.driverId));
      const offlineDrivers = await this.prisma.driver.findMany({
        where: {
          id: {
            in: trackedDriverIds.filter((id) => !driversWithLatest.has(id)),
          },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      });

      for (const driver of offlineDrivers) {
        items.push(
          this.buildOfflineLiveItem(
            driver.id,
            `${driver.firstName} ${driver.lastName}`.trim(),
            assignmentMap.get(driver.id) ?? null,
          ),
        );
      }
    }

    let filtered = params.includeOffline
      ? items
      : items.filter((item) => item.status === 'online' || item.status === 'stale');

    if (params.search?.trim()) {
      filtered = filtered.filter((item) => this.matchesSearch(item, params.search!));
    }

    return filtered.sort((a, b) => a.driverName.localeCompare(b.driverName));
  }

  async getDriverLatest(driverId: string): Promise<LiveTrackingItem> {
    await this.assertDriverExists(driverId);
    const driver = await this.loadResolvedDriver(driverId);
    await this.expireSharingSessionIfNeeded(driver);

    if (!this.isSharingSessionActive(driver)) {
      throw new NotFoundException('Driver is not sharing location');
    }

    const latest = await this.prisma.driverLocationLatest.findUnique({
      where: { driverId },
      include: {
        driver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        vehicle: {
          select: {
            id: true,
            plateNumber: true,
          },
        },
      },
    });

    if (!latest) {
      throw new NotFoundException('No latest location found for driver');
    }

    const assignment = await this.getCurrentAssignmentForDriver(driverId);
    return this.mapLatestRowToLiveItem(latest, assignment, 300, new Date());
  }

  async getDriverHistory(
    driverId: string,
    query: LocationHistoryParams,
    currentUserId: string,
  ): Promise<LocationHistoryPoint[]> {
    await this.assertDriverExists(driverId);
    const { from, to, limit } = this.resolveHistoryQuery(query);

    const rows = await this.prisma.driverLocationHistory.findMany({
      where: {
        driverId,
        recordedAt: { gte: from, lte: to },
      },
      orderBy: { recordedAt: 'asc' },
      take: limit,
    });

    await this.logHistoryViewed(currentUserId, 'driver', driverId, { from, to, limit });

    return rows.map((row) => this.mapHistoryRow(row));
  }

  async getVehicleHistory(
    vehicleId: string,
    query: LocationHistoryParams,
    currentUserId: string,
  ): Promise<LocationHistoryPoint[]> {
    await this.assertVehicleExists(vehicleId);
    const { from, to, limit } = this.resolveHistoryQuery(query);

    const rows = await this.prisma.driverLocationHistory.findMany({
      where: {
        vehicleId,
        recordedAt: { gte: from, lte: to },
      },
      orderBy: { recordedAt: 'asc' },
      take: limit,
    });

    await this.logHistoryViewed(currentUserId, 'vehicle', vehicleId, { from, to, limit });

    return rows.map((row) => this.mapHistoryRow(row));
  }

  computeTrackingStatus(
    receivedAt: Date | null | undefined,
    staleAfterSec: number,
    now: Date = new Date(),
  ): TrackingPresenceStatus {
    if (!receivedAt) {
      return 'offline';
    }

    const ageSec = (now.getTime() - receivedAt.getTime()) / 1000;
    if (ageSec <= staleAfterSec) {
      return 'online';
    }
    if (ageSec <= OFFLINE_THRESHOLD_SEC) {
      return 'stale';
    }
    return 'offline';
  }

  async getCurrentAssignmentForDriver(driverId: string) {
    const { start, end } = this.todayRange();

    const assignments = await this.prisma.assignment.findMany({
      where: {
        driverId,
        workDate: { gte: start, lt: end },
        status: { in: TRACKABLE_ASSIGNMENT_STATUSES },
      },
      select: {
        id: true,
        status: true,
        cargoName: true,
        vehicleId: true,
        company: { select: { name: true } },
        vehicle: { select: { id: true, plateNumber: true } },
      },
    });

    for (const status of ASSIGNMENT_STATUS_PRIORITY) {
      const match = assignments.find((assignment) => assignment.status === status);
      if (match) {
        return match;
      }
    }

    return null;
  }

  private async loadResolvedDriver(driverId: string): Promise<ResolvedDriver> {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      select: {
        id: true,
        locationTrackingConsentAt: true,
        locationTrackingStatus: true,
        locationSharingStartedAt: true,
        locationSharingEndedAt: true,
      },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    return driver;
  }

  private isSharingSessionActive(driver: ResolvedDriver, now = new Date()): boolean {
    if (!driver.locationSharingStartedAt) {
      return false;
    }

    if (driver.locationTrackingStatus !== LocationTrackingStatus.active) {
      return false;
    }

    const ageMs = now.getTime() - driver.locationSharingStartedAt.getTime();
    return ageMs >= 0 && ageMs <= MAX_SHARING_SESSION_MS;
  }

  private async expireSharingSessionIfNeeded(driver: ResolvedDriver): Promise<ResolvedDriver> {
    if (!driver.locationSharingStartedAt) {
      return driver;
    }

    if (this.isSharingSessionActive(driver)) {
      return driver;
    }

    const now = new Date();
    await this.prisma.driver.update({
      where: { id: driver.id },
      data: {
        locationSharingStartedAt: null,
        locationSharingEndedAt: now,
        locationTrackingStatus: LocationTrackingStatus.paused,
      },
    });

    return {
      ...driver,
      locationSharingStartedAt: null,
      locationSharingEndedAt: now,
      locationTrackingStatus: LocationTrackingStatus.paused,
    };
  }

  private async expireAllStaleSharingSessions(): Promise<void> {
    const cutoff = new Date(Date.now() - MAX_SHARING_SESSION_MS);
    await this.prisma.driver.updateMany({
      where: {
        locationSharingStartedAt: { not: null, lt: cutoff },
        locationTrackingStatus: LocationTrackingStatus.active,
      },
      data: {
        locationSharingStartedAt: null,
        locationSharingEndedAt: new Date(),
        locationTrackingStatus: LocationTrackingStatus.paused,
      },
    });
  }

  private async listActiveSharingDriverIds(): Promise<string[]> {
    const cutoff = new Date(Date.now() - MAX_SHARING_SESSION_MS);
    const drivers = await this.prisma.driver.findMany({
      where: {
        locationSharingStartedAt: { not: null, gte: cutoff },
        locationTrackingStatus: LocationTrackingStatus.active,
      },
      select: { id: true },
    });

    return drivers.map((driver) => driver.id);
  }

  private assertTrackingConsent(driver: ResolvedDriver) {
    if (!driver.locationTrackingConsentAt) {
      throw new ForbiddenException('Location tracking consent is required');
    }

    if (driver.locationTrackingStatus === LocationTrackingStatus.denied) {
      throw new ForbiddenException('Location tracking has been denied');
    }
  }

  private assertSharingSessionActive(driver: ResolvedDriver) {
    if (!this.isSharingSessionActive(driver)) {
      throw new ForbiddenException('Start location sharing before uploading coordinates');
    }
  }

  private parseRecordedAt(value: string): Date {
    const recordedAt = new Date(value);
    if (Number.isNaN(recordedAt.getTime())) {
      throw new BadRequestException('Invalid recordedAt');
    }

    const now = Date.now();
    const recordedAtMs = recordedAt.getTime();

    if (recordedAtMs > now + MAX_RECORDED_AT_FUTURE_MS) {
      throw new BadRequestException('recordedAt cannot be more than 5 minutes in the future');
    }

    if (recordedAtMs < now - MAX_RECORDED_AT_AGE_MS) {
      throw new BadRequestException('recordedAt cannot be older than 24 hours');
    }

    return recordedAt;
  }

  private async hasTrackableAssignmentToday(driverId: string): Promise<boolean> {
    const { start, end } = this.todayRange();

    const count = await this.prisma.assignment.count({
      where: {
        driverId,
        workDate: { gte: start, lt: end },
        status: { in: TRACKABLE_ASSIGNMENT_STATUSES },
      },
    });

    return count > 0;
  }

  private async resolveVehicleIdForToday(driverId: string): Promise<string | null> {
    const { start, end } = this.todayRange();

    const assignments = await this.prisma.assignment.findMany({
      where: {
        driverId,
        workDate: { gte: start, lt: end },
        status: { in: TRACKABLE_ASSIGNMENT_STATUSES },
      },
      select: {
        vehicleId: true,
        status: true,
      },
    });

    for (const status of ASSIGNMENT_STATUS_PRIORITY) {
      const match = assignments.find((assignment) => assignment.status === status);
      if (match) {
        return match.vehicleId;
      }
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { currentDriverId: driverId },
      select: { id: true },
    });

    return vehicle?.id ?? null;
  }

  private async shouldDeduplicate(
    driverId: string,
    dto: SubmitLocationDto,
    recordedAt: Date,
  ): Promise<boolean> {
    const previous = await this.prisma.driverLocationHistory.findFirst({
      where: { driverId },
      orderBy: { recordedAt: 'desc' },
      select: {
        latitude: true,
        longitude: true,
        recordedAt: true,
      },
    });

    if (!previous) {
      return false;
    }

    const elapsedMs = Math.abs(recordedAt.getTime() - previous.recordedAt.getTime());
    if (elapsedMs >= DEDUP_TIME_MS) {
      return false;
    }

    const distanceM = this.haversineDistanceM(
      dto.latitude,
      dto.longitude,
      previous.latitude.toNumber(),
      previous.longitude.toNumber(),
    );

    return distanceM < DEDUP_DISTANCE_M;
  }

  private resolveNextUploadIntervalSec(speedMps?: number) {
    if (speedMps === undefined || speedMps < STATIONARY_SPEED_MPS) {
      return STATIONARY_UPLOAD_INTERVAL_SEC;
    }

    return MOVING_UPLOAD_INTERVAL_SEC;
  }

  private todayRange(): { start: Date; end: Date } {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  private haversineDistanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const earthRadiusM = 6371000;
    const toRad = (deg: number) => (deg * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

    return 2 * earthRadiusM * Math.asin(Math.sqrt(a));
  }

  private async loadCurrentAssignmentsByDriver() {
    const { start, end } = this.todayRange();
    const assignments = await this.prisma.assignment.findMany({
      where: {
        workDate: { gte: start, lt: end },
        status: { in: TRACKABLE_ASSIGNMENT_STATUSES },
      },
      select: {
        id: true,
        driverId: true,
        status: true,
        cargoName: true,
        vehicleId: true,
        company: { select: { name: true } },
        vehicle: { select: { id: true, plateNumber: true } },
      },
    });

    const byDriver = new Map<string, (typeof assignments)[number]>();
    const driverIds = Array.from(new Set(assignments.map((assignment) => assignment.driverId)));

    for (const driverId of driverIds) {
      const driverAssignments = assignments.filter((assignment) => assignment.driverId === driverId);
      for (const status of ASSIGNMENT_STATUS_PRIORITY) {
        const match = driverAssignments.find((assignment) => assignment.status === status);
        if (match) {
          byDriver.set(driverId, match);
          break;
        }
      }
    }

    return byDriver;
  }

  private async listRecentTelematicsDriverIds(now: Date): Promise<string[]> {
    const cutoff = new Date(now.getTime() - OFFLINE_THRESHOLD_SEC * 1000);
    const rows = await this.prisma.driverLocationLatest.findMany({
      where: {
        source: LocationSource.telematics,
        receivedAt: { gte: cutoff },
      },
      select: { driverId: true },
    });
    return rows.map((row) => row.driverId);
  }

  private async resolveDriverIdForVehicleToday(vehicleId: string): Promise<string | null> {
    return this.resolveDriverIdForVehicleTodayWithClient(this.prisma, vehicleId);
  }

  private async resolveDriverIdForVehicleTodayWithClient(
    client: Prisma.TransactionClient | PrismaService,
    vehicleId: string,
  ): Promise<string | null> {
    const { start, end } = this.todayRange();
    const assignments = await client.assignment.findMany({
      where: {
        vehicleId,
        workDate: { gte: start, lt: end },
        status: { in: TRACKABLE_ASSIGNMENT_STATUSES },
      },
      select: {
        driverId: true,
        status: true,
      },
    });

    for (const status of ASSIGNMENT_STATUS_PRIORITY) {
      const match = assignments.find((assignment) => assignment.status === status);
      if (match?.driverId) {
        return match.driverId;
      }
    }

    return assignments.find((assignment) => assignment.driverId)?.driverId ?? null;
  }

  private async resolveTelemetryVehicleContext(
    tx: Prisma.TransactionClient,
    dto: IngestTelemetryDto,
  ): Promise<{ tenantId: string; vehicleId: string }> {
    const directVehicle = await tx.vehicle.findUnique({
      where: { id: dto.vehicleId },
      select: { id: true, tenantId: true },
    });

    if (!directVehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    if (!dto.imei?.trim()) {
      return { tenantId: directVehicle.tenantId, vehicleId: directVehicle.id };
    }

    const normalizedImei = dto.imei.trim();
    const device = await tx.device.findUnique({
      where: {
        tenantId_imei: {
          tenantId: directVehicle.tenantId,
          imei: normalizedImei,
        },
      },
      select: {
        id: true,
        tenantId: true,
        vehicleId: true,
      },
    });

    if (!device) {
      throw new NotFoundException('Device not found for tenant and IMEI');
    }

    const resolvedVehicleId = device.vehicleId ?? directVehicle.id;

    await tx.device.update({
      where: { id: device.id },
      data: {
        lastSeenAt: new Date(),
      },
    });

    return { tenantId: device.tenantId, vehicleId: resolvedVehicleId };
  }

  private async findOrCreateDeviceTrip(
    tx: Prisma.TransactionClient,
    params: { tenantId: string; vehicleId: string; driverId: string; startedAt: Date },
  ) {
    const activeTrip = await tx.fleetTrip.findFirst({
      where: {
        tenantId: params.tenantId,
        vehicleId: params.vehicleId,
        driverId: params.driverId,
        source: FleetTelemetrySource.device,
        status: FleetTripStatus.active,
      },
      orderBy: { startedAt: 'desc' },
      select: { id: true },
    });

    if (activeTrip) {
      return activeTrip;
    }

    const assignmentId = await this.resolveAssignmentIdForTripContext(tx, params.driverId, params.vehicleId);

    return tx.fleetTrip.create({
      data: {
        tenantId: params.tenantId,
        vehicleId: params.vehicleId,
        driverId: params.driverId,
        source: FleetTelemetrySource.device,
        startedAt: params.startedAt,
        status: FleetTripStatus.active,
        assignmentId,
      },
      select: { id: true },
    });
  }

  private async resolveAssignmentIdForTripContext(
    tx: Prisma.TransactionClient,
    driverId: string,
    vehicleId: string,
  ): Promise<string | null> {
    const { start, end } = this.todayRange();
    const assignments = await tx.assignment.findMany({
      where: {
        driverId,
        vehicleId,
        workDate: { gte: start, lt: end },
        status: { in: TRACKABLE_ASSIGNMENT_STATUSES },
      },
      select: { id: true, status: true },
    });

    for (const status of ASSIGNMENT_STATUS_PRIORITY) {
      const match = assignments.find((assignment) => assignment.status === status);
      if (match) {
        return match.id;
      }
    }

    return null;
  }

  private mapTelemetryEventType(
    type: 'speeding' | 'harsh_accel' | 'harsh_brake' | 'harsh_corner' | 'crash',
  ): FleetDrivingEventType {
    switch (type) {
      case 'speeding':
        return FleetDrivingEventType.speeding;
      case 'harsh_accel':
        return FleetDrivingEventType.harsh_accel;
      case 'harsh_brake':
        return FleetDrivingEventType.harsh_brake;
      case 'harsh_corner':
        return FleetDrivingEventType.harsh_corner;
      case 'crash':
        return FleetDrivingEventType.crash;
    }
  }

  private toDecimalOrNull(value: number | undefined): Prisma.Decimal | null {
    if (value === undefined || value === null) {
      return null;
    }
    return new Prisma.Decimal(value);
  }

  private mapLocationSource(source: LocationSource): 'mobile' | 'telematics' {
    return source === LocationSource.telematics ? 'telematics' : 'mobile';
  }

  private mapLatestRowToLiveItem(
    row: {
      driverId: string;
      latitude: Prisma.Decimal;
      longitude: Prisma.Decimal;
      accuracyM: number | null;
      speedMps: number | null;
      headingDeg: number | null;
      recordedAt: Date;
      receivedAt: Date;
      source: LocationSource;
      vehicleId: string | null;
      driver: { firstName: string; lastName: string };
      vehicle: { id: string; plateNumber: string } | null;
    },
    assignment: {
      id: string;
      cargoName: string;
      company: { name: string };
      vehicle: { id: string; plateNumber: string };
    } | null,
    staleAfterSec: number,
    now: Date,
  ): LiveTrackingItem {
    const driverName = `${row.driver.firstName} ${row.driver.lastName}`.trim();
    const vehicleId = row.vehicleId ?? assignment?.vehicle.id ?? null;
    const plateNumber = row.vehicle?.plateNumber ?? assignment?.vehicle.plateNumber ?? null;

    return {
      driverId: row.driverId,
      driverName,
      vehicleId,
      plateNumber,
      latitude: this.decimalToNumber(row.latitude),
      longitude: this.decimalToNumber(row.longitude),
      speedKmh: this.speedMpsToKmh(row.speedMps),
      headingDeg: row.headingDeg,
      accuracyM: row.accuracyM,
      recordedAt: row.recordedAt.toISOString(),
      receivedAt: row.receivedAt.toISOString(),
      status: this.computeTrackingStatus(row.receivedAt, staleAfterSec, now),
      locationSource: this.mapLocationSource(row.source),
      assignmentId: assignment?.id ?? null,
      companyName: assignment?.company.name ?? null,
      cargoName: assignment?.cargoName ?? null,
    };
  }

  private buildOfflineLiveItem(
    driverId: string,
    driverName: string,
    assignment: {
      id: string;
      cargoName: string;
      company: { name: string };
      vehicle: { id: string; plateNumber: string };
    } | null,
  ): LiveTrackingItem {
    return {
      driverId,
      driverName,
      vehicleId: assignment?.vehicle.id ?? null,
      plateNumber: assignment?.vehicle.plateNumber ?? null,
      latitude: null,
      longitude: null,
      speedKmh: null,
      headingDeg: null,
      accuracyM: null,
      recordedAt: null,
      receivedAt: null,
      status: 'offline',
      locationSource: null,
      assignmentId: assignment?.id ?? null,
      companyName: assignment?.company.name ?? null,
      cargoName: assignment?.cargoName ?? null,
    };
  }

  private mapHistoryRow(row: {
    id: string;
    driverId: string;
    vehicleId: string | null;
    latitude: Prisma.Decimal;
    longitude: Prisma.Decimal;
    speedMps: number | null;
    headingDeg: number | null;
    accuracyM: number | null;
    recordedAt: Date;
    receivedAt: Date;
    source: LocationSource;
  }): LocationHistoryPoint {
    return {
      id: row.id,
      driverId: row.driverId,
      vehicleId: row.vehicleId,
      latitude: this.decimalToNumber(row.latitude),
      longitude: this.decimalToNumber(row.longitude),
      speedKmh: this.speedMpsToKmh(row.speedMps),
      headingDeg: row.headingDeg,
      accuracyM: row.accuracyM,
      recordedAt: row.recordedAt.toISOString(),
      receivedAt: row.receivedAt.toISOString(),
      locationSource: this.mapLocationSource(row.source),
    };
  }

  private resolveHistoryQuery(query: LocationHistoryParams): { from: Date; to: Date; limit: number } {
    const limit = Math.min(query.limit ?? DEFAULT_HISTORY_LIMIT, MAX_HISTORY_LIMIT);
    const now = new Date();

    let from: Date;
    let to: Date;

    if (query.from && query.to) {
      from = this.parseHistoryDate(query.from, 'from');
      to = this.parseHistoryDate(query.to, 'to');
    } else if (query.from) {
      from = this.parseHistoryDate(query.from, 'from');
      to = now;
    } else if (query.to) {
      to = this.parseHistoryDate(query.to, 'to');
      from = new Date(to.getTime() - DEFAULT_HISTORY_LOOKBACK_MS);
    } else {
      from = new Date(now.getTime() - DEFAULT_HISTORY_LOOKBACK_MS);
      to = now;
    }

    if (from.getTime() > to.getTime()) {
      throw new BadRequestException('from must be less than or equal to to');
    }

    return { from, to, limit };
  }

  private parseHistoryDate(value: string, field: 'from' | 'to'): Date {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid ${field} date`);
    }
    return parsed;
  }

  private async assertDriverExists(driverId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      select: { id: true },
    });
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }
  }

  private async assertVehicleExists(vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }
  }

  private async logHistoryViewed(
    actorUserId: string,
    entityType: 'driver' | 'vehicle',
    entityId: string,
    metadata: { from: Date; to: Date; limit: number },
  ) {
    try {
      await this.auditService.logAction({
        actorUserId,
        action: 'tracking.history_viewed',
        entityType,
        entityId,
        summary: 'Tracking history viewed',
        metadata: {
          from: metadata.from.toISOString(),
          to: metadata.to.toISOString(),
          limit: metadata.limit,
        },
      });
    } catch (error) {
      console.warn('Audit log failed:', error);
    }
  }

  private matchesSearch(item: LiveTrackingItem, search: string): boolean {
    const query = search.trim().toLowerCase();
    if (!query) {
      return true;
    }

    const fields = [item.driverName, item.plateNumber, item.companyName];
    return fields.some((field) => field?.toLowerCase().includes(query));
  }

  private decimalToNumber(value: Prisma.Decimal): number {
    return value.toNumber();
  }

  private speedMpsToKmh(speedMps: number | null | undefined): number | null {
    if (speedMps === null || speedMps === undefined) {
      return null;
    }
    return Math.round(speedMps * 3.6);
  }
}
