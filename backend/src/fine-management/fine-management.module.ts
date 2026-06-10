import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';
import { StorageModule } from '../storage/storage.module';
import { FineMatchingService } from './fine-matching.service';
import { FineManagementScheduler } from './fine-management.scheduler';
import { FinesController } from './fines.controller';
import { FinesDriverController } from './fines-driver.controller';
import { FinesService } from './fines.service';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    StorageModule,
    NotificationsModule,
    PushNotificationsModule,
  ],
  controllers: [FinesController, FinesDriverController],
  providers: [FineMatchingService, FinesService, FineManagementScheduler],
  exports: [FinesService, FineMatchingService],
})
export class FineManagementModule {}
