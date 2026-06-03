import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';

type NotificationType =
  | 'transport_request'
  | 'request'
  | 'document'
  | 'handover'
  | 'accident'
  | 'cargo_damage'
  | 'company_email'
  | 'reminder'
  | 'system';

type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';

type NotificationStatus = 'unread' | 'read';

type NotificationCreateInput = {
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  priority?: NotificationPriority;
  relatedEntityType?: string;
  relatedEntityId?: string;
};

type NotificationBroadcastInput = Omit<NotificationCreateInput, 'userId'>;

const NOTIFICATION_TYPES: NotificationType[] = [
  'transport_request',
  'request',
  'document',
  'handover',
  'accident',
  'cargo_damage',
  'company_email',
  'reminder',
  'system',
];

const NOTIFICATION_PRIORITIES: NotificationPriority[] = ['low', 'medium', 'high', 'critical'];
const NOTIFICATION_STATUSES: NotificationStatus[] = ['unread', 'read'];

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pushNotifications: PushNotificationsService,
  ) {}

  private ensureType(value: string): NotificationType {
    if (!NOTIFICATION_TYPES.includes(value as NotificationType)) {
      throw new BadRequestException('Invalid notification type');
    }

    return value as NotificationType;
  }

  private ensurePriority(value: string): NotificationPriority {
    if (!NOTIFICATION_PRIORITIES.includes(value as NotificationPriority)) {
      throw new BadRequestException('Invalid notification priority');
    }

    return value as NotificationPriority;
  }

  private ensureStatus(value: string): NotificationStatus {
    if (!NOTIFICATION_STATUSES.includes(value as NotificationStatus)) {
      throw new BadRequestException('Invalid notification status');
    }

    return value as NotificationStatus;
  }

  async createNotification(data: NotificationCreateInput | CreateNotificationDto) {
    const type = this.ensureType(data.type);
    const priority = data.priority ? this.ensurePriority(data.priority) : 'medium';

    const user = await this.prisma.user.findUnique({ where: { id: data.userId }, select: { id: true } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const db = this.prisma as any;
    const notification = await db.notification.create({
      data: {
        userId: data.userId,
        title: data.title,
        message: data.message,
        type,
        priority,
        status: 'unread',
        relatedEntityType: data.relatedEntityType ?? null,
        relatedEntityId: data.relatedEntityId ?? null,
      },
    });

    this.pushNotifications.sendToUserSafely(data.userId, {
      title: data.title,
      body: data.message,
      data: {
        type: 'notification',
        notificationId: notification.id,
        notificationType: type,
        ...(data.relatedEntityType ? { relatedEntityType: data.relatedEntityType } : {}),
        ...(data.relatedEntityId ? { relatedEntityId: data.relatedEntityId } : {}),
      },
    });

    return notification;
  }

  async listMyNotifications(userId: string, status?: string) {
    const where: Record<string, unknown> = { userId };
    if (status) {
      where.status = this.ensureStatus(status);
    }

    const db = this.prisma as any;
    return db.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async markAsRead(notificationId: string, userId: string) {
    const db = this.prisma as any;
    const notification = await db.notification.findUnique({ where: { id: notificationId } });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException('Cannot mark another user\'s notification as read');
    }

    return db.notification.update({
      where: { id: notificationId },
      data: { status: 'read' as NotificationStatus },
    });
  }

  async markAllAsRead(userId: string) {
    const db = this.prisma as any;
    return db.notification.updateMany({
      where: {
        userId,
        status: 'unread',
      },
      data: {
        status: 'read',
      },
    });
  }

  async getUnreadCount(userId: string) {
    const db = this.prisma as any;
    const count = await db.notification.count({
      where: {
        userId,
        status: 'unread',
      },
    });

    return { count };
  }

  async notifyUsers(userIds: string[], data: NotificationBroadcastInput) {
    if (userIds.length === 0) {
      return [];
    }

    const type = this.ensureType(data.type);
    const priority = data.priority ? this.ensurePriority(data.priority) : 'medium';

    const uniqueUserIds = Array.from(new Set(userIds));
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: uniqueUserIds },
        status: 'active',
      },
      select: { id: true },
    });

    if (users.length === 0) {
      return [];
    }

    const db = this.prisma as any;
    await db.notification.createMany({
      data: users.map((user) => ({
        userId: user.id,
        title: data.title,
        message: data.message,
        type,
        priority,
        status: 'unread',
        relatedEntityType: data.relatedEntityType ?? null,
        relatedEntityId: data.relatedEntityId ?? null,
      })),
    });

    this.pushNotifications.sendToUsersSafely(
      users.map((user) => user.id),
      {
        title: data.title,
        body: data.message,
        data: {
          type: 'notification',
          notificationType: type,
          ...(data.relatedEntityType ? { relatedEntityType: data.relatedEntityType } : {}),
          ...(data.relatedEntityId ? { relatedEntityId: data.relatedEntityId } : {}),
        },
      },
    );

    return { created: users.length };
  }

  async notifyRoles(
    roles: Array<'admin' | 'boss' | 'accounting' | 'office' | 'driver'>,
    data: NotificationBroadcastInput,
  ) {
    if (roles.length === 0) {
      return [];
    }

    const users = await this.prisma.user.findMany({
      where: {
        role: { in: roles as any },
        status: 'active',
      },
      select: { id: true },
    });

    const userIds = users.map((u) => u.id);
    return this.notifyUsers(userIds, data);
  }

  async notifyAdminsAndOffice(data: {
    title: string;
    message: string;
    type: NotificationType;
    priority?: NotificationPriority;
    relatedEntityType?: string;
    relatedEntityId?: string;
  }) {
    return this.notifyRoles(['admin', 'office'], data);
  }

  async notifyFinancialUsers(data: {
    title: string;
    message: string;
    type: NotificationType;
    priority?: NotificationPriority;
    relatedEntityType?: string;
    relatedEntityId?: string;
  }) {
    return this.notifyRoles(['admin', 'boss', 'accounting'], data);
  }

  async notifyOperationsUsers(data: {
    title: string;
    message: string;
    type: NotificationType;
    priority?: NotificationPriority;
    relatedEntityType?: string;
    relatedEntityId?: string;
  }) {
    return this.notifyRoles(['admin', 'office'], data);
  }
}
