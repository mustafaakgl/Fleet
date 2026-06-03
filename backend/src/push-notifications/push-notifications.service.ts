import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { PushNotificationPayload } from './dto/push-payload.dto';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_TOKEN_PREFIX = 'ExponentPushToken[';

type ExpoPushTicket = {
  status?: string;
  id?: string;
  message?: string;
  details?: { error?: string };
};

@Injectable()
export class PushNotificationsService {
  private readonly logger = new Logger(PushNotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  assertExpoPushToken(token: string) {
    const normalized = token.trim();
    if (!normalized.startsWith(EXPO_TOKEN_PREFIX) || !normalized.endsWith(']')) {
      throw new BadRequestException('Invalid Expo push token');
    }
    return normalized;
  }

  async registerToken(userId: string, token: string) {
    const expoPushToken = this.assertExpoPushToken(token);

    await this.prisma.user.update({
      where: { id: userId },
      data: { expoPushToken },
    });

    return { registered: true };
  }

  async clearToken(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { expoPushToken: null },
    });
    return { cleared: true };
  }

  async sendToUser(userId: string, payload: PushNotificationPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { expoPushToken: true },
    });

    if (!user?.expoPushToken) {
      return { sent: 0, skipped: 1 };
    }

    const sent = await this.dispatchExpoMessages([
      {
        to: user.expoPushToken,
        title: payload.title,
        body: payload.body,
        data: payload.data,
      },
    ]);

    return { sent, skipped: sent > 0 ? 0 : 1 };
  }

  async sendToUsers(userIds: string[], payload: PushNotificationPayload) {
    if (userIds.length === 0) {
      return { sent: 0, skipped: 0 };
    }

    const uniqueUserIds = Array.from(new Set(userIds));
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: uniqueUserIds },
        expoPushToken: { not: null },
      },
      select: { id: true, expoPushToken: true },
    });

    if (users.length === 0) {
      return { sent: 0, skipped: uniqueUserIds.length };
    }

    const sent = await this.dispatchExpoMessages(
      users.map((user) => ({
        to: user.expoPushToken as string,
        title: payload.title,
        body: payload.body,
        data: payload.data,
      })),
    );

    return { sent, skipped: uniqueUserIds.length - users.length };
  }

  sendToUserSafely(userId: string, payload: PushNotificationPayload) {
    void this.sendToUser(userId, payload).catch((error) => {
      this.logger.warn(`Push to user ${userId} failed: ${this.formatError(error)}`);
    });
  }

  sendToUsersSafely(userIds: string[], payload: PushNotificationPayload) {
    void this.sendToUsers(userIds, payload).catch((error) => {
      this.logger.warn(`Push to users failed: ${this.formatError(error)}`);
    });
  }

  private async dispatchExpoMessages(
    messages: Array<{
      to: string;
      title: string;
      body: string;
      data?: Record<string, string>;
    }>,
  ) {
    if (messages.length === 0) {
      return 0;
    }

    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        messages.map((message) => ({
          to: message.to,
          title: message.title,
          body: message.body,
          data: message.data ?? {},
          sound: 'default',
        })),
      ),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Expo push API error (${response.status}): ${body}`);
    }

    const payload = (await response.json()) as { data?: ExpoPushTicket[] };
    const tickets = payload.data ?? [];

    for (let index = 0; index < tickets.length; index += 1) {
      const ticket = tickets[index];
      if (ticket.status === 'error') {
        this.logger.warn(
          `Expo push ticket error for message ${index}: ${ticket.message ?? 'unknown error'}`,
        );

        if (ticket.details?.error === 'DeviceNotRegistered') {
          const token = messages[index]?.to;
          if (token) {
            await this.clearTokenByValue(token);
          }
        }
      }
    }

    return messages.length;
  }

  private async clearTokenByValue(token: string) {
    try {
      await this.prisma.user.updateMany({
        where: { expoPushToken: token },
        data: { expoPushToken: null },
      });
    } catch (error) {
      this.logger.warn(`Failed to clear invalid push token: ${this.formatError(error)}`);
    }
  }

  private formatError(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}
