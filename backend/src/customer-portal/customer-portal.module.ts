import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CustomerAssignmentsService } from './customer-assignments.service';
import { CustomerPortalController } from './customer-portal.controller';
import { CustomerPortalService } from './customer-portal.service';
import { CustomerTenantGuard } from './customer-tenant.guard';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [CustomerPortalController],
  providers: [CustomerPortalService, CustomerAssignmentsService, CustomerTenantGuard],
  exports: [CustomerPortalService, CustomerAssignmentsService, CustomerTenantGuard],
})
export class CustomerPortalModule {}
