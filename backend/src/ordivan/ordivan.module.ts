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
import { DispatchApprovalService } from './dispatch-approval.service';
import { DispatchReadService } from './dispatch-read.service';
import { DispatchController } from './dispatch.controller';
import { DeliverySlotService } from './delivery-slot.service';
import { DeliverySlotController } from './delivery-slot.controller';
import { DeliverySlotSessionService } from './delivery-slot-session.service';
import { PublicSlotController } from './public-slot.controller';
import { AssignmentsModule } from '../assignments/assignments.module';
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
  imports: [PrismaModule, AuditModule, TransportOrdersModule, RoutingModule, AssignmentsModule],
  controllers: [
    OrdivanAdminController,
    OrdivanConnectorController,
    AutomationQueueController,
    // Faz 14 — belge gelen kutusu.
    DocumentInboxController,
    // Faz 16 — siparis gelen kutusu.
    OrderIntakeController,
    /**
     * Faz 17f — dispatch ve slot API'leri.
     *
     * 17c/17d/17e servisleri bu commit'e kadar HICBIR controller'a bagli
     * degildi: kod vardi, ucu yoktu. Kayit burada yapiliyor.
     */
    DispatchController,
    DeliverySlotController,
    // Girissiz uc AYRI bir controller: `@Public()` ve `@Throttle` bir
    // yetkilendirilmis controller'in metotlarina karistirilsaydi, ileride
    // eklenen bir uc yanlislikla public olabilirdi.
    PublicSlotController,
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
    // Faz 17f — dispatch ve slot.
    DispatchService,
    DispatchApprovalService,
    DispatchReadService,
    DeliverySlotService,
    DeliverySlotSessionService,
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
    DispatchService,
    DispatchApprovalService,
    DispatchReadService,
    DeliverySlotService,
    DeliverySlotSessionService,
  ],
})
export class OrdivanModule {}
