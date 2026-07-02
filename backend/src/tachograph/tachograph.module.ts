import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditModule } from '../audit/audit.module';
import { TachographController } from './tachograph.controller';
import { TachographService } from './tachograph.service';
import { TachographApiService } from './tachograph-api.service';
import { TachoIngestTokenGuard } from './guards/tacho-ingest-token.guard';

@Module({
  imports: [PrismaModule, NotificationsModule, AuditModule],
  controllers: [TachographController],
  providers: [TachographService, TachographApiService, TachoIngestTokenGuard],
  exports: [TachographService, TachographApiService],
})
export class TachographModule {}
