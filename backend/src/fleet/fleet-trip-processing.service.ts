import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FleetTripStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { analyzeTripPoints } from './core/fleet-trip-analysis.util';
import { FLEET_TRIP_PROCESSING_CONFIG } from './core/fleet-trip-processing.config';
import type { ProcessableTripPoint } from './core/fleet-trip-processing.util';

@Injectable()
export class FleetTripProcessingService {
  private readonly logger = new Logger(FleetTripProcessingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async closeAndProcessTrip(tripId: string, endedAt = new Date()) {
    const trip = await this.prisma.fleetTrip.findFirst({
      where: { id: tripId },
      select: { id: true, status: true },
    });

    if (!trip) {
      throw new NotFoundException('Trip not found');
    }

    if (trip.status === FleetTripStatus.active) {
      await this.prisma.fleetTrip.update({
        where: { id: tripId },
        data: {
          status: FleetTripStatus.closed,
          endedAt,
        },
      });
    }

    return this.processTripMetrics(tripId);
  }

  async processTripMetrics(tripId: string) {
    const trip = await this.prisma.fleetTrip.findFirst({
      where: { id: tripId },
      include: {
        locationPoints: {
          orderBy: { recordedAt: 'asc' },
          select: {
            recordedAt: true,
            latitude: true,
            longitude: true,
            speedKmh: true,
            accuracyM: true,
          },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException('Trip not found');
    }

    const endedAt = trip.endedAt ?? new Date();
    const points: ProcessableTripPoint[] = trip.locationPoints.map((point) => ({
      recordedAt: point.recordedAt,
      latitude: Number(point.latitude),
      longitude: Number(point.longitude),
      speedKmh: point.speedKmh,
      accuracyM: point.accuracyM,
    }));

    const analysis = analyzeTripPoints(points, trip.startedAt, endedAt);

    await this.prisma.fleetDrivingEvent.deleteMany({
      where: { tripId },
    });

    if (analysis.events.length > 0) {
      await this.prisma.fleetDrivingEvent.createMany({
        data: analysis.events.map((event) => ({
          tripId,
          driverId: trip.driverId,
          type: event.type,
          occurredAt: event.occurredAt,
          latitude: new Prisma.Decimal(event.latitude),
          longitude: new Prisma.Decimal(event.longitude),
          value: new Prisma.Decimal(event.value),
          threshold: new Prisma.Decimal(event.threshold),
        })),
      });
    }

    return this.prisma.fleetTrip.update({
      where: { id: tripId },
      data: {
        distanceKm: new Prisma.Decimal(analysis.metrics.distanceKm),
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

  async autoStopStaleTrips(): Promise<{ closed: number }> {
    const cutoff = new Date(Date.now() - FLEET_TRIP_PROCESSING_CONFIG.autoStopInactivityMs);
    let closed = 0;

    await TenantContext.runUnscoped(async () => {
      const activeTrips = await this.prisma.unscoped.fleetTrip.findMany({
        where: { status: FleetTripStatus.active },
        select: {
          id: true,
          tenantId: true,
          startedAt: true,
          locationPoints: {
            orderBy: { recordedAt: 'desc' },
            take: 1,
            select: { recordedAt: true },
          },
        },
      });

      for (const trip of activeTrips) {
        const lastActivity = trip.locationPoints[0]?.recordedAt ?? trip.startedAt;
        if (lastActivity > cutoff) {
          continue;
        }

        try {
          await TenantContext.run(trip.tenantId, async () => {
            await this.closeAndProcessTrip(trip.id, new Date());
          });
          closed += 1;
        } catch (error) {
          this.logger.error(
            `Failed to auto-stop trip ${trip.id}: ${error instanceof Error ? error.message : error}`,
          );
        }
      }
    });

    if (closed > 0) {
      this.logger.log(`Auto-stopped ${closed} stale fleet trip(s)`);
    }

    return { closed };
  }
}
