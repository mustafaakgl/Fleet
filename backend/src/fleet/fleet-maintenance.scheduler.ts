import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationsService } from '../notifications/notifications.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { FleetVehicleStatusService } from './fleet-vehicle-status.service';

const ALERT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class FleetMaintenanceScheduler {
  private readonly logger = new Logger(FleetMaintenanceScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vehicleStatus: FleetVehicleStatusService,
    private readonly notifications: NotificationsService,
    private readonly push: PushNotificationsService,
  ) {}

  /** Notify assigned drivers about due-soon or overdue km/day maintenance rules. */
  @Cron('0 7 * * *')
  async handleMaintenanceAlerts(): Promise<void> {
    if ((process.env.FLEET_MAINTENANCE_CRON_ENABLED ?? 'true').toLowerCase() === 'false') {
      return;
    }

    let alerted = 0;

    await TenantContext.runUnscoped(async () => {
      const rules = await this.prisma.unscoped.fleetMaintenanceRule.findMany({
        select: {
          id: true,
          tenantId: true,
          vehicleId: true,
          name: true,
          vehicle: {
            select: {
              plateNumber: true,
              currentDriver: {
                select: {
                  userId: true,
                },
              },
            },
          },
        },
        take: 2000,
      });

      for (const rule of rules) {
        const userId = rule.vehicle.currentDriver?.userId;
        if (!userId) {
          continue;
        }

        try {
          const sent = await TenantContext.run(rule.tenantId, async () => {
            const status = await this.vehicleStatus.getVehicleStatus(rule.vehicleId);
            const ruleStatus = status.maintenanceRules.find((item) => item.id === rule.id);
            if (!ruleStatus || (ruleStatus.status !== 'due_soon' && ruleStatus.status !== 'overdue')) {
              return false;
            }

            const recentAlert = await this.prisma.notification.findFirst({
              where: {
                userId,
                relatedEntityType: 'FleetMaintenanceRule',
                relatedEntityId: rule.id,
                createdAt: { gte: new Date(Date.now() - ALERT_COOLDOWN_MS) },
              },
              select: { id: true },
            });
            if (recentAlert) {
              return false;
            }

            const detail =
              ruleStatus.remainingKm != null
                ? `${Math.abs(Math.round(ruleStatus.remainingKm))} km`
                : ruleStatus.remainingDays != null
                  ? `${Math.abs(ruleStatus.remainingDays)} Tage`
                  : rule.name;

            const title =
              ruleStatus.status === 'overdue' ? 'Wartung überfällig' : 'Wartung fällig bald';
            const body = `${rule.vehicle.plateNumber}: ${rule.name} (${detail})`;

            await this.notifications.createNotification({
              userId,
              title,
              message: body,
              type: 'system',
              priority: ruleStatus.status === 'overdue' ? 'high' : 'medium',
              relatedEntityType: 'FleetMaintenanceRule',
              relatedEntityId: rule.id,
            });

            await this.push.sendToUser(userId, {
              title,
              body,
              data: {
                type: 'fleet_maintenance',
                ruleId: rule.id,
                vehicleId: rule.vehicleId,
              },
            });

            return true;
          });

          if (sent) {
            alerted += 1;
          }
        } catch (error) {
          this.logger.error(
            `Maintenance alert failed for rule ${rule.id}: ${error instanceof Error ? error.message : error}`,
          );
        }
      }
    });

    if (alerted > 0) {
      this.logger.log(`Fleet maintenance alerts sent: ${alerted}`);
    }
  }
}
