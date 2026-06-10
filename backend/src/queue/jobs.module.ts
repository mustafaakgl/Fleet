import { Module } from '@nestjs/common';
import { CompanyEmailsModule } from '../company-emails/company-emails.module';
import { DriversModule } from '../drivers/drivers.module';
import { PrivacyModule } from '../privacy/privacy.module';
import { RemindersModule } from '../reminders/reminders.module';
import { LicenseComplianceModule } from '../license-compliance/license-compliance.module';
import { DepartureCheckModule } from '../departure-check/departure-check.module';
import { FineManagementModule } from '../fine-management/fine-management.module';
import { JobBootstrapService } from './job-bootstrap.service';
import { QueueModule } from './queue.module';

@Module({
  imports: [
    QueueModule,
    RemindersModule,
    PrivacyModule,
    DriversModule,
    CompanyEmailsModule,
    LicenseComplianceModule,
    DepartureCheckModule,
    FineManagementModule,
  ],
  providers: [JobBootstrapService],
})
export class JobsModule {}
