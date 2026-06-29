import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { DriverNotifyService } from './driver-notify.service';
import { OperationalNotifyService } from './operational-notify.service';
import { NotificationsService } from './notifications.service';
import { NotificationSseService } from './notification-sse.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';
import { NotificationI18nService } from '../i18n/notification-i18n.service';

@Module({
  imports: [PrismaModule, PushNotificationsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationSseService, DriverNotifyService, OperationalNotifyService, NotificationI18nService],
  exports: [NotificationsService, NotificationSseService, DriverNotifyService, OperationalNotifyService],
})
export class NotificationsModule {}
