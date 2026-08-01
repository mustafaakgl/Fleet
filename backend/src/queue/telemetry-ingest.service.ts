import { Injectable, Logger } from '@nestjs/common';
import {
  AssignmentStatus,
  DtcSeverity,
  FleetTelemetrySource,
  FleetTripStatus,
  LocationSource,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../metrics/metrics.service';
import type { TelemetryIngestJobPayload, TelemetryRecordPayload } from './telemetry.types';
import { TelematicsTripBuilderService } from './telematics-trip-builder.service';
import { TelematicsAlarmService } from './telematics-alarm.service';
import { TELEMATICS_THRESHOLDS } from './telematics-thresholds';

const TRACKABLE_ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  AssignmentStatus.planned,
  AssignmentStatus.confirmed,
  AssignmentStatus.in_progress,
];

@Injectable()
export class TelemetryIngestService {
  private readonly logger = new Logger(TelemetryIngestService.name);
  private readonly lastSpeedKphByVehicle = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly tripBuilder: TelematicsTripBuilderService,
    private readonly alarms: TelematicsAlarmService,
  ) {}

  async processIngestJob(payload: TelemetryIngestJobPayload): Promise<void> {
    for (const record of payload.records) {
      try {
        await this.processRecord(payload, record);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `telemetry ingest record failed imei=${payload.imei} ts=${record.timestampMs} error=${message}`,
        );
      }
    }
  }

  private async processRecord(
    job: TelemetryIngestJobPayload,
    record: TelemetryRecordPayload,
  ): Promise<void> {
    const recordedAt = new Date(record.timestampMs);
    const idempotencyKey = {
      imei_recordedAt_priority: {
        imei: job.imei,
        recordedAt,
        priority: record.priority,
      },
    };

    const claimed = await this.prisma.unscoped.telemetryProcessedRecord.createMany({
      data: [
        {
          imei: job.imei,
          recordedAt,
          priority: record.priority,
        },
      ],
      skipDuplicates: true,
    });

    if (claimed.count === 0) {
      return;
    }

    await this.prisma.unscoped.$transaction(async (tx) => {
      const driverId = await this.resolveDriverId(tx, job.tenantId, job.vehicleId);
      const speedMps = Number((record.speedKph / 3.6).toFixed(3));

      if (!driverId) {
        // Sessiz dusme yasak: konum kaydi atlaniyorsa bu gorunur olmali.
        // Onceden hicbir iz birakmadan atlaniyordu ve arac haritadan
        // kayboluyordu; tanisi gunler suruyordu.
        this.logger.warn(
          `Telemetry stored without location: no driver resolved for vehicle ${job.vehicleId} `
            + `(tenant ${job.tenantId}). Assign the vehicle or set currentDriverId.`,
        );
      }

      if (driverId) {
        const locationData = {
          tenantId: job.tenantId,
          latitude: new Prisma.Decimal(record.latitude),
          longitude: new Prisma.Decimal(record.longitude),
          speedMps,
          headingDeg: record.angleDeg,
          accuracyM: null,
          altitudeM: null,
          recordedAt,
          source: LocationSource.telematics,
          vehicleId: job.vehicleId,
        };

        await tx.driverLocationLatest.upsert({
          where: { driverId },
          create: { driverId, ...locationData },
          update: locationData,
        });

        await tx.driverLocationHistory.create({
          data: { driverId, ...locationData },
        });
      }

      const existingTelemetry = await tx.vehicleTelemetryLatest.findUnique({
        where: { vehicleId: job.vehicleId },
        select: { recordedAt: true },
      });

      if (!existingTelemetry || recordedAt > existingTelemetry.recordedAt) {
        await tx.vehicleTelemetryLatest.upsert({
          where: { vehicleId: job.vehicleId },
          create: {
            vehicleId: job.vehicleId,
            tenantId: job.tenantId,
            ignition: record.ignition ?? false,
            rpm: record.rpm ?? null,
            fuelLevelPct: this.toDecimalOrNull(record.fuelLevelPct),
            coolantTemp: this.toDecimalOrNull(record.coolantTemp),
            voltage: this.toDecimalOrNull(record.voltage),
            odometerKm: this.toDecimalOrNull(record.odometerKm),
            recordedAt,
          },
          update: {
            ignition: record.ignition ?? false,
            rpm: record.rpm ?? null,
            fuelLevelPct: this.toDecimalOrNull(record.fuelLevelPct),
            coolantTemp: this.toDecimalOrNull(record.coolantTemp),
            voltage: this.toDecimalOrNull(record.voltage),
            odometerKm: this.toDecimalOrNull(record.odometerKm),
            recordedAt,
          },
        });
      }

      if (record.dtcPresent) {
        await this.syncDtcState(tx, {
          tenantId: job.tenantId,
          vehicleId: job.vehicleId,
          recordedAt,
          incoming: record.dtc,
        });
      }

      await tx.device.updateMany({
        where: { tenantId: job.tenantId, imei: job.imei },
        data: { lastSeenAt: new Date() },
      });
    });

    const enrichedEvents = this.enrichDrivingEvents(job.vehicleId, record);
    await this.tripBuilder.handleRecord({
      tenantId: job.tenantId,
      vehicleId: job.vehicleId,
      driverId: await this.resolveDriverIdUnscoped(job.tenantId, job.vehicleId),
      recordedAt,
      latitude: record.latitude,
      longitude: record.longitude,
      speedKph: record.speedKph,
      ignition: record.ignition ?? false,
      odometerKm: record.odometerKm,
      events: enrichedEvents,
    });

    await this.alarms.evaluateThresholds({
      tenantId: job.tenantId,
      vehicleId: job.vehicleId,
      recordedAt,
      latitude: record.latitude,
      longitude: record.longitude,
      coolantTemp: record.coolantTemp,
      voltage: record.voltage,
      fuelLevelPct: record.fuelLevelPct,
      ignition: record.ignition ?? false,
    });

    this.metrics.telematicsFramesTotal.inc();
  }

  private enrichDrivingEvents(
    vehicleId: string,
    record: TelemetryRecordPayload,
  ): TelemetryRecordPayload['events'] {
    const events = [...record.events];
    const prevSpeed = this.lastSpeedKphByVehicle.get(vehicleId);
    this.lastSpeedKphByVehicle.set(vehicleId, record.speedKph);

    if (prevSpeed !== undefined) {
      const delta = record.speedKph - prevSpeed;
      if (delta >= TELEMATICS_THRESHOLDS.harshAccelDeltaKph) {
        events.push({
          type: 'harsh_accel',
          value: delta,
          threshold: TELEMATICS_THRESHOLDS.harshAccelDeltaKph,
        });
      }
      if (-delta >= TELEMATICS_THRESHOLDS.harshBrakeDeltaKph) {
        events.push({
          type: 'harsh_brake',
          value: -delta,
          threshold: TELEMATICS_THRESHOLDS.harshBrakeDeltaKph,
        });
      }
    }

    if (record.speedKph > TELEMATICS_THRESHOLDS.speedingKph) {
      const hasSpeeding = events.some((event) => event.type === 'speeding');
      if (!hasSpeeding) {
        events.push({
          type: 'speeding',
          value: record.speedKph,
          threshold: TELEMATICS_THRESHOLDS.speedingKph,
        });
      }
    }

    return events;
  }

  private async syncDtcState(
    tx: Prisma.TransactionClient,
    params: {
      tenantId: string;
      vehicleId: string;
      recordedAt: Date;
      incoming: TelemetryRecordPayload['dtc'];
    },
  ): Promise<void> {
    const incomingCodes = new Set(params.incoming.map((row) => row.code.trim()));
    const active = await tx.vehicleDtc.findMany({
      where: { vehicleId: params.vehicleId, clearedAt: null },
      select: { id: true, code: true },
    });

    const activeCodes = new Set(active.map((row) => row.code));

    for (const code of incomingCodes) {
      if (activeCodes.has(code)) {
        continue;
      }
      const meta = params.incoming.find((row) => row.code === code);
      await tx.vehicleDtc.create({
        data: {
          tenantId: params.tenantId,
          vehicleId: params.vehicleId,
          code,
          description: meta?.description ?? null,
          severity: meta?.severity === 'critical' ? DtcSeverity.critical : DtcSeverity.medium,
          occurredAt: params.recordedAt,
        },
      });
    }

    for (const row of active) {
      if (!incomingCodes.has(row.code)) {
        await tx.vehicleDtc.update({
          where: { id: row.id },
          data: { clearedAt: params.recordedAt },
        });
      }
    }
  }

  /**
   * Telemetriyi bir surucuye baglar.
   *
   * Once o gunun gorevine bakilir. Gorev YOKSA aracin uzerinde sabitlenmis
   * suruculye dusulur — aksi halde arac tamamen izlenemez hale geliyordu:
   * DriverLocationHistory.driverId zorunlu bir alan, yani surucu cozulemezse
   * ne gecmis ne de canli konum yaziliyor ve arac haritadan kayboluyor.
   *
   * Gercek vakada gozlendi: sim aracinin gorevleri 2026-07-31'de bitince
   * konum yazimi ayni gun durdu; cihaz veri gondermeye devam ediyordu, sistem
   * kayitlari "islendi" isaretliyordu, hicbir hata da uretmiyordu.
   *
   * Hafta sonu surusu, plansiz sefer veya sevkiyatin gorev girmeyi atladigi
   * bir gun uretimde ayni sonucu verir.
   */
  private async resolveDriverId(
    tx: Prisma.TransactionClient,
    tenantId: string,
    vehicleId: string,
  ): Promise<string | null> {
    const { start, end } = this.todayRange();
    const assignment = await tx.assignment.findFirst({
      where: {
        tenantId,
        vehicleId,
        workDate: { gte: start, lt: end },
        status: { in: TRACKABLE_ASSIGNMENT_STATUSES },
      },
      orderBy: { updatedAt: 'desc' },
      select: { driverId: true },
    });
    if (assignment?.driverId) {
      return assignment.driverId;
    }

    const vehicle = await tx.vehicle.findFirst({
      where: { id: vehicleId, tenantId },
      select: { currentDriverId: true },
    });
    return vehicle?.currentDriverId ?? null;
  }

  /** resolveDriverId ile ayni mantik; transaction disi cagirimlar icin. */
  private async resolveDriverIdUnscoped(
    tenantId: string,
    vehicleId: string,
  ): Promise<string | null> {
    const { start, end } = this.todayRange();
    const assignment = await this.prisma.unscoped.assignment.findFirst({
      where: {
        tenantId,
        vehicleId,
        workDate: { gte: start, lt: end },
        status: { in: TRACKABLE_ASSIGNMENT_STATUSES },
      },
      orderBy: { updatedAt: 'desc' },
      select: { driverId: true },
    });
    if (assignment?.driverId) {
      return assignment.driverId;
    }

    const vehicle = await this.prisma.unscoped.vehicle.findFirst({
      where: { id: vehicleId, tenantId },
      select: { currentDriverId: true },
    });
    return vehicle?.currentDriverId ?? null;
  }

  private todayRange(): { start: Date; end: Date } {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  private toDecimalOrNull(value?: number): Prisma.Decimal | null {
    if (value === undefined || value === null || !Number.isFinite(value)) {
      return null;
    }
    return new Prisma.Decimal(value);
  }
}
