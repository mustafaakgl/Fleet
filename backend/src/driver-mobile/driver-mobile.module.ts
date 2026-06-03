import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';
import { TrackingModule } from '../tracking/tracking.module';
import { DocumentsModule } from '../documents/documents.module';
import { DriverMobileController } from './driver-mobile.controller';
import { DriverMobileService } from './driver-mobile.service';

@Module({
  imports: [
    PrismaModule,
    StorageModule,
    AuditModule,
    DocumentsModule,
    NotificationsModule,
    PushNotificationsModule,
    TrackingModule,
    MulterModule.register({}),
  ],
  controllers: [DriverMobileController],
  providers: [DriverMobileService],
  exports: [DriverMobileService],
})
export class DriverMobileModule {}
