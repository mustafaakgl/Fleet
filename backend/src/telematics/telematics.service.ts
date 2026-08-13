import { Injectable, NotFoundException } from '@nestjs/common';
import {
  DtcSeverity,
  DriverStatus,
  FleetTelemetrySource,
  FleetTripStatus,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FleetTripsService } from '../fleet/fleet-trips.service';
import {
  computeDriverScoreFromTrips,
  countEventsByType,
  type DriverScoreTripInput,
} from '../fleet/core/fleet-driver-score.util';
import {
  computeMaintenanceRuleStatus,
  type MaintenanceRuleStatusView,
} from '../fleet/core/fleet-maintenance.util';
import { downsampleTimeSeries, mergeScalarSeriesToBuckets } from './telematics-downsample.util';
import type { DriverScoresQueryDto, DriverTripsQueryDto } from './dto/driver-scores.query';

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;
const SILENT_THRESHOLD_MS = 30 * 60 * 1000;
const MAINTENANCE_DUE_KM = 500;
const MAINTENANCE_DUE_DAYS = 7;
const DEFAULT_PERIOD_DAYS = 28;
const INSUFFICIENT_DATA_KM = 100;
const BUCKET_MS_5MIN = 5 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type DeviceStatus = 'online' | 'offline' | 'silent';

@Injectable()
export class TelematicsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fleetTrips: FleetTripsService,
  ) {}

  async getVehicleHealth() {
    const now = new Date();

    const [vehicles, dtcs, devices, maintenanceRules, fuelTheftNotifications] = await Promise.all([
      this.prisma.vehicle.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          plateNumber: true,
          brand: true,
          model: true,
          telemetryLatest: true,
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
        },
        orderBy: { occurredAt: 'desc' },
      }),
      this.prisma.device.findMany({
        select: { vehicleId: true, lastSeenAt: true },
      }),
      this.prisma.fleetMaintenanceRule.findMany({
        select: {
          id: true,
          vehicleId: true,
          name: true,
          intervalKm: true,
          intervalDays: true,
          lastDoneAtKm: true,
          lastDoneAtDate: true,
          createdAt: true,
        },
      }),
      this.prisma.notification.findMany({
        where: { type: NotificationType.fuel_theft_suspected },
        select: { relatedEntityId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const deviceByVehicle = new Map<string, { lastSeenAt: Date | null }>();
    for (const device of devices) {
      if (!device.vehicleId) continue;
      deviceByVehicle.set(device.vehicleId, { lastSeenAt: device.lastSeenAt });
    }

    const dtcByVehicle = new Map<
      string,
      Array<{ code: string; description: string | null; severity: DtcSeverity; occurredAt: Date }>
    >();
    for (const dtc of dtcs) {
      const rows = dtcByVehicle.get(dtc.vehicleId) ?? [];
      rows.push(dtc);
      dtcByVehicle.set(dtc.vehicleId, rows);
    }

    const maintenanceByVehicle = new Map<string, MaintenanceRuleStatusView[]>();
    for (const rule of maintenanceRules) {
      const vehicle = vehicles.find((row) => row.id === rule.vehicleId);
      const odometer = vehicle?.telemetryLatest?.odometerKm
        ? this.decimalToNumber(vehicle.telemetryLatest.odometerKm)
        : 0;
      const status = computeMaintenanceRuleStatus(
        {
          id: rule.id,
          name: rule.name,
          intervalKm: rule.intervalKm ? this.decimalToNumber(rule.intervalKm) : null,
          intervalDays: rule.intervalDays,
          lastDoneAtKm: rule.lastDoneAtKm ? this.decimalToNumber(rule.lastDoneAtKm) : null,
          lastDoneAtDate: rule.lastDoneAtDate,
          createdAt: rule.createdAt,
        },
        odometer,
        now,
      );
      const rows = maintenanceByVehicle.get(rule.vehicleId) ?? [];
      rows.push(status);
      maintenanceByVehicle.set(rule.vehicleId, rows);
    }

    const fuelTheftVehicleIds = new Set(
      fuelTheftNotifications
        .filter((row) => row.relatedEntityId)
        .map((row) => row.relatedEntityId as string),
    );

    let onlineCount = 0;
    let silentCount = 0;
    let criticalDtcVehicles = 0;
    let maintenanceDueCount = 0;

    const items = vehicles.map((vehicle) => {
      const telemetry = vehicle.telemetryLatest;
      const device = deviceByVehicle.get(vehicle.id);
      const vehicleDtcs = dtcByVehicle.get(vehicle.id) ?? [];
      const criticalDtcs = vehicleDtcs.filter((dtc) => dtc.severity === DtcSeverity.critical);
      const maintenanceStatuses = maintenanceByVehicle.get(vehicle.id) ?? [];
      const nextMaintenance = this.pickNextMaintenance(maintenanceStatuses);

      const lastSeenAt = device?.lastSeenAt ?? telemetry?.recordedAt ?? null;
      const deviceStatus = this.resolveDeviceStatus(
        lastSeenAt,
        telemetry?.ignition ?? false,
        telemetry?.recordedAt ?? null,
        now,
      );

      if (device) {
        if (deviceStatus === 'online') onlineCount += 1;
        if (deviceStatus === 'silent') silentCount += 1;
      }

      if (criticalDtcs.length > 0) criticalDtcVehicles += 1;

      const maintenanceDueSoon = this.isMaintenanceDueSoon(nextMaintenance);
      if (maintenanceDueSoon) maintenanceDueCount += 1;

      const fuelLevel = telemetry?.fuelLevelPct ? this.decimalToNumber(telemetry.fuelLevelPct) : null;
      const coolantTemp = telemetry?.coolantTemp ? this.decimalToNumber(telemetry.coolantTemp) : null;
      const voltage = telemetry?.voltage ? this.decimalToNumber(telemetry.voltage) : null;

      return {
        vehicleId: vehicle.id,
        plateNumber: vehicle.plateNumber,
        brand: vehicle.brand,
        model: vehicle.model,
        hasDevice: Boolean(device),
        deviceStatus,
        lastSeenAt: lastSeenAt?.toISOString() ?? null,
        telemetry: telemetry
          ? {
              ignition: telemetry.ignition,
              rpm: telemetry.rpm,
              fuelLevelPct: fuelLevel,
              coolantTemp,
              voltage,
              odometerKm: telemetry.odometerKm ? this.decimalToNumber(telemetry.odometerKm) : null,
              recordedAt: telemetry.recordedAt.toISOString(),
            }
          : null,
        activeDtcs: vehicleDtcs.map((dtc) => ({
          code: dtc.code,
          description: dtc.description,
          severity: dtc.severity,
          occurredAt: dtc.occurredAt.toISOString(),
        })),
        activeDtcCount: vehicleDtcs.length,
        criticalDtcCount: criticalDtcs.length,
        fuelDropFlag: fuelTheftVehicleIds.has(vehicle.id),
        nextMaintenance,
        maintenanceDueSoon,
      };
    });

    const devicesTotal = devices.filter((device) => device.vehicleId).length;

    return {
      generatedAt: now.toISOString(),
      summary: {
        online: onlineCount,
        devicesTotal,
        activeCriticalDtc: criticalDtcVehicles,
        maintenanceDueSoon: maintenanceDueCount,
        silentDevices: silentCount,
        hasAnyDevice: devicesTotal > 0,
      },
      items,
    };
  }

  async getVehicleHealthSeries(vehicleId: string, window: '24h' | '7d') {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, deletedAt: null },
      select: {
        id: true,
        plateNumber: true,
        telemetryLatest: true,
      },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const now = new Date();
    if (window === '24h') {
      return this.build24hSeries(vehicleId, vehicle.telemetryLatest, now);
    }

    return this.build7dFuelSeries(vehicleId, vehicle.telemetryLatest, now);
  }

  async getDriverScores(query: DriverScoresQueryDto) {
    const now = new Date();
    const to = query.to ? new Date(query.to) : now;
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - DEFAULT_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    const sourceFilter = this.tripSourceFilter(query.source);
    const trendFrom = new Date(to.getTime() - 12 * WEEK_MS);
    const sparkFrom = new Date(to.getTime() - 8 * WEEK_MS);

    const [trips, drivers] = await Promise.all([
      this.prisma.fleetTrip.findMany({
        where: {
          startedAt: { gte: trendFrom, lte: to },
          status: FleetTripStatus.closed,
          ...sourceFilter,
        },
        select: {
          id: true,
          driverId: true,
          startedAt: true,
          endedAt: true,
          distanceKm: true,
          durationS: true,
          idleS: true,
          drivingEvents: { select: { type: true } },
        },
      }),
      this.prisma.driver.findMany({
        where: { status: { not: DriverStatus.terminated } },
        select: { id: true, firstName: true, lastName: true, status: true },
      }),
    ]);

    const periodTrips = trips.filter((trip) => trip.startedAt >= from);
    const tripsByDriver = new Map<string, typeof trips>();
    const periodTripsByDriver = new Map<string, typeof trips>();

    for (const trip of trips) {
      const all = tripsByDriver.get(trip.driverId) ?? [];
      all.push(trip);
      tripsByDriver.set(trip.driverId, all);

      if (trip.startedAt >= from) {
        const period = periodTripsByDriver.get(trip.driverId) ?? [];
        period.push(trip);
        periodTripsByDriver.set(trip.driverId, period);
      }
    }

    const fleetTrend = this.buildWeeklyFleetTrend(trips, to, 12);
    const driverIds = new Set([...tripsByDriver.keys(), ...drivers.map((driver) => driver.id)]);

    const items = Array.from(driverIds)
      .map((driverId) => {
        const driver = drivers.find((row) => row.id === driverId);
        if (!driver) return null;

        const driverPeriodTrips = periodTripsByDriver.get(driverId) ?? [];
        const driverAllTrips = tripsByDriver.get(driverId) ?? [];
        const tripInputs = driverPeriodTrips.map((trip) => this.toScoreTripInput(trip));
        const distanceKm = tripInputs.reduce((acc, trip) => acc + trip.distanceKm, 0);
        const insufficientData = distanceKm < INSUFFICIENT_DATA_KM;

        const score = insufficientData ? null : computeDriverScoreFromTrips(tripInputs);
        const weeklyScores = this.buildWeeklyDriverScores(driverAllTrips.filter((trip) => trip.startedAt >= sparkFrom), to, 8);
        const weeklyDelta = this.computeWeeklyDelta(driverAllTrips, to);

        const eventTotals = countEventsByType(
          driverPeriodTrips.flatMap((trip) => trip.drivingEvents),
        );
        const per100Km = (count: number) =>
          distanceKm > 0 ? Number(((count / distanceKm) * 100).toFixed(2)) : 0;

        const periodDays = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)));
        const idleMinPerDay =
          tripInputs.length > 0
            ? Number(
                (
                  tripInputs.reduce((acc, trip) => acc + trip.idleS, 0) /
                  60 /
                  periodDays
                ).toFixed(1),
              )
            : 0;

        const name = `${driver.firstName} ${driver.lastName}`.trim();

        return {
          driverId: driver.id,
          driverName: name,
          initials: this.driverInitials(name),
          driverStatus: driver.status,
          score,
          weeklyDelta,
          weeklyScores,
          insufficientData,
          distanceKm: Number(distanceKm.toFixed(1)),
          speedingPer100Km: per100Km(eventTotals.speeding),
          harshBrakePer100Km: per100Km(eventTotals.harsh_brake),
          harshAccelPer100Km: per100Km(eventTotals.harsh_accel),
          idleMinPerDay,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => {
        if (a.insufficientData !== b.insufficientData) {
          return a.insufficientData ? 1 : -1;
        }
        return (b.score ?? 0) - (a.score ?? 0);
      });

    return {
      generatedAt: now.toISOString(),
      from: from.toISOString(),
      to: to.toISOString(),
      periodDays: DEFAULT_PERIOD_DAYS,
      fleetTrend,
      targetScore: 80,
      items,
    };
  }

  async getDriverTrips(driverId: string, query: DriverTripsQueryDto) {
    const driver = await this.prisma.driver.findFirst({
      where: { id: driverId, status: { not: DriverStatus.terminated } },
      select: { id: true, firstName: true, lastName: true },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const now = new Date();
    const to = query.to ? new Date(query.to) : now;
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - DEFAULT_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    const trips = await this.prisma.fleetTrip.findMany({
      where: {
        driverId,
        startedAt: { gte: from, lte: to },
        status: FleetTripStatus.closed,
        ...this.tripSourceFilter(query.source),
      },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        startedAt: true,
        endedAt: true,
        distanceKm: true,
        durationS: true,
        score: true,
        drivingEvents: { select: { type: true } },
      },
    });

    const detailed = await Promise.all(
      trips.map(async (trip) => {
        const detail = await this.fleetTrips.getTripById(trip.id);
        const events = countEventsByType(trip.drivingEvents);
        return {
          id: trip.id,
          startedAt: trip.startedAt.toISOString(),
          endedAt: trip.endedAt?.toISOString() ?? null,
          distanceKm: trip.distanceKm ? this.decimalToNumber(trip.distanceKm) : 0,
          durationS: trip.durationS ?? 0,
          score: trip.score ? this.decimalToNumber(trip.score) : null,
          eventCounts: events,
          locationPoints: detail.locationPoints,
          drivingEvents: detail.drivingEvents,
        };
      }),
    );

    return {
      driverId,
      driverName: `${driver.firstName} ${driver.lastName}`.trim(),
      from: from.toISOString(),
      to: to.toISOString(),
      items: detailed,
    };
  }

  private async build24hSeries(
    vehicleId: string,
    telemetryLatest: {
      coolantTemp: Prisma.Decimal | null;
      voltage: Prisma.Decimal | null;
      recordedAt: Date;
    } | null,
    now: Date,
  ) {
    const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [locationPoints, trips] = await Promise.all([
      this.prisma.fleetTripLocationPoint.findMany({
        where: {
          recordedAt: { gte: windowStart, lte: now },
          trip: { vehicleId },
        },
        select: { recordedAt: true, speedKmh: true },
        orderBy: { recordedAt: 'asc' },
      }),
      this.prisma.fleetTrip.findMany({
        where: {
          vehicleId,
          startedAt: { lte: now },
          OR: [{ endedAt: { gte: windowStart } }, { endedAt: null }],
        },
        select: { startedAt: true, endedAt: true },
        orderBy: { startedAt: 'asc' },
      }),
    ]);

    const speedBuckets = downsampleTimeSeries(
      locationPoints.map((point) => ({
        recordedAt: point.recordedAt,
        value: point.speedKmh !== null && point.speedKmh !== undefined ? Number(point.speedKmh) : null,
      })),
      { bucketMs: BUCKET_MS_5MIN, windowStart, windowEnd: now },
    );

    const coolant = telemetryLatest?.coolantTemp ? this.decimalToNumber(telemetryLatest.coolantTemp) : null;
    const voltage = telemetryLatest?.voltage ? this.decimalToNumber(telemetryLatest.voltage) : null;
    const coolantBuckets = mergeScalarSeriesToBuckets(speedBuckets, coolant);
    const voltageBuckets = mergeScalarSeriesToBuckets(speedBuckets, voltage);

    const ignitionPeriods = trips
      .map((trip) => ({
        start: (trip.startedAt < windowStart ? windowStart : trip.startedAt).toISOString(),
        end: (trip.endedAt ?? now).toISOString(),
      }))
      .filter((period) => new Date(period.start).getTime() < new Date(period.end).getTime());

    return {
      window: '24h' as const,
      generatedAt: now.toISOString(),
      speed: speedBuckets.map((bucket) => ({
        at: bucket.bucketStart,
        kmh: bucket.value,
      })),
      coolant: coolantBuckets.map((bucket) => ({
        at: bucket.bucketStart,
        celsius: bucket.value,
        isEstimated: coolant !== null,
      })),
      voltage: voltageBuckets.map((bucket) => ({
        at: bucket.bucketStart,
        volts: bucket.value,
        isEstimated: voltage !== null,
      })),
      ignitionPeriods,
    };
  }

  private async build7dFuelSeries(
    vehicleId: string,
    telemetryLatest: { fuelLevelPct: Prisma.Decimal | null; recordedAt: Date } | null,
    now: Date,
  ) {
    const windowStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [fuelEntries, fuelTheftNotifications] = await Promise.all([
      this.prisma.fleetFuelEntry.findMany({
        // BILINCLI olarak is akisi durumuna gore FILTRELENMIYOR: bu seri bir
        // MALI rapor degil, yakit seviyesi grafiginin uzerine konan dolum
        // isaretleri ve tek bir para alani tasimiyor. `approved` sartı
        // konsaydi, gercekten yapilmis ama heniz onaylanmamis bir dolum
        // grafikte gorunmez ve seviyedeki artis "aciklanamayan" gibi okunurdu
        // — yani yanlis hirsizlik suphesi uretirdi.
        //
        // Litresi bilinmeyen TASLAK fis yine de disarida: hacmi bilinmeyen bir
        // dolum isareti grafige hicbir sey anlatmaz.
        where: {
          vehicleId,
          enteredAt: { gte: windowStart, lte: now },
          liters: { not: null },
        },
        select: { id: true, enteredAt: true, liters: true, odometerKm: true },
        orderBy: { enteredAt: 'asc' },
      }),
      this.prisma.notification.findMany({
        where: {
          type: NotificationType.fuel_theft_suspected,
          relatedEntityId: vehicleId,
          createdAt: { gte: windowStart, lte: now },
        },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const latestFuel = telemetryLatest?.fuelLevelPct
      ? this.decimalToNumber(telemetryLatest.fuelLevelPct)
      : null;

    const hourlyBuckets: Array<{ at: string; pct: number | null; isEstimated: boolean }> = [];
    for (let offset = 0; offset < 7 * 24; offset += 1) {
      const at = new Date(windowStart.getTime() + offset * HOUR_MS);
      hourlyBuckets.push({
        at: at.toISOString(),
        pct: latestFuel,
        isEstimated: latestFuel !== null,
      });
    }

    return {
      window: '7d' as const,
      generatedAt: now.toISOString(),
      fuelLevel: hourlyBuckets,
      refuelPoints: fuelEntries.map((entry) => ({
        at: entry.enteredAt.toISOString(),
        liters: entry.liters ? this.decimalToNumber(entry.liters) : null,
        odometerKm: entry.odometerKm ? this.decimalToNumber(entry.odometerKm) : null,
      })),
      suspiciousDrops: fuelTheftNotifications.map((row) => ({
        at: row.createdAt.toISOString(),
      })),
    };
  }

  private resolveDeviceStatus(
    lastSeenAt: Date | null,
    ignition: boolean,
    lastTelemetryAt: Date | null,
    now: Date,
  ): DeviceStatus {
    const seenAt = lastSeenAt ?? lastTelemetryAt;
    if (!seenAt) return 'offline';

    const ageMs = now.getTime() - seenAt.getTime();
    if (ageMs <= ONLINE_THRESHOLD_MS) return 'online';

    const telemetryAgeMs = lastTelemetryAt ? now.getTime() - lastTelemetryAt.getTime() : ageMs;
    if (ignition && telemetryAgeMs > SILENT_THRESHOLD_MS) return 'silent';

    return 'offline';
  }

  private pickNextMaintenance(
    rules: MaintenanceRuleStatusView[],
  ): MaintenanceRuleStatusView | null {
    if (rules.length === 0) return null;

    return [...rules].sort((a, b) => {
      const aKm = a.remainingKm ?? Number.POSITIVE_INFINITY;
      const bKm = b.remainingKm ?? Number.POSITIVE_INFINITY;
      if (aKm !== bKm) return aKm - bKm;
      const aDays = a.remainingDays ?? Number.POSITIVE_INFINITY;
      const bDays = b.remainingDays ?? Number.POSITIVE_INFINITY;
      return aDays - bDays;
    })[0] ?? null;
  }

  private isMaintenanceDueSoon(rule: MaintenanceRuleStatusView | null): boolean {
    if (!rule) return false;
    const kmDue = rule.remainingKm !== null && rule.remainingKm <= MAINTENANCE_DUE_KM;
    const daysDue = rule.remainingDays !== null && rule.remainingDays <= MAINTENANCE_DUE_DAYS;
    return kmDue || daysDue || rule.status === 'overdue';
  }

  private tripSourceFilter(source?: 'all' | 'device' | 'phone'): Prisma.FleetTripWhereInput {
    if (!source || source === 'all') return {};
    return {
      source: source === 'device' ? FleetTelemetrySource.device : FleetTelemetrySource.phone,
    };
  }

  private toScoreTripInput(trip: {
    distanceKm: Prisma.Decimal | null;
    durationS: number | null;
    idleS: number | null;
    drivingEvents: Array<{ type: import('@prisma/client').FleetDrivingEventType }>;
  }): DriverScoreTripInput {
    return {
      distanceKm: trip.distanceKm ? this.decimalToNumber(trip.distanceKm) : 0,
      durationS: trip.durationS ?? 0,
      idleS: trip.idleS ?? 0,
      events: countEventsByType(trip.drivingEvents),
    };
  }

  private buildWeeklyFleetTrend(
    trips: Array<{
      driverId: string;
      startedAt: Date;
      distanceKm: Prisma.Decimal | null;
      durationS: number | null;
      idleS: number | null;
      drivingEvents: Array<{ type: import('@prisma/client').FleetDrivingEventType }>;
    }>,
    to: Date,
    weeks: number,
  ) {
    const buckets = this.weekBuckets(to, weeks);
    return buckets.map((bucket) => {
      const weekTrips = trips.filter(
        (trip) => trip.startedAt >= bucket.start && trip.startedAt < bucket.end,
      );
      const byDriver = new Map<string, DriverScoreTripInput[]>();
      for (const trip of weekTrips) {
        const rows = byDriver.get(trip.driverId) ?? [];
        rows.push(this.toScoreTripInput(trip));
        byDriver.set(trip.driverId, rows);
      }

      const scores = Array.from(byDriver.values())
        .map((driverTrips) => computeDriverScoreFromTrips(driverTrips))
        .filter((score) => Number.isFinite(score));

      const average =
        scores.length > 0
          ? Number((scores.reduce((acc, score) => acc + score, 0) / scores.length).toFixed(1))
          : null;

      return {
        weekStart: bucket.start.toISOString(),
        averageScore: average,
      };
    });
  }

  private buildWeeklyDriverScores(
    trips: Array<{
      startedAt: Date;
      distanceKm: Prisma.Decimal | null;
      durationS: number | null;
      idleS: number | null;
      drivingEvents: Array<{ type: import('@prisma/client').FleetDrivingEventType }>;
    }>,
    to: Date,
    weeks: number,
  ) {
    return this.weekBuckets(to, weeks).map((bucket) => {
      const weekTrips = trips.filter(
        (trip) => trip.startedAt >= bucket.start && trip.startedAt < bucket.end,
      );
      if (weekTrips.length === 0) return null;
      return computeDriverScoreFromTrips(weekTrips.map((trip) => this.toScoreTripInput(trip)));
    });
  }

  private computeWeeklyDelta(
    trips: Array<{
      startedAt: Date;
      distanceKm: Prisma.Decimal | null;
      durationS: number | null;
      idleS: number | null;
      drivingEvents: Array<{ type: import('@prisma/client').FleetDrivingEventType }>;
    }>,
    to: Date,
  ): number | null {
    const [current, previous] = this.weekBuckets(to, 2);
    const currentTrips = trips.filter(
      (trip) => trip.startedAt >= current.start && trip.startedAt < current.end,
    );
    const previousTrips = trips.filter(
      (trip) => trip.startedAt >= previous.start && trip.startedAt < previous.end,
    );

    if (currentTrips.length === 0 || previousTrips.length === 0) return null;

    const currentScore = computeDriverScoreFromTrips(
      currentTrips.map((trip) => this.toScoreTripInput(trip)),
    );
    const previousScore = computeDriverScoreFromTrips(
      previousTrips.map((trip) => this.toScoreTripInput(trip)),
    );

    return Number((currentScore - previousScore).toFixed(1));
  }

  private weekBuckets(to: Date, count: number) {
    const endAnchor = this.startOfWeek(to);
    const buckets: Array<{ start: Date; end: Date }> = [];
    for (let index = count - 1; index >= 0; index -= 1) {
      const start = new Date(endAnchor.getTime() - index * WEEK_MS);
      const end = new Date(start.getTime() + WEEK_MS);
      buckets.push({ start, end });
    }
    return buckets;
  }

  private startOfWeek(date: Date): Date {
    const copy = new Date(date);
    copy.setUTCHours(0, 0, 0, 0);
    const day = copy.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    copy.setUTCDate(copy.getUTCDate() + diff);
    return copy;
  }

  private driverInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
    return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
  }

  private decimalToNumber(value: Prisma.Decimal): number {
    return Number(value.toString());
  }
}
