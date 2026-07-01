import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TrackingController } from './tracking.controller';
import { DeviceIngestApiKeyGuard } from './guards/device-ingest-api-key.guard';
import { TrackingService } from './tracking.service';

@Module({
  imports: [PrismaModule, AuditModule, NotificationsModule],
  controllers: [TrackingController],
  providers: [TrackingService, DeviceIngestApiKeyGuard],
  exports: [TrackingService],
})
export class TrackingModule {}
