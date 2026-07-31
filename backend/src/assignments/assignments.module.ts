import { Module } from '@nestjs/common';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';
import { AuditModule } from '../audit/audit.module';
import { CompanyEmailsModule } from '../company-emails/company-emails.module';
import { CustomerPortalModule } from '../customer-portal/customer-portal.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LicenseComplianceModule } from '../license-compliance/license-compliance.module';
import { DepartureCheckModule } from '../departure-check/departure-check.module';
import { RoutingModule } from '../routing/routing.module';

@Module({
  imports: [
    PrismaModule,
    CompanyEmailsModule,
    AuditModule,
    NotificationsModule,
    CustomerPortalModule,
    LicenseComplianceModule,
    DepartureCheckModule,
    RoutingModule,
  ],
  controllers: [AssignmentsController],
  providers: [AssignmentsService],
  exports: [AssignmentsService],
})
export class AssignmentsModule {}
