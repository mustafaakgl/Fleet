import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Optional,
  LockedException,
  NotFoundException,
} from '@nestjs/common';
import {
  AssignmentStatus,
  FleetDrivingEventType,
  FleetTelemetrySource,
  FleetTripStatus,
  TripPurpose,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { safeAuditLog } from '../audit/audit-helper';
import { WorkSessionsService } from '../work-sessions/work-sessions.service';
import {
  dedupeNormalizedLocationPoints,
  normalizeFleetTripLocationPoints,
} from './core/fleet-trip-locations.util';
import { findLargestTripDataGap } from './core/fleet-trip-gap.util';
import { deriveTripStops } from './core/fleet-trip-stops.util';
import { formatTripPurposeLockAt, isTripPurposeLocked } from './core/trip-purpose-lock.util';
import type {
  FleetTripDetail,
  FleetTripLocationPointDto,
  FleetTripSummary,
  FleetTripSummaryWithRelations,
  FleetTripTimelineDay,
  FleetTripTimelineResponse,
  FleetTripTimelineTrip,
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
    @Optional() private readonly auditService?: AuditService,
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

  async listTrips(query: ListFleetTripsQueryDto): Promise<FleetTripTimelineResponse> {
    const where = this.buildListWhere(query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 500;

    const trips = await this.prisma.fleetTrip.findMany({
      where,
      orderBy: { startedAt: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        vehicleId: true,
        driverId: true,
        source: true,
        purpose: true,
        purposeNote: true,
        businessContact: true,
        classifiedAt: true,
        classifiedById: true,
        purposeLockedAt: true,
        odoStartKm: true,
        odoEndKm: true,
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
        locationPoints: {
          orderBy: { recordedAt: 'asc' },
          select: {
            recordedAt: true,
            latitude: true,
            longitude: true,
          },
        },
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
        assignment: {
          select: {
            id: true,
            pickupAddress: true,
            deliveryAddress: true,
            routeName: true,
            cargoName: true,
            company: {
              select: { name: true },
            },
          },
        },
      },
    });

    const timelineTrips = trips.map((trip) => this.serializeTimelineTrip(trip));
    const timelineDays = this.buildTimelineDays(timelineTrips);

    return {
      from: query.from ?? null,
      to: query.to ?? null,
      totalTrips: timelineTrips.length,
      totalDistanceKm: round(timelineTrips.reduce((sum, trip) => sum + (Number(trip.distanceKm) || 0), 0), 3),
      totalDrivingS: timelineTrips.reduce((sum, trip) => sum + (trip.durationS ?? 0), 0),
      dataGapCount: timelineTrips.filter((trip) => trip.dataGapDurationS != null).length,
      days: timelineDays,
    };
  }

  async listTripsForDriver(userId: string, query: ListFleetTripsQueryDto): Promise<FleetTripTimelineResponse> {
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

  async setTripPurpose(
    userId: string,
    tripId: string,
    purpose: TripPurpose,
    payload: { note?: string; businessContact?: string; reason?: string },
  ): Promise<FleetTripDetail> {
    const operator = await this.requireOperatorForUser(userId);
    const trip = await this.prisma.fleetTrip.findFirst({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException('Trip not found');
    }

    this.assertTripPurposeEditable(trip);
    this.assertTripPurposePayload(purpose, payload);

    const updated = await this.prisma.fleetTrip.update({
      where: { id: tripId },
      data: {
        purpose,
        purposeNote: payload.note ?? null,
        businessContact: payload.businessContact ?? null,
        classifiedAt: new Date(),
        classifiedById: operator.id,
        purposeLockedAt: trip.endedAt ? formatTripPurposeLockAt(trip.endedAt) : trip.purposeLockedAt,
      },
      include: {
        locationPoints: { orderBy: { recordedAt: 'asc' } },
        drivingEvents: { orderBy: { occurredAt: 'asc' } },
      },
    });

    if (this.auditService) {
      await safeAuditLog(this.auditService, {
        actorUserId: operator.id,
        action: 'fleet.trip.purpose.update',
        entityType: 'FleetTrip',
        entityId: tripId,
        summary: `Trip purpose set to ${purpose}`,
        metadata: {
          purpose,
          note: payload.note ?? null,
          businessContact: payload.businessContact ?? null,
          reason: payload.reason ?? null,
        },
      });
    }

    await this.prisma.fleetTripPurposeLog.create({
      data: {
        tenantId: trip.tenantId,
        tripId,
        oldPurpose: trip.purpose,
        newPurpose: purpose,
        oldNote: trip.purposeNote,
        newNote: payload.note ?? null,
        changedById: operator.id,
        reason: payload.reason ?? null,
      },
    });

    return this.serializeTripDetail(updated);
  }

  async bulkSetTripPurpose(
    userId: string,
    tripIds: string[],
    purpose: TripPurpose,
    payload: { reason?: string },
  ): Promise<{ updated: number }> {
    const operator = await this.requireOperatorForUser(userId);
    const trips = await this.prisma.fleetTrip.findMany({
      where: { id: { in: tripIds } },
    });

    if (trips.length !== tripIds.length) {
      throw new NotFoundException('One or more trips not found');
    }

    for (const trip of trips) {
      this.assertTripPurposeEditable(trip);
    }

    const now = new Date();
    for (const trip of trips) {
      await this.prisma.fleetTrip.update({
        where: { id: trip.id },
        data: {
          purpose,
          classifiedAt: now,
          classifiedById: operator.id,
          purposeLockedAt: trip.endedAt ? formatTripPurposeLockAt(trip.endedAt) : trip.purposeLockedAt,
        },
      });

      await this.prisma.fleetTripPurposeLog.create({
        data: {
          tenantId: trip.tenantId,
          tripId: trip.id,
          oldPurpose: trip.purpose,
          newPurpose: purpose,
          oldNote: trip.purposeNote,
          newNote: trip.purposeNote,
          changedById: operator.id,
          reason: payload.reason ?? null,
        },
      });
    }

    if (this.auditService) {
      await safeAuditLog(this.auditService, {
        actorUserId: operator.id,
        action: 'fleet.trip.purpose.bulk_update',
        entityType: 'FleetTrip',
        summary: `Bulk trip purpose set to ${purpose} for ${tripIds.length} trips`,
        metadata: {
          purpose,
          tripIds,
          reason: payload.reason ?? null,
        },
      });
    }

    return { updated: tripIds.length };
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

  private async requireOperatorForUser(userId: string) {
    const operator = await this.prisma.user.findFirst({
      where: { id: userId },
      select: { id: true },
    });

    if (!operator) {
      throw new ForbiddenException('User not found');
    }

    return operator;
  }

  private assertTripPurposeEditable(trip: { endedAt: Date | null; purposeLockedAt: Date | null }) {
    if (trip.endedAt && isTripPurposeLocked(trip.endedAt)) {
      throw new LockedException('Trip purpose is locked');
    }
  }

  private assertTripPurposePayload(
    purpose: TripPurpose,
    payload: { note?: string; businessContact?: string },
  ) {
    if (purpose === TripPurpose.business && !payload.note?.trim()) {
      throw new BadRequestException('Business trips require a note');
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
    purpose: TripPurpose | null;
    purposeNote: string | null;
    businessContact: string | null;
    classifiedAt: Date | null;
    classifiedById: string | null;
    purposeLockedAt: Date | null;
    odoStartKm: Prisma.Decimal | null;
    odoEndKm: Prisma.Decimal | null;
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
      purpose: trip.purpose,
      purposeNote: trip.purposeNote,
      businessContact: trip.businessContact,
      classifiedAt: trip.classifiedAt,
      classifiedById: trip.classifiedById,
      purposeLockedAt: trip.purposeLockedAt,
      odoStartKm: trip.odoStartKm == null ? null : Number(trip.odoStartKm),
      odoEndKm: trip.odoEndKm == null ? null : Number(trip.odoEndKm),
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
    purpose: TripPurpose | null;
    purposeNote: string | null;
    businessContact: string | null;
    classifiedAt: Date | null;
    classifiedById: string | null;
    purposeLockedAt: Date | null;
    odoStartKm: Prisma.Decimal | null;
    odoEndKm: Prisma.Decimal | null;
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
      type: FleetDrivingEventType;
      occurredAt: Date;
      latitude: Prisma.Decimal;
      longitude: Prisma.Decimal;
      value: Prisma.Decimal;
      threshold: Prisma.Decimal;
    }>;
  }): FleetTripDetail {
    const isPrivateTrip = trip.purpose === TripPurpose.private;
    const dataGap = findLargestTripDataGap(
      trip.locationPoints.map((point) => ({ recordedAt: point.recordedAt })),
    );

    return {
      ...this.serializeTrip(trip),
      dataGapStartAt: isPrivateTrip ? null : dataGap?.startedAt.toISOString() ?? null,
      dataGapEndAt: isPrivateTrip ? null : dataGap?.endedAt.toISOString() ?? null,
      dataGapDurationS: isPrivateTrip ? null : dataGap?.durationS ?? null,
      locationPoints: isPrivateTrip
        ? []
        : trip.locationPoints.map((point) => ({
            id: point.id,
            recordedAt: point.recordedAt.toISOString(),
            lat: Number(point.latitude),
            lng: Number(point.longitude),
            speedKmh: point.speedKmh,
            headingDeg: point.headingDeg,
            accuracyM: point.accuracyM,
            source: point.source,
          })),
      drivingEvents: isPrivateTrip
        ? []
        : trip.drivingEvents.map((event) => ({
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

  private serializeTimelineTrip(trip: {
    id: string;
    vehicleId: string;
    driverId: string;
    source: FleetTelemetrySource;
    purpose: TripPurpose | null;
    purposeNote: string | null;
    businessContact: string | null;
    classifiedAt: Date | null;
    classifiedById: string | null;
    purposeLockedAt: Date | null;
    odoStartKm: Prisma.Decimal | null;
    odoEndKm: Prisma.Decimal | null;
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
      recordedAt: Date;
      latitude: Prisma.Decimal;
      longitude: Prisma.Decimal;
    }>;
    driver: { id: string; firstName: string; lastName: string };
    vehicle: { id: string; plateNumber: string; brand: string; model: string };
    assignment: {
      id: string;
      pickupAddress: string | null;
      deliveryAddress: string | null;
      routeName: string | null;
      cargoName: string | null;
      company: { name: string };
    } | null;
  }): FleetTripTimelineTrip {
    const dataGap = findLargestTripDataGap(
      trip.locationPoints.map((point) => ({ recordedAt: point.recordedAt })),
    );
    const startPoint = trip.locationPoints[0] ?? null;
    const endPoint = trip.locationPoints.length > 0 ? trip.locationPoints[trip.locationPoints.length - 1] : null;
    const isPrivateTrip = trip.purpose === TripPurpose.private;
    const routeStartLabel = trip.assignment?.pickupAddress ?? trip.assignment?.routeName ?? trip.assignment?.cargoName ?? null;
    const routeEndLabel = trip.assignment?.deliveryAddress ?? trip.assignment?.company?.name ?? null;

    return {
      ...this.serializeTrip(trip),
      kind: 'trip',
      routeStartLabel: isPrivateTrip ? null : routeStartLabel,
      routeEndLabel: isPrivateTrip ? null : routeEndLabel,
      routeStartLatitude: isPrivateTrip || !startPoint ? null : Number(startPoint.latitude),
      routeStartLongitude: isPrivateTrip || !startPoint ? null : Number(startPoint.longitude),
      routeEndLatitude: isPrivateTrip || !endPoint ? null : Number(endPoint.latitude),
      routeEndLongitude: isPrivateTrip || !endPoint ? null : Number(endPoint.longitude),
      odoStartKm: trip.odoStartKm == null ? null : Number(trip.odoStartKm),
      odoEndKm: trip.odoEndKm == null ? null : Number(trip.odoEndKm),
      dataGapStartAt: isPrivateTrip ? null : dataGap?.startedAt.toISOString() ?? null,
      dataGapEndAt: isPrivateTrip ? null : dataGap?.endedAt.toISOString() ?? null,
      dataGapDurationS: isPrivateTrip ? null : dataGap?.durationS ?? null,
      driver: trip.driver,
      vehicle: trip.vehicle,
      route: trip.assignmentId ? { assignmentId: trip.assignmentId } : null,
    };
  }

  private buildTimelineDays(trips: FleetTripTimelineTrip[]): FleetTripTimelineDay[] {
    const grouped = new Map<string, FleetTripTimelineTrip[]>();

    for (const trip of trips) {
      const dayKey = this.dayKey(trip.startedAt);
      const current = grouped.get(dayKey) ?? [];
      current.push(trip);
      grouped.set(dayKey, current);
    }

    return Array.from(grouped.entries())
      .sort(([left], [right]) => right.localeCompare(left))
      .map(([dayKey, dayTrips]) => {
        const sortedTrips = dayTrips.slice().sort((left, right) => left.startedAt.getTime() - right.startedAt.getTime());
        const stops = deriveTripStops(
          sortedTrips.map((trip) => ({
            tripId: trip.id,
            startedAt: trip.startedAt,
            endedAt: trip.endedAt,
            startCoordinate:
              trip.routeStartLatitude != null && trip.routeStartLongitude != null
                ? { lat: trip.routeStartLatitude, lng: trip.routeStartLongitude }
                : null,
            endCoordinate:
              trip.routeEndLatitude != null && trip.routeEndLongitude != null
                ? { lat: trip.routeEndLatitude, lng: trip.routeEndLongitude }
                : null,
            routeStartLabel: trip.routeStartLabel ?? null,
            routeEndLabel: trip.routeEndLabel ?? null,
          })),
        );
        const stopByAfterTripId = new Map(stops.map((stop) => [stop.afterTripId, stop]));

        const entries = sortedTrips.flatMap((trip) => {
          const stop = stopByAfterTripId.get(trip.id);
          return stop ? [trip, stop] : [trip];
        });

        return {
          dayKey,
          label: dayKey,
          tripCount: sortedTrips.length,
          totalKm: round(sortedTrips.reduce((sum, trip) => sum + (Number(trip.distanceKm) || 0), 0), 3),
          totalDrivingS: sortedTrips.reduce((sum, trip) => sum + (trip.durationS ?? 0), 0),
          dayOdoStartKm: this.firstDefined(sortedTrips.map((trip) => trip.odoStartKm ?? null)),
          dayOdoEndKm: this.lastDefined(sortedTrips.map((trip) => trip.odoEndKm ?? null)),
          entries,
        };
      });
  }

  private dayKey(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private firstDefined(values: Array<number | null>): number | null {
    for (const value of values) {
      if (value != null) return value;
    }
    return null;
  }

  private lastDefined(values: Array<number | null>): number | null {
    for (let index = values.length - 1; index >= 0; index -= 1) {
      if (values[index] != null) return values[index] as number;
    }
    return null;
  }

}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
