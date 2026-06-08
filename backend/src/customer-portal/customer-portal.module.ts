import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DocumentsModule } from '../documents/documents.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { CustomerAssignmentsService } from './customer-assignments.service';
import { CustomerPortalController } from './customer-portal.controller';
import { CustomerPortalService } from './customer-portal.service';
import { CustomerMessagesService } from './customer-messages.service';
import { CustomerProofsService } from './customer-proofs.service';
import { CustomerTenantGuard } from './customer-tenant.guard';

@Module({
  imports: [PrismaModule, AuditModule, DocumentsModule, StorageModule],
  controllers: [CustomerPortalController],
  providers: [
    CustomerPortalService,
    CustomerAssignmentsService,
    CustomerProofsService,
    CustomerMessagesService,
    CustomerTenantGuard,
  ],
  exports: [
    CustomerPortalService,
    CustomerAssignmentsService,
    CustomerProofsService,
    CustomerMessagesService,
    CustomerTenantGuard,
  ],
})
export class CustomerPortalModule {}
