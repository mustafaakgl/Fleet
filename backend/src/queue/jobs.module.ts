import { Module } from '@nestjs/common';
import { CompanyEmailsModule } from '../company-emails/company-emails.module';
import { DriversModule } from '../drivers/drivers.module';
import { PrivacyModule } from '../privacy/privacy.module';
import { RemindersModule } from '../reminders/reminders.module';
import { JobBootstrapService } from './job-bootstrap.service';
import { QueueModule } from './queue.module';

@Module({
  imports: [QueueModule, RemindersModule, PrivacyModule, DriversModule, CompanyEmailsModule],
  providers: [JobBootstrapService],
})
export class JobsModule {}
