import { forwardRef, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditModule } from '../audit/audit.module';
import { MetricsModule } from '../metrics/metrics.module';
import { TachographQueueModule } from './tachograph-queue.module';
import { TachographRemoteDownloadService } from './tachograph-remote-download.service';
import { TachographInfringementNotificationService } from './tachograph-infringement-notification.service';
import { TachographDownloadReminderService } from './tachograph-download-reminder.service';
import { TachographController } from './tachograph.controller';
import { TachographService } from './tachograph.service';
import { TachographApiService } from './tachograph-api.service';
import { TachoIngestTokenGuard } from './guards/tacho-ingest-token.guard';
import { TachoProviderCredentialCryptoService } from './tacho-provider-credential-crypto.service';
import { TachoProviderCredentialService } from './tacho-provider-credential.service';
import { DDD_REMOTE_DOWNLOAD_PORT } from './remote-download/ddd-remote-download.port';
import { TisWebAdapter } from './remote-download/tis-web.adapter';

@Module({
  imports: [PrismaModule, NotificationsModule, AuditModule, MetricsModule, forwardRef(() => TachographQueueModule)],
  controllers: [TachographController],
  providers: [
    TachographService,
    TachographApiService,
    TachographRemoteDownloadService,
    TachographInfringementNotificationService,
    TachographDownloadReminderService,
    TachoIngestTokenGuard,
    TachoProviderCredentialCryptoService,
    TachoProviderCredentialService,
    {
      provide: DDD_REMOTE_DOWNLOAD_PORT,
      useClass: TisWebAdapter,
    },
  ],
  exports: [TachographService, TachographApiService, TachoProviderCredentialService],
})
export class TachographModule {}
