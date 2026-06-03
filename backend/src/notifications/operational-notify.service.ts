import { Injectable, Logger } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { OPERATIONAL_ROLES } from '../common/utils/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { OfficeNotifyKey, resolveOfficeNotifyCopy } from './office-notify.copy';

type NotifyOperationalInput = {
  key: OfficeNotifyKey;
  params?: Record<string, string>;
  type: 'transport_request' | 'request' | 'system';
  priority?: 'low' | 'medium' | 'high';
  relatedEntityType?: string;
  relatedEntityId?: string;
  excludeUserId?: string;
};

@Injectable()
export class OperationalNotifyService {
  private readonly logger = new Logger(OperationalNotifyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async notifyOperationalUsers(input: NotifyOperationalInput): Promise<void> {
    const roles = OPERATIONAL_ROLES as UserRole[];
    const users = await this.prisma.user.findMany({
      where: {
        role: { in: roles },
        status: 'active',
      },
      select: { id: true, language: true },
    });

    for (const user of users) {
      if (input.excludeUserId && user.id === input.excludeUserId) {
        continue;
      }

      const copy = resolveOfficeNotifyCopy(user.language, input.key, input.params ?? {});

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
        this.logger.warn(`Failed to notify operational user ${user.id}: ${error}`);
      }
    }
  }

  notifyOperationalUsersSafely(input: NotifyOperationalInput): void {
    void this.notifyOperationalUsers(input);
  }
}
