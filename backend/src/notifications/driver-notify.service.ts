import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { DriverNotifyKey, resolveDriverNotifyCopy } from './driver-notify.copy';

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
  ) {}

  async notifyUser(input: NotifyInput): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, language: true },
    });
    if (!user) {
      return;
    }

    const copy = resolveDriverNotifyCopy(user.language, input.key, input.params ?? {});

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
