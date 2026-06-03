import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AssignmentStatus,
  DriverStatus,
  LocationSource,
  LocationTrackingStatus,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
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

type ResolvedDriver = {
  id: string;
  locationTrackingConsentAt: Date | null;
  locationTrackingStatus: LocationTrackingStatus;
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
        locationTrackingStatus: LocationTrackingStatus.active,
      },
    });

    return {
      consentGranted: true,
      consentAt: now.toISOString(),
      trackingStatus: LocationTrackingStatus.active,
    };
  }

  async getLocationStatus(driver: ResolvedDriver) {
    const hasTrackableAssignmentToday = await this.hasTrackableAssignmentToday(driver.id);
    const latest = await this.prisma.driverLocationLatest.findUnique({
      where: { driverId: driver.id },
      select: {
        recordedAt: true,
        receivedAt: true,
        vehicleId: true,
      },
    });

    const consentGranted = driver.locationTrackingConsentAt !== null;
    const trackingAllowed =
      consentGranted &&
      driver.locationTrackingStatus === LocationTrackingStatus.active &&
      hasTrackableAssignmentToday;

    return {
      consentGranted,
      consentAt: driver.locationTrackingConsentAt?.toISOString() ?? null,
      trackingStatus: driver.locationTrackingStatus,
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

  async submitLocation(driver: ResolvedDriver, dto: SubmitLocationDto) {
    this.assertTrackingConsent(driver);

    const hasTrackableAssignmentToday = await this.hasTrackableAssignmentToday(driver.id);
    if (!hasTrackableAssignmentToday) {
      throw new ForbiddenException(
        'Location tracking is only allowed when you have an active assignment today',
      );
    }

    const recordedAt = this.parseRecordedAt(dto.recordedAt);
    const vehicleId = await this.resolveVehicleIdForToday(driver.id);
    const deduplicated = await this.shouldDeduplicate(driver.id, dto, recordedAt);

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
      where: { driverId: driver.id },
      create: {
        driverId: driver.id,
        ...locationData,
      },
      update: locationData,
    });

    if (!deduplicated) {
      await this.prisma.driverLocationHistory.create({
        data: {
          driverId: driver.id,
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
    const assignmentMap = await this.loadCurrentAssignmentsByDriver();
    const latestRows = await this.prisma.driverLocationLatest.findMany({
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
          status: DriverStatus.active,
          id: { notIn: Array.from(driversWithLatest) },
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

  private assertTrackingConsent(driver: ResolvedDriver) {
    if (!driver.locationTrackingConsentAt) {
      throw new ForbiddenException('Location tracking consent is required');
    }

    if (driver.locationTrackingStatus === LocationTrackingStatus.denied) {
      throw new ForbiddenException('Location tracking has been denied');
    }

    if (driver.locationTrackingStatus === LocationTrackingStatus.paused) {
      throw new ForbiddenException('Location tracking is paused');
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
