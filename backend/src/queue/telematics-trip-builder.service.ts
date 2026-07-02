import { Injectable, Logger } from '@nestjs/common';
import {
  FleetDrivingEventType,
  FleetTelemetrySource,
  FleetTripStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { analyzeTripPoints } from '../fleet/core/fleet-trip-analysis.util';
import type { ProcessableTripPoint } from '../fleet/core/fleet-trip-processing.util';
import { TELEMATICS_THRESHOLDS } from './telematics-thresholds';

type TripRecordContext = {
  tenantId: string;
  vehicleId: string;
  driverId: string | null;
  recordedAt: Date;
  latitude: number;
  longitude: number;
  speedKph: number;
  ignition: boolean;
  odometerKm?: number;
  events: Array<{
    type: 'speeding' | 'harsh_accel' | 'harsh_brake' | 'harsh_corner' | 'crash';
    value: number;
    threshold?: number;
  }>;
};

type PendingClose = {
  timer: NodeJS.Timeout;
  vehicleId: string;
};

@Injectable()
export class TelematicsTripBuilderService {
  private readonly logger = new Logger(TelematicsTripBuilderService.name);
  private readonly pendingClose = new Map<string, PendingClose>();
  private readonly lastIgnition = new Map<string, boolean>();
  private readonly tripStartOdometerKm = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  async handleRecord(ctx: TripRecordContext): Promise<void> {
    const prevIgnition = this.lastIgnition.get(ctx.vehicleId) ?? false;
    this.lastIgnition.set(ctx.vehicleId, ctx.ignition);

    if (!ctx.driverId) {
      return;
    }

    if (ctx.ignition && !prevIgnition) {
      await this.cancelPendingClose(ctx.vehicleId);
      await this.openTripIfNeeded(ctx);
    }

    if (!ctx.ignition && prevIgnition) {
      this.scheduleClose(ctx);
    }

    if (ctx.events.length > 0) {
      const trip = await this.findActiveTrip(ctx.tenantId, ctx.vehicleId, ctx.driverId);
      if (trip) {
        await this.prisma.unscoped.fleetDrivingEvent.createMany({
          data: ctx.events.map((event) => ({
            tenantId: ctx.tenantId,
            tripId: trip.id,
            driverId: ctx.driverId!,
            type: this.mapEventType(event.type),
            occurredAt: ctx.recordedAt,
            latitude: new Prisma.Decimal(ctx.latitude),
            longitude: new Prisma.Decimal(ctx.longitude),
            value: new Prisma.Decimal(event.value),
            threshold: new Prisma.Decimal(event.threshold ?? event.value),
          })),
        });
      }
    }
  }

  private async openTripIfNeeded(ctx: TripRecordContext): Promise<void> {
    const existing = await this.findActiveTrip(ctx.tenantId, ctx.vehicleId, ctx.driverId!);
    if (existing) {
      return;
    }

    await this.prisma.unscoped.fleetTrip.create({
      data: {
        tenantId: ctx.tenantId,
        vehicleId: ctx.vehicleId,
        driverId: ctx.driverId!,
        source: FleetTelemetrySource.device,
        startedAt: ctx.recordedAt,
        status: FleetTripStatus.active,
      },
    });

    if (ctx.odometerKm !== undefined) {
      this.tripStartOdometerKm.set(ctx.vehicleId, ctx.odometerKm);
    }
  }

  private scheduleClose(ctx: TripRecordContext): void {
    this.cancelPendingClose(ctx.vehicleId);

    const timer = setTimeout(() => {
      void this.closeTrip(ctx).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`trip close failed vehicle=${ctx.vehicleId} error=${message}`);
      });
    }, TELEMATICS_THRESHOLDS.ignitionOffDebounceMs);

    this.pendingClose.set(ctx.vehicleId, { timer, vehicleId: ctx.vehicleId });
  }

  private cancelPendingClose(vehicleId: string): void {
    const pending = this.pendingClose.get(vehicleId);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingClose.delete(vehicleId);
    }
  }

  private async closeTrip(ctx: TripRecordContext): Promise<void> {
    this.pendingClose.delete(ctx.vehicleId);
    if (!ctx.driverId) {
      return;
    }

    const trip = await this.findActiveTrip(ctx.tenantId, ctx.vehicleId, ctx.driverId);
    if (!trip) {
      return;
    }

    const endedAt = ctx.recordedAt;
    const points = await this.loadTripPoints(ctx.vehicleId, trip.startedAt, endedAt);
    const analysis = analyzeTripPoints(points, trip.startedAt, endedAt);
    const startOdo = this.tripStartOdometerKm.get(ctx.vehicleId);
    const endOdo = ctx.odometerKm;
    const distanceKm =
      startOdo !== undefined && endOdo !== undefined
        ? Math.max(0, endOdo - startOdo)
        : analysis.metrics.distanceKm;
    this.tripStartOdometerKm.delete(ctx.vehicleId);

    await this.prisma.unscoped.fleetTrip.update({
      where: { id: trip.id },
      data: {
        endedAt,
        status: FleetTripStatus.closed,
        distanceKm: new Prisma.Decimal(distanceKm),
        durationS: analysis.metrics.durationS,
        avgSpeedKmh:
          analysis.metrics.avgSpeedKmh === null
            ? null
            : new Prisma.Decimal(analysis.metrics.avgSpeedKmh),
        maxSpeedKmh:
          analysis.metrics.maxSpeedKmh === null
            ? null
            : new Prisma.Decimal(analysis.metrics.maxSpeedKmh),
        idleS: analysis.metrics.idleS,
        hasDataGap: analysis.metrics.hasDataGap,
        score: new Prisma.Decimal(analysis.score),
      },
    });
  }

  private async loadTripPoints(
    vehicleId: string,
    startedAt: Date,
    endedAt: Date,
  ): Promise<ProcessableTripPoint[]> {
    const rows = await this.prisma.unscoped.driverLocationHistory.findMany({
      where: {
        vehicleId,
        recordedAt: { gte: startedAt, lte: endedAt },
        source: 'telematics',
      },
      orderBy: { recordedAt: 'asc' },
      select: {
        latitude: true,
        longitude: true,
        speedMps: true,
        recordedAt: true,
        accuracyM: true,
      },
    });

    return rows.map((row) => ({
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      speedKmh: row.speedMps === null ? 0 : row.speedMps * 3.6,
      recordedAt: row.recordedAt,
      accuracyM: row.accuracyM ?? null,
    }));
  }

  private async findActiveTrip(tenantId: string, vehicleId: string, driverId: string) {
    return this.prisma.unscoped.fleetTrip.findFirst({
      where: {
        tenantId,
        vehicleId,
        driverId,
        source: FleetTelemetrySource.device,
        status: FleetTripStatus.active,
      },
      orderBy: { startedAt: 'desc' },
      select: { id: true, startedAt: true },
    });
  }

  private mapEventType(
    type: TripRecordContext['events'][number]['type'],
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
      default:
        return FleetDrivingEventType.crash;
    }
  }
}
