import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AssignmentStatus,
  DtcSeverity,
  FleetDrivingEventType,
  FleetTelemetrySource,
  FleetTripStatus,
  LocationSource,
  LocationTrackingStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
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
const DEFAULT_TELEMETRY_HISTORY_LIMIT = 1000;
const MAX_TELEMETRY_HISTORY_LIMIT = 2000;
const TELEMETRY_HISTORY_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const TELEMETRY_HISTORY_THROTTLE_MS = 60 * 1000;
const MAX_SHARING_SESSION_MS = 12 * 60 * 60 * 1000;
const LOW_BATTERY_VOLTAGE_THRESHOLD = 11.8;
const NOTIFICATION_DEDUPE_WINDOW_MS = 30 * 60 * 1000;

const NOTIFICATION_OPERATIONAL_ROLES: UserRole[] = [
  UserRole.admin,
  UserRole.boss,
  UserRole.accounting,
  UserRole.office,
];

type NotificationTrigger = {
  tenantId: string;
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  relatedEntityType: string;
  relatedEntityId: string;
};

type TelematicsHealthStatus = 'ok' | 'warn' | 'critical';

type TelematicsVehicleHealthRow = {
  vehicleId: string;
  plateNumber: string;
  health: TelematicsHealthStatus;
  latest: {
    rpm: number | null;
    fuelLevelPct: number | null;
    coolantTemp: number | null;
    voltage: number | null;
    odometerKm: number | null;
    ignition: boolean | null;
    recordedAt: string | null;
  };
  openDtcCount: number;
};

type TelematicsOpenDtcRow = {
  plateNumber: string;
  code: string;
  description: string | null;
  severity: DtcSeverity;
  occurredAt: string;
};

type TelematicsDriverScoreRow = {
  driverId: string;
  name: string;
  score: number;
  harshCount: number;
  overspeedCount: number;
};

type DriverEventCounts = {
  harshCount: number;
  overspeedCount: number;
  crashCount: number;
};

type TelematicsMetric =
  | 'speedKmh'
  | 'rpm'
  | 'fuelLevelPct'
  | 'coolantTemp'
  | 'voltage'
  | 'odometerKm';

type TelematicsVehicleHistoryParams = {
  from?: string;
  to?: string;
  metric?: TelematicsMetric;
  limit?: number;
};

type TelematicsHistoryPayload = {
  tenantId: string;
  vehicleId: string;
  recordedAt: Date;
  speedKmh: number | null;
  rpm: number | null;
  fuelLevelPct: Prisma.Decimal | null;
  coolantTemp: Prisma.Decimal | null;
  voltage: Prisma.Decimal | null;
  odometerKm: Prisma.Decimal | null;
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
    private readonly notificationsService: NotificationsService,
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

    const ingestResult = await this.prisma.unscoped.$transaction(async (tx) => {
      const { tenantId, vehicleId } = await this.resolveTelemetryVehicleContext(tx, dto);
      const driverId = await this.resolveDriverIdForVehicleTodayWithClient(tx, vehicleId);

      if (!driverId) {
        throw new BadRequestException(
          'No active driver assignment found for this vehicle today',
        );
      }

      const vehicle = await tx.vehicle.findUnique({
        where: { id: vehicleId },
        select: { plateNumber: true },
      });

      const plateNumber = vehicle?.plateNumber ?? vehicleId;
      const notificationTriggers: NotificationTrigger[] = [];

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

      const fuelLevelPct = this.toDecimalOrNull(dto.fuelLevelPct);
      const coolantTemp = this.toDecimalOrNull(dto.coolantTemp);
      const voltage = this.toDecimalOrNull(dto.voltage);
      const odometerKm = this.toDecimalOrNull(dto.odometerKm);

      await tx.vehicleTelemetryLatest.upsert({
        where: { vehicleId },
        create: {
          vehicleId,
          tenantId,
          ignition: dto.ignition ?? false,
          rpm: dto.rpm ?? null,
          fuelLevelPct,
          coolantTemp,
          voltage,
          odometerKm,
          recordedAt,
        },
        update: {
          ignition: dto.ignition ?? false,
          rpm: dto.rpm ?? null,
          fuelLevelPct,
          coolantTemp,
          voltage,
          odometerKm,
          recordedAt,
        },
      });

      // TODO(telematics-history): consider retention and partitioning as volume grows.
      await this.maybePersistTelemetryHistory(tx, {
        tenantId,
        vehicleId,
        recordedAt,
        speedKmh: this.speedMpsToKmh(dto.speedMps),
        rpm: dto.rpm ?? null,
        fuelLevelPct,
        coolantTemp,
        voltage,
        odometerKm,
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

        const criticalCodes = Array.from(
          new Set(
            dto.dtc
              .filter((item) => item.severity === 'critical')
              .map((item) => item.code.trim())
              .filter((code) => code.length > 0),
          ),
        );

        for (const code of criticalCodes) {
          notificationTriggers.push({
            tenantId,
            title: `Kritik ariza: ${code} / ${plateNumber}`,
            message: `Arac ${plateNumber} icin kritik DTC kodu acildi (${code}).`,
            priority: 'critical',
            relatedEntityType: 'telematics_critical_dtc',
            relatedEntityId: `${vehicleId}:${code}`,
          });
        }
      }

      if (dto.voltage !== undefined && dto.voltage < LOW_BATTERY_VOLTAGE_THRESHOLD) {
        notificationTriggers.push({
          tenantId,
          title: `Dusuk aku voltaji / ${plateNumber}`,
          message: `Arac ${plateNumber} aku voltaji ${dto.voltage.toFixed(1)}V seviyesine dustu.`,
          priority: 'high',
          relatedEntityType: 'telematics_low_voltage',
          relatedEntityId: vehicleId,
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

        const hasOverspeed = dto.events.some((event) => event.type === 'speeding');
        if (hasOverspeed) {
          notificationTriggers.push({
            tenantId,
            title: `Asiri hiz olayi / ${plateNumber}`,
            message: `Arac ${plateNumber} icin asiri hiz olayi algilandi.`,
            priority: 'low',
            relatedEntityType: 'telematics_overspeed',
            relatedEntityId: vehicleId,
          });
        }
      }

      return {
        accepted: true,
        tenantId,
        vehicleId,
        driverId,
        tripId,
        source: LocationSource.telematics,
        recordedAt: recordedAt.toISOString(),
        notificationTriggers,
      };
    });

    await this.dispatchTelemetryNotifications(ingestResult.notificationTriggers);

    return {
      accepted: ingestResult.accepted,
      tenantId: ingestResult.tenantId,
      vehicleId: ingestResult.vehicleId,
      driverId: ingestResult.driverId,
      tripId: ingestResult.tripId,
      source: ingestResult.source,
      recordedAt: ingestResult.recordedAt,
    };
  }

  private async dispatchTelemetryNotifications(triggers: NotificationTrigger[]): Promise<void> {
    if (triggers.length === 0) {
      return;
    }

    for (const trigger of triggers) {
      // Dedupe by tenant + related entity within a short time window to prevent spam.
      const dedupeCutoff = new Date(Date.now() - NOTIFICATION_DEDUPE_WINDOW_MS);
      const existing = await this.prisma.unscoped.notification.findFirst({
        where: {
          tenantId: trigger.tenantId,
          type: 'system',
          relatedEntityType: trigger.relatedEntityType,
          relatedEntityId: trigger.relatedEntityId,
          createdAt: { gte: dedupeCutoff },
        },
        select: { id: true },
      });

      if (existing) {
        continue;
      }

      const users = await this.prisma.unscoped.user.findMany({
        where: {
          tenantId: trigger.tenantId,
          status: 'active',
          role: { in: NOTIFICATION_OPERATIONAL_ROLES },
        },
        select: { id: true },
      });

      for (const user of users) {
        await this.notificationsService.createNotification({
          tenantId: trigger.tenantId,
          userId: user.id,
          title: trigger.title,
          message: trigger.message,
          type: 'system',
          priority: trigger.priority,
          relatedEntityType: trigger.relatedEntityType,
          relatedEntityId: trigger.relatedEntityId,
        });
      }
    }
  }

  async getTelematicsVehicleHealth() {
    const [vehicles, dtcs] = await Promise.all([
      this.prisma.vehicle.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          plateNumber: true,
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
          description: true,
          severity: true,
          occurredAt: true,
          vehicle: {
            select: {
              plateNumber: true,
            },
          },
        },
        orderBy: { occurredAt: 'desc' },
      }),
    ]);

    const dtcByVehicle = new Map<
      string,
      Array<{ code: string; description: string | null; severity: DtcSeverity; occurredAt: Date }>
    >();
    for (const dtc of dtcs) {
      const rows = dtcByVehicle.get(dtc.vehicleId) ?? [];
      rows.push(dtc);
      dtcByVehicle.set(dtc.vehicleId, rows);
    }

    const items: TelematicsVehicleHealthRow[] = vehicles.map((vehicle) => {
      const vehicleDtcs = dtcByVehicle.get(vehicle.id) ?? [];
      const hasCritical = vehicleDtcs.some((dtc) => dtc.severity === DtcSeverity.critical);
      const openDtcCount = vehicleDtcs.length;

      const telemetry = vehicle.telemetryLatest;
      const fuelLevelPct = telemetry?.fuelLevelPct ? this.decimalToNumber(telemetry.fuelLevelPct) : null;
      const coolantTemp = telemetry?.coolantTemp ? this.decimalToNumber(telemetry.coolantTemp) : null;
      const voltage = telemetry?.voltage ? this.decimalToNumber(telemetry.voltage) : null;
      const odometerKm = telemetry?.odometerKm ? this.decimalToNumber(telemetry.odometerKm) : null;

      let health: TelematicsHealthStatus = 'ok';
      if (hasCritical) {
        health = 'critical';
      } else if (openDtcCount > 0) {
        health = 'warn';
      }

      return {
        vehicleId: vehicle.id,
        plateNumber: vehicle.plateNumber,
        health,
        latest: {
          rpm: telemetry?.rpm ?? null,
          fuelLevelPct,
          coolantTemp,
          voltage,
          odometerKm,
          ignition: telemetry?.ignition ?? null,
          recordedAt: telemetry?.recordedAt.toISOString() ?? null,
        },
        openDtcCount,
      };
    });

    const summary = {
      ok: items.filter((item) => item.health === 'ok').length,
      warn: items.filter((item) => item.health === 'warn').length,
      critical: items.filter((item) => item.health === 'critical').length,
    };

    const openDtcs: TelematicsOpenDtcRow[] = dtcs.map((dtc) => ({
      plateNumber: dtc.vehicle.plateNumber,
      code: dtc.code,
      description: dtc.description,
      severity: dtc.severity,
      occurredAt: dtc.occurredAt.toISOString(),
    }));

    return {
      summary,
      vehicles: items,
      openDtcs,
    };
  }

  async getTelematicsDriverScores() {
    const [tripScoreRows, eventRows] = await Promise.all([
      this.prisma.fleetTrip.groupBy({
        by: ['driverId'],
        where: {
          score: { not: null },
        },
        _avg: { score: true },
      }),
      this.prisma.fleetDrivingEvent.groupBy({
        by: ['driverId', 'type'],
        where: {
          type: {
            in: [
              FleetDrivingEventType.speeding,
              FleetDrivingEventType.harsh_accel,
              FleetDrivingEventType.harsh_brake,
              FleetDrivingEventType.harsh_corner,
              FleetDrivingEventType.crash,
            ],
          },
        },
        _count: { _all: true },
      }),
    ]);

    const driverIds = new Set<string>();
    const tripScoreByDriver = new Map<string, number>();

    for (const row of tripScoreRows) {
      driverIds.add(row.driverId);
      const score = row._avg.score ? this.decimalToNumber(row._avg.score) : null;
      if (score !== null) {
        tripScoreByDriver.set(row.driverId, Number(score.toFixed(1)));
      }
    }

    const eventByDriver = new Map<string, DriverEventCounts>();
    for (const row of eventRows) {
      driverIds.add(row.driverId);
      const current = eventByDriver.get(row.driverId) ?? {
        harshCount: 0,
        overspeedCount: 0,
        crashCount: 0,
      };

      if (row.type === FleetDrivingEventType.speeding) {
        current.overspeedCount += row._count._all;
      }
      if (
        row.type === FleetDrivingEventType.harsh_accel
        || row.type === FleetDrivingEventType.harsh_brake
        || row.type === FleetDrivingEventType.harsh_corner
      ) {
        current.harshCount += row._count._all;
      }
      if (row.type === FleetDrivingEventType.crash) {
        current.crashCount += row._count._all;
      }

      eventByDriver.set(row.driverId, current);
    }

    if (driverIds.size === 0) {
      return {
        fleetAverage: 0,
        drivers: [] as TelematicsDriverScoreRow[],
      };
    }

    const drivers = await this.prisma.driver.findMany({
      where: {
        id: { in: Array.from(driverIds) },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    });

    const items: TelematicsDriverScoreRow[] = drivers.map((driver) => {
      const eventCounts = eventByDriver.get(driver.id) ?? {
        harshCount: 0,
        overspeedCount: 0,
        crashCount: 0,
      };

      const scoreFromTrips = tripScoreByDriver.get(driver.id);
      const score =
        scoreFromTrips
        ?? this.deriveScoreFromEventCounts(eventCounts.overspeedCount, eventCounts.harshCount, eventCounts.crashCount);

      return {
        driverId: driver.id,
        name: `${driver.firstName} ${driver.lastName}`.trim(),
        score,
        harshCount: eventCounts.harshCount,
        overspeedCount: eventCounts.overspeedCount,
      };
    }).sort((a, b) => b.score - a.score);

    const fleetAverage =
      items.length > 0
        ? Number((items.reduce((sum, row) => sum + row.score, 0) / items.length).toFixed(1))
        : 0;

    return {
      fleetAverage,
      drivers: items,
    };
  }

  async getTelematicsVehicleHistory(
    vehicleId: string,
    query: TelematicsVehicleHistoryParams,
    currentUserId: string,
  ) {
    await this.assertVehicleExists(vehicleId);
    const { from, to, limit, metric } = this.resolveTelematicsHistoryQuery(query);

    const where: Prisma.VehicleTelemetryHistoryWhereInput = {
      vehicleId,
      recordedAt: { gte: from, lte: to },
    };

    if (metric) {
      Object.assign(where, { [metric]: { not: null } });
    }

    const rows = await this.prisma.vehicleTelemetryHistory.findMany({
      where,
      orderBy: { recordedAt: 'asc' },
      take: limit,
    });

    await this.logHistoryViewed(currentUserId, 'vehicle', vehicleId, { from, to, limit });

    return {
      vehicleId,
      from: from.toISOString(),
      to: to.toISOString(),
      metric: metric ?? null,
      points: rows.map((row) => ({
        recordedAt: row.recordedAt.toISOString(),
        speedKmh: row.speedKmh,
        rpm: row.rpm,
        fuelLevelPct: row.fuelLevelPct ? this.decimalToNumber(row.fuelLevelPct) : null,
        coolantTemp: row.coolantTemp ? this.decimalToNumber(row.coolantTemp) : null,
        voltage: row.voltage ? this.decimalToNumber(row.voltage) : null,
        odometerKm: row.odometerKm ? this.decimalToNumber(row.odometerKm) : null,
      })),
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

  private async maybePersistTelemetryHistory(
    tx: Prisma.TransactionClient,
    payload: TelematicsHistoryPayload,
  ): Promise<void> {
    const previous = await tx.vehicleTelemetryHistory.findFirst({
      where: { vehicleId: payload.vehicleId },
      orderBy: { recordedAt: 'desc' },
      select: {
        recordedAt: true,
        speedKmh: true,
        rpm: true,
        fuelLevelPct: true,
        coolantTemp: true,
        voltage: true,
        odometerKm: true,
      },
    });

    if (!previous) {
      await tx.vehicleTelemetryHistory.create({ data: payload });
      return;
    }

    const elapsedMs = Math.abs(payload.recordedAt.getTime() - previous.recordedAt.getTime());
    if (elapsedMs >= TELEMETRY_HISTORY_THROTTLE_MS) {
      await tx.vehicleTelemetryHistory.create({ data: payload });
      return;
    }

    if (!this.hasMeaningfulTelemetryHistoryChange(previous, payload)) {
      return;
    }

    await tx.vehicleTelemetryHistory.create({ data: payload });
  }

  private hasMeaningfulTelemetryHistoryChange(
    previous: {
      speedKmh: number | null;
      rpm: number | null;
      fuelLevelPct: Prisma.Decimal | null;
      coolantTemp: Prisma.Decimal | null;
      voltage: Prisma.Decimal | null;
      odometerKm: Prisma.Decimal | null;
    },
    next: TelematicsHistoryPayload,
  ): boolean {
    const speedChanged = this.hasNumericDiff(previous.speedKmh, next.speedKmh, 2);
    const rpmChanged = this.hasNumericDiff(previous.rpm, next.rpm, 50);
    const fuelChanged = this.hasNumericDiff(
      previous.fuelLevelPct ? this.decimalToNumber(previous.fuelLevelPct) : null,
      next.fuelLevelPct ? this.decimalToNumber(next.fuelLevelPct) : null,
      0.5,
    );
    const coolantChanged = this.hasNumericDiff(
      previous.coolantTemp ? this.decimalToNumber(previous.coolantTemp) : null,
      next.coolantTemp ? this.decimalToNumber(next.coolantTemp) : null,
      1,
    );
    const voltageChanged = this.hasNumericDiff(
      previous.voltage ? this.decimalToNumber(previous.voltage) : null,
      next.voltage ? this.decimalToNumber(next.voltage) : null,
      0.1,
    );
    const odometerChanged = this.hasNumericDiff(
      previous.odometerKm ? this.decimalToNumber(previous.odometerKm) : null,
      next.odometerKm ? this.decimalToNumber(next.odometerKm) : null,
      0.05,
    );

    return speedChanged || rpmChanged || fuelChanged || coolantChanged || voltageChanged || odometerChanged;
  }

  private hasNumericDiff(
    previous: number | null,
    next: number | null,
    threshold: number,
  ): boolean {
    if (previous === null && next === null) {
      return false;
    }

    if (previous === null || next === null) {
      return true;
    }

    return Math.abs(previous - next) >= threshold;
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

  private deriveScoreFromEventCounts(
    overspeedCount: number,
    harshCount: number,
    crashCount: number,
  ): number {
    const raw = 100 - overspeedCount * 2 - harshCount * 3 - crashCount * 8;
    return Math.max(0, Math.min(100, Number(raw.toFixed(1))));
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

  private resolveTelematicsHistoryQuery(
    query: TelematicsVehicleHistoryParams,
  ): { from: Date; to: Date; limit: number; metric?: TelematicsMetric } {
    const limit = Math.min(query.limit ?? DEFAULT_TELEMETRY_HISTORY_LIMIT, MAX_TELEMETRY_HISTORY_LIMIT);
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
      from = new Date(to.getTime() - TELEMETRY_HISTORY_LOOKBACK_MS);
    } else {
      from = new Date(now.getTime() - TELEMETRY_HISTORY_LOOKBACK_MS);
      to = now;
    }

    if (from.getTime() > to.getTime()) {
      throw new BadRequestException('from must be less than or equal to to');
    }

    return { from, to, limit, metric: query.metric };
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
