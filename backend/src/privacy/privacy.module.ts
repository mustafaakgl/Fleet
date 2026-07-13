import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MetricsModule } from '../metrics/metrics.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PrivacyController } from './privacy.controller';
import { PrivacyRetentionJob } from './retention.job';
import { PrivacyService } from './privacy.service';

@Module({
  imports: [PrismaModule, AuditModule, MetricsModule],
  controllers: [PrivacyController],
  providers: [PrivacyService, PrivacyRetentionJob],
  exports: [PrivacyService],
})
export class PrivacyModule {}
