import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FleetTripStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  computeDriverScoreFromTrips,
  countEventsByType,
  type FleetEventCounts,
} from './core/fleet-driver-score.util';
import type { DriverScoreQueryDto } from './dto/driver-score.query';

export type FleetDriverScoreResponse = {
  driverId: string;
  from: string | null;
  to: string | null;
  score: number;
  tripCount: number;
  totalDistanceKm: number;
  totalDurationS: number;
  idleRatio: number;
  events: FleetEventCounts;
  trips: Array<{
    id: string;
    startedAt: string;
    endedAt: string | null;
    distanceKm: number;
    score: number | null;
    events: FleetEventCounts;
  }>;
};

@Injectable()
export class FleetDriverScoreService {
  constructor(private readonly prisma: PrismaService) {}

  async getDriverScore(driverId: string, query: DriverScoreQueryDto): Promise<FleetDriverScoreResponse> {
    await this.assertDriverExists(driverId);
    const trips = await this.loadClosedTrips(driverId, query);
    return this.buildScoreResponse(driverId, query, trips);
  }

  async getDriverScoreForUser(
    userId: string,
    query: DriverScoreQueryDto,
  ): Promise<FleetDriverScoreResponse> {
    const driver = await this.requireDriverForUser(userId);
    return this.getDriverScore(driver.id, query);
  }

  private async loadClosedTrips(driverId: string, query: DriverScoreQueryDto) {
    const where: Prisma.FleetTripWhereInput = {
      driverId,
      status: FleetTripStatus.closed,
    };

    if (query.from || query.to) {
      const startedAt: Prisma.DateTimeFilter = {};
      if (query.from) {
        startedAt.gte = new Date(query.from);
      }
      if (query.to) {
        const end = new Date(query.to);
        end.setHours(23, 59, 59, 999);
        startedAt.lte = end;
      }
      where.startedAt = startedAt;
    }

    return this.prisma.fleetTrip.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      include: {
        drivingEvents: {
          select: { type: true },
        },
      },
      take: 500,
    });
  }

  private buildScoreResponse(
    driverId: string,
    query: DriverScoreQueryDto,
    trips: Array<{
      id: string;
      startedAt: Date;
      endedAt: Date | null;
      distanceKm: Prisma.Decimal | null;
      durationS: number | null;
      idleS: number | null;
      score: Prisma.Decimal | null;
      drivingEvents: Array<{ type: 'speeding' | 'harsh_accel' | 'harsh_brake' }>;
    }>,
  ): FleetDriverScoreResponse {
    const tripSummaries = trips.map((trip) => {
      const events = countEventsByType(trip.drivingEvents);

      return {
        id: trip.id,
        startedAt: trip.startedAt.toISOString(),
        endedAt: trip.endedAt?.toISOString() ?? null,
        distanceKm: trip.distanceKm ? Number(trip.distanceKm) : 0,
        durationS: trip.durationS ?? 0,
        idleS: trip.idleS ?? 0,
        score: trip.score ? Number(trip.score) : null,
        events,
      };
    });

    const totals = tripSummaries.reduce(
      (acc, trip) => ({
        distanceKm: acc.distanceKm + trip.distanceKm,
        durationS: acc.durationS + trip.durationS,
        idleS: acc.idleS + trip.idleS,
        speeding: acc.speeding + trip.events.speeding,
        harsh_accel: acc.harsh_accel + trip.events.harsh_accel,
        harsh_brake: acc.harsh_brake + trip.events.harsh_brake,
      }),
      {
        distanceKm: 0,
        durationS: 0,
        idleS: 0,
        speeding: 0,
        harsh_accel: 0,
        harsh_brake: 0,
      },
    );

    const score = computeDriverScoreFromTrips(
      tripSummaries.map((trip) => ({
        distanceKm: trip.distanceKm,
        durationS: trip.durationS,
        idleS: trip.idleS,
        events: trip.events,
      })),
    );

    return {
      driverId,
      from: query.from ?? null,
      to: query.to ?? null,
      score,
      tripCount: trips.length,
      totalDistanceKm: Number(totals.distanceKm.toFixed(3)),
      totalDurationS: totals.durationS,
      idleRatio: totals.durationS > 0 ? Number((totals.idleS / totals.durationS).toFixed(4)) : 0,
      events: {
        speeding: totals.speeding,
        harsh_accel: totals.harsh_accel,
        harsh_brake: totals.harsh_brake,
      },
      trips: tripSummaries.map(({ durationS: _durationS, idleS: _idleS, ...trip }) => trip),
    };
  }

  private async assertDriverExists(driverId: string) {
    const driver = await this.prisma.driver.findFirst({
      where: { id: driverId },
      select: { id: true },
    });
    if (!driver) {
      throw new NotFoundException('Driver not found');
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
}
