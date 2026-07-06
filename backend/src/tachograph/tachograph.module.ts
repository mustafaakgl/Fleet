import { forwardRef, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditModule } from '../audit/audit.module';
import { MetricsModule } from '../metrics/metrics.module';
import { TachographQueueModule } from './tachograph-queue.module';
import { TachographController } from './tachograph.controller';
import { TachographService } from './tachograph.service';
import { TachographApiService } from './tachograph-api.service';
import { TachoIngestTokenGuard } from './guards/tacho-ingest-token.guard';

@Module({
  imports: [PrismaModule, NotificationsModule, AuditModule, MetricsModule, forwardRef(() => TachographQueueModule)],
  controllers: [TachographController],
  providers: [TachographService, TachographApiService, TachoIngestTokenGuard],
  exports: [TachographService, TachographApiService],
})
export class TachographModule {}
