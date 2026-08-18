import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AutomationJobService } from './automation-job.service';
import { AutomationProposalService } from './automation-proposal.service';
import { AutomationQueueController } from './automation-queue.controller';
import { OrdivanAdminController } from './ordivan-admin.controller';
import { OrdivanConnectorController } from './ordivan-connector.controller';
import { OrdivanConnectorService } from './ordivan-connector.service';
import { OrdivanScheduler } from './ordivan.scheduler';
import { resolveOrdivanMode } from './ordivan.config';

/**
 * Ordivan otomasyonu ve connector temeli (Faz 12).
 *
 * MOD ACILISTA COZULUYOR: gecersiz yapilandirma ya da uretimde `mock` SUREC
 * BASLARKEN firlatir. Ilk istegi bekleyip sessizce sahte oneri uretmek, en
 * tehlikeli basarisizlik bicimi olurdu.
 */
@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [OrdivanAdminController, OrdivanConnectorController, AutomationQueueController],
  providers: [
    OrdivanConnectorService,
    AutomationJobService,
    AutomationProposalService,
    OrdivanScheduler,
    {
      provide: 'ORDIVAN_MODE',
      useFactory: () => resolveOrdivanMode(),
    },
  ],
  exports: [OrdivanConnectorService, AutomationJobService, AutomationProposalService],
})
export class OrdivanModule {}
