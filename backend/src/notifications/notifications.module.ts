import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { DriverNotifyService } from './driver-notify.service';
import { OperationalNotifyService } from './operational-notify.service';
import { NotificationsService } from './notifications.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';

@Module({
  imports: [PrismaModule, PushNotificationsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, DriverNotifyService, OperationalNotifyService],
  exports: [NotificationsService, DriverNotifyService, OperationalNotifyService],
})
export class NotificationsModule {}
