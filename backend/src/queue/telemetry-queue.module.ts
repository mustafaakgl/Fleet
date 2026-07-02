import { Global, Module } from '@nestjs/common';
import { MetricsModule } from '../metrics/metrics.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TelemetryBootstrapService } from './telemetry-bootstrap.service';
import { TelemetryIngestService } from './telemetry-ingest.service';
import { TelemetryQuarantineService } from './telemetry-quarantine.service';
import { TelemetryQueueService } from './telemetry-queue.service';
import { TelematicsAlarmService } from './telematics-alarm.service';
import { TelematicsTripBuilderService } from './telematics-trip-builder.service';

@Global()
@Module({
  imports: [PrismaModule, MetricsModule, NotificationsModule],
  providers: [
    TelemetryQueueService,
    TelemetryIngestService,
    TelemetryQuarantineService,
    TelematicsTripBuilderService,
    TelematicsAlarmService,
    TelemetryBootstrapService,
  ],
  exports: [TelemetryQueueService, TelemetryIngestService],
})
export class TelemetryQueueModule {}
