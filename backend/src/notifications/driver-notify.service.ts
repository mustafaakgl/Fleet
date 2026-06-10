import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { NotificationI18nService } from '../i18n/notification-i18n.service';
import type { DriverNotifyKey } from './driver-notify.copy';

type NotifyInput = {
  userId: string;
  key: DriverNotifyKey;
  params?: Record<string, string>;
  type: 'request' | 'transport_request' | 'system';
  priority?: 'low' | 'medium' | 'high';
  relatedEntityType?: string;
  relatedEntityId?: string;
};

@Injectable()
export class DriverNotifyService {
  private readonly logger = new Logger(DriverNotifyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly notificationI18n: NotificationI18nService,
  ) {}

  async notifyUser(input: NotifyInput): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, language: true },
    });
    if (!user) {
      return;
    }

    const copy = this.notificationI18n.resolve(user.language, input.key, input.params ?? {});

    try {
      await this.notifications.createNotification({
        userId: user.id,
        title: copy.title,
        message: copy.message,
        type: input.type,
        priority: input.priority ?? 'medium',
        relatedEntityType: input.relatedEntityType,
        relatedEntityId: input.relatedEntityId,
      });
    } catch (error) {
      this.logger.warn(`Failed to notify user ${input.userId}: ${error}`);
    }
  }

  notifyUserSafely(input: NotifyInput): void {
    void this.notifyUser(input);
  }
}
