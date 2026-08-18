import { Injectable, Logger } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { FINANCIAL_ROLES, OPERATIONAL_ROLES } from '../common/utils/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { OfficeNotifyKey, resolveOfficeNotifyCopy } from './office-notify.copy';

type NotifyOperationalInput = {
  key: OfficeNotifyKey;
  params?: Record<string, string>;
  type: 'transport_request' | 'request' | 'system' | 'accident' | 'cargo_damage' | 'document';
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
    return this.notifyRoleGroup(OPERATIONAL_ROLES as UserRole[], input);
  }

  /**
   * YALNIZCA finansal roller (admin, boss, accounting).
   *
   * Office BILINCLI OLARAK DISARIDA: yakit mutabakati mali bir risk
   * degerlendirmesi ve ofisin gorevine girmiyor. Ayni rol siniri
   * controller'da da var — bildirim gonderip ekrani kapatmak, konuyu
   * acip cevabi saklamak olurdu.
   */
  async notifyFinancialUsers(input: NotifyOperationalInput): Promise<void> {
    return this.notifyRoleGroup(FINANCIAL_ROLES as UserRole[], input);
  }

  private async notifyRoleGroup(
    roles: UserRole[],
    input: NotifyOperationalInput,
  ): Promise<void> {
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
