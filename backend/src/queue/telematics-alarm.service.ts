import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TELEMATICS_THRESHOLDS } from './telematics-thresholds';
import { UserRole } from '@prisma/client';

type ThresholdContext = {
  tenantId: string;
  vehicleId: string;
  recordedAt: Date;
  latitude: number;
  longitude: number;
  coolantTemp?: number;
  voltage?: number;
  fuelLevelPct?: number;
  ignition: boolean;
};

@Injectable()
export class TelematicsAlarmService {
  private readonly logger = new Logger(TelematicsAlarmService.name);
  private readonly fuelBaseline = new Map<string, { pct: number; atMs: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async evaluateThresholds(ctx: ThresholdContext): Promise<void> {
    if (ctx.coolantTemp !== undefined && ctx.coolantTemp > TELEMATICS_THRESHOLDS.coolantHighC) {
      await this.emitAlarm(ctx.tenantId, ctx.vehicleId, 'telematics_coolant_high', {
        title: 'Engine coolant temperature high',
        message: `Vehicle reported coolant ${ctx.coolantTemp}°C (threshold ${TELEMATICS_THRESHOLDS.coolantHighC}°C).`,
        priority: 'high' as const,
      });
    }

    if (ctx.voltage !== undefined && ctx.voltage < TELEMATICS_THRESHOLDS.voltageLowV) {
      await this.emitAlarm(ctx.tenantId, ctx.vehicleId, 'telematics_voltage_low', {
        title: 'Battery voltage low',
        message: `Vehicle reported ${ctx.voltage}V (threshold ${TELEMATICS_THRESHOLDS.voltageLowV}V).`,
        priority: 'high' as const,
      });
    }

    if (ctx.fuelLevelPct !== undefined) {
      await this.checkFuelTheft(ctx);
    }
  }

  private async checkFuelTheft(ctx: ThresholdContext): Promise<void> {
    const key = ctx.vehicleId;
    const nowMs = ctx.recordedAt.getTime();
    const currentPct = ctx.fuelLevelPct!;
    let baseline = this.fuelBaseline.get(key);

    if (
      !baseline
      || nowMs < baseline.atMs
      || nowMs - baseline.atMs > TELEMATICS_THRESHOLDS.fuelTheftWindowMs
    ) {
      this.fuelBaseline.set(key, { pct: currentPct, atMs: nowMs });
      return;
    }

    const dropPct = baseline.pct - currentPct;
    if (dropPct >= TELEMATICS_THRESHOLDS.fuelTheftDropPct && !ctx.ignition) {
      await this.emitAlarm(ctx.tenantId, ctx.vehicleId, 'fuel_theft_suspected', {
        title: 'Suspected fuel theft',
        message: `Fuel dropped ${dropPct.toFixed(1)}% in ${Math.round((nowMs - baseline.atMs) / 60000)} min while ignition off.`,
        priority: 'critical' as const,
      });
      this.fuelBaseline.set(key, { pct: currentPct, atMs: nowMs });
      return;
    }
  }

  private async emitAlarm(
    tenantId: string,
    vehicleId: string,
    type:
      | 'fuel_theft_suspected'
      | 'telematics_coolant_high'
      | 'telematics_voltage_low'
      | 'device_silent',
    content: { title: string; message: string; priority: 'medium' | 'high' | 'critical' },
  ): Promise<void> {
    const since = new Date(Date.now() - TELEMATICS_THRESHOLDS.alarmSuppressionMs);
    const recent = await this.prisma.unscoped.notification.count({
      where: {
        tenantId,
        type,
        relatedEntityType: 'Vehicle',
        relatedEntityId: vehicleId,
        createdAt: { gte: since },
      },
    });

    if (recent > 0) {
      return;
    }

    try {
      const officeRoles: UserRole[] = [UserRole.admin, UserRole.boss, UserRole.office];
      const users = await this.prisma.unscoped.user.findMany({
        where: {
          tenantId,
          role: { in: officeRoles },
          status: 'active',
        },
        select: { id: true },
      });

      for (const user of users) {
        await this.notifications.createNotification({
          tenantId,
          userId: user.id,
          title: content.title,
          message: content.message,
          type,
          priority: content.priority,
          relatedEntityType: 'Vehicle',
          relatedEntityId: vehicleId,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`alarm notify failed type=${type} vehicle=${vehicleId} error=${message}`);
    }
  }

  async runDeviceSilentWatchdog(): Promise<void> {
    const cutoff = new Date(Date.now() - TELEMATICS_THRESHOLDS.deviceSilentMs);
    const devices = await this.prisma.unscoped.device.findMany({
      where: {
        vehicleId: { not: null },
        OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: cutoff } }],
      },
      select: {
        tenantId: true,
        vehicleId: true,
        imei: true,
      },
    });

    for (const device of devices) {
      if (!device.vehicleId) {
        continue;
      }

      const telemetry = await this.prisma.unscoped.vehicleTelemetryLatest.findUnique({
        where: { vehicleId: device.vehicleId },
        select: { ignition: true, recordedAt: true },
      });

      if (!telemetry?.ignition) {
        continue;
      }

      if (telemetry.recordedAt >= cutoff) {
        continue;
      }

      await this.emitAlarm(device.tenantId, device.vehicleId, 'device_silent', {
        title: 'Device silent while ignition on',
        message: `IMEI ${device.imei} has ignition on but no telemetry for 30+ minutes.`,
        priority: 'high',
      });
    }
  }
}
