import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssignmentStatus,
  FleetTelemetrySource,
  FleetTripStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WorkSessionsService } from '../work-sessions/work-sessions.service';
import {
  dedupeNormalizedLocationPoints,
  normalizeFleetTripLocationPoints,
} from './core/fleet-trip-locations.util';
import type {
  FleetTripDetail,
  FleetTripLocationPointDto,
  FleetTripSummary,
  FleetTripSummaryWithRelations,
} from './core/fleet-trips.types';
import type { ListFleetTripsQueryDto } from './dto/list-fleet-trips.query';
import { FleetTripProcessingService } from './fleet-trip-processing.service';

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

@Injectable()
export class FleetTripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workSessions: WorkSessionsService,
    private readonly processing: FleetTripProcessingService,
  ) {}

  async startTripForDriver(userId: string, vehicleId: string): Promise<FleetTripSummary> {
    const driver = await this.requireDriverForUser(userId);
    await this.assertDriverAssignedToVehicle(driver.id, vehicleId);

    const activeTrip = await this.prisma.fleetTrip.findFirst({
      where: { driverId: driver.id, status: FleetTripStatus.active },
      orderBy: { startedAt: 'desc' },
    });

    if (activeTrip) {
      if (activeTrip.vehicleId === vehicleId) {
        return this.serializeTrip(activeTrip);
      }
      throw new ConflictException('Driver already has an active trip on another vehicle');
    }

    const context = await this.resolveTripContext(driver.id, vehicleId);
    const trip = await this.prisma.fleetTrip.create({
      data: {
        vehicleId,
        driverId: driver.id,
        source: FleetTelemetrySource.phone,
        startedAt: new Date(),
        status: FleetTripStatus.active,
        assignmentId: context.assignmentId,
        workSessionId: context.workSessionId,
      },
    });

    return this.serializeTrip(trip);
  }

  async stopTripForDriver(userId: string, tripId: string): Promise<FleetTripSummary> {
    const driver = await this.requireDriverForUser(userId);
    await this.requireActiveTripForDriver(tripId, driver.id);

    const closed = await this.processing.closeAndProcessTrip(tripId);
    return this.serializeTrip(closed);
  }

  async appendLocationsForDriver(
    userId: string,
    tripId: string,
    points: FleetTripLocationPointDto[],
  ) {
    const driver = await this.requireDriverForUser(userId);
    await this.requireActiveTripForDriver(tripId, driver.id);

    const normalized = dedupeNormalizedLocationPoints(
      normalizeFleetTripLocationPoints(points),
    );

    const result = await this.prisma.fleetTripLocationPoint.createMany({
      data: normalized.map((point) => ({
        tripId,
        recordedAt: point.recordedAt,
        latitude: new Prisma.Decimal(point.latitude),
        longitude: new Prisma.Decimal(point.longitude),
        speedKmh: point.speedKmh,
        headingDeg: point.headingDeg,
        accuracyM: point.accuracyM,
        source: point.source,
      })),
      skipDuplicates: true,
    });

    return {
      tripId,
      received: points.length,
      deduplicatedInBatch: points.length - normalized.length,
      inserted: result.count,
      skippedDuplicates: normalized.length - result.count,
    };
  }

  async listTrips(query: ListFleetTripsQueryDto): Promise<FleetTripSummaryWithRelations[]> {
    const where = this.buildListWhere(query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 500;

    const trips = await this.prisma.fleetTrip.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        vehicleId: true,
        driverId: true,
        source: true,
        startedAt: true,
        endedAt: true,
        distanceKm: true,
        durationS: true,
        avgSpeedKmh: true,
        maxSpeedKmh: true,
        idleS: true,
        score: true,
        hasDataGap: true,
        status: true,
        assignmentId: true,
        workSessionId: true,
        createdAt: true,
        updatedAt: true,
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
            brand: true,
            model: true,
          },
        },
      },
    });

    return trips.map((trip) => ({
      ...this.serializeTrip(trip),
      driver: trip.driver,
      vehicle: trip.vehicle,
      route: trip.assignmentId ? { assignmentId: trip.assignmentId } : null,
    }));
  }

  async listTripsForDriver(userId: string, query: ListFleetTripsQueryDto): Promise<FleetTripSummary[]> {
    const driver = await this.requireDriverForUser(userId);
    return this.listTrips({ ...query, driverId: driver.id });
  }

  async getTripById(tripId: string): Promise<FleetTripDetail> {
    const trip = await this.prisma.fleetTrip.findFirst({
      where: { id: tripId },
      include: {
        locationPoints: { orderBy: { recordedAt: 'asc' } },
        drivingEvents: { orderBy: { occurredAt: 'asc' } },
      },
    });

    if (!trip) {
      throw new NotFoundException('Trip not found');
    }

    return this.serializeTripDetail(trip);
  }

  async getTripByIdForDriver(userId: string, tripId: string): Promise<FleetTripDetail> {
    const driver = await this.requireDriverForUser(userId);
    const trip = await this.prisma.fleetTrip.findFirst({
      where: { id: tripId, driverId: driver.id },
      include: {
        locationPoints: { orderBy: { recordedAt: 'asc' } },
        drivingEvents: { orderBy: { occurredAt: 'asc' } },
      },
    });

    if (!trip) {
      throw new NotFoundException('Trip not found');
    }

    return this.serializeTripDetail(trip);
  }

  private buildListWhere(query: ListFleetTripsQueryDto): Prisma.FleetTripWhereInput {
    const where: Prisma.FleetTripWhereInput = {};

    if (query.vehicleId) {
      where.vehicleId = query.vehicleId;
    }
    if (query.driverId) {
      where.driverId = query.driverId;
    }
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

    return where;
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

  private async resolveTripContext(driverId: string, vehicleId: string) {
    const { start, end } = this.todayRange();
    const assignments = await this.prisma.assignment.findMany({
      where: {
        driverId,
        vehicleId,
        workDate: { gte: start, lt: end },
        status: { in: TRACKABLE_ASSIGNMENT_STATUSES },
      },
      select: { id: true, status: true },
    });

    let assignmentId: string | null = null;
    for (const status of ASSIGNMENT_STATUS_PRIORITY) {
      const match = assignments.find((assignment) => assignment.status === status);
      if (match) {
        assignmentId = match.id;
        break;
      }
    }

    const workSession = await this.workSessions.getActiveSessionForDriver(driverId);

    return {
      assignmentId,
      workSessionId: workSession?.id ?? null,
    };
  }

  private async requireActiveTripForDriver(tripId: string, driverId: string) {
    const trip = await this.prisma.fleetTrip.findFirst({
      where: { id: tripId, driverId },
    });

    if (!trip) {
      throw new NotFoundException('Trip not found');
    }
    if (trip.status !== FleetTripStatus.active) {
      throw new ConflictException('Trip is not active');
    }

    return trip;
  }

  private todayRange(): { start: Date; end: Date } {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  private serializeTrip(trip: {
    id: string;
    vehicleId: string;
    driverId: string;
    source: FleetTelemetrySource;
    startedAt: Date;
    endedAt: Date | null;
    distanceKm: Prisma.Decimal | null;
    durationS: number | null;
    avgSpeedKmh: Prisma.Decimal | null;
    maxSpeedKmh: Prisma.Decimal | null;
    idleS: number | null;
    score: Prisma.Decimal | null;
    hasDataGap: boolean;
    status: FleetTripStatus;
    assignmentId: string | null;
    workSessionId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): FleetTripSummary {
    return {
      id: trip.id,
      vehicleId: trip.vehicleId,
      driverId: trip.driverId,
      source: trip.source,
      startedAt: trip.startedAt,
      endedAt: trip.endedAt,
      distanceKm: trip.distanceKm,
      durationS: trip.durationS,
      avgSpeedKmh: trip.avgSpeedKmh,
      maxSpeedKmh: trip.maxSpeedKmh,
      idleS: trip.idleS,
      score: trip.score,
      hasDataGap: trip.hasDataGap,
      status: trip.status,
      assignmentId: trip.assignmentId,
      workSessionId: trip.workSessionId,
      createdAt: trip.createdAt,
      updatedAt: trip.updatedAt,
    };
  }

  private serializeTripDetail(trip: {
    id: string;
    vehicleId: string;
    driverId: string;
    source: FleetTelemetrySource;
    startedAt: Date;
    endedAt: Date | null;
    distanceKm: Prisma.Decimal | null;
    durationS: number | null;
    avgSpeedKmh: Prisma.Decimal | null;
    maxSpeedKmh: Prisma.Decimal | null;
    idleS: number | null;
    score: Prisma.Decimal | null;
    hasDataGap: boolean;
    status: FleetTripStatus;
    assignmentId: string | null;
    workSessionId: string | null;
    createdAt: Date;
    updatedAt: Date;
    locationPoints: Array<{
      id: string;
      recordedAt: Date;
      latitude: Prisma.Decimal;
      longitude: Prisma.Decimal;
      speedKmh: number | null;
      headingDeg: number | null;
      accuracyM: number | null;
      source: FleetTelemetrySource;
    }>;
    drivingEvents: Array<{
      id: string;
      type: 'speeding' | 'harsh_accel' | 'harsh_brake';
      occurredAt: Date;
      latitude: Prisma.Decimal;
      longitude: Prisma.Decimal;
      value: Prisma.Decimal;
      threshold: Prisma.Decimal;
    }>;
  }): FleetTripDetail {
    return {
      ...this.serializeTrip(trip),
      locationPoints: trip.locationPoints.map((point) => ({
        id: point.id,
        recordedAt: point.recordedAt.toISOString(),
        lat: Number(point.latitude),
        lng: Number(point.longitude),
        speedKmh: point.speedKmh,
        headingDeg: point.headingDeg,
        accuracyM: point.accuracyM,
        source: point.source,
      })),
      drivingEvents: trip.drivingEvents.map((event) => ({
        id: event.id,
        type: event.type,
        occurredAt: event.occurredAt.toISOString(),
        lat: Number(event.latitude),
        lng: Number(event.longitude),
        value: Number(event.value),
        threshold: Number(event.threshold),
      })),
    };
  }
}
