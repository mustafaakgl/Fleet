import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { TransportOrdersModule } from '../transport-orders/transport-orders.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AutomationDocumentService } from './automation-document.service';
import { AutomationJobService } from './automation-job.service';
import { AutomationProposalService } from './automation-proposal.service';
import { AutomationQueueController } from './automation-queue.controller';
import { DocumentInboxController } from './document-inbox.controller';
import { DocumentIntakeService } from './document-intake.service';
import { IntakeRoutingService } from './intake-routing.service';
import { OrderIntakeContentService } from './order-intake-content.service';
import { OrderIntakeController } from './order-intake.controller';
import { OrderIntakeDecisionService } from './order-intake-decision.service';
import { OrderIntakeService } from './order-intake.service';
import { DispatchService } from './dispatch.service';
import { RoutingModule } from '../routing/routing.module';
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
  imports: [PrismaModule, AuditModule, TransportOrdersModule, RoutingModule],
  controllers: [
    OrdivanAdminController,
    OrdivanConnectorController,
    AutomationQueueController,
    // Faz 14 — belge gelen kutusu.
    DocumentInboxController,
    // Faz 16 — siparis gelen kutusu.
    OrderIntakeController,
  ],
  providers: [
    OrdivanConnectorService,
    AutomationDocumentService,
    AutomationJobService,
    AutomationProposalService,
    DocumentIntakeService,
    IntakeRoutingService,
    // Faz 16 — siparis gelen kutusu.
    OrderIntakeContentService,
    OrderIntakeService,
    OrderIntakeDecisionService,
    OrdivanScheduler,
    {
      provide: 'ORDIVAN_MODE',
      useFactory: () => resolveOrdivanMode(),
    },
  ],
  exports: [
    OrdivanConnectorService,
    AutomationDocumentService,
    AutomationJobService,
    AutomationProposalService,
    DocumentIntakeService,
    IntakeRoutingService,
    OrderIntakeContentService,
    OrderIntakeService,
    OrderIntakeDecisionService,
  ],
})
export class OrdivanModule {}
