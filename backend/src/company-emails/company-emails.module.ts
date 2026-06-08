import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';
import { CompanyEmailsController } from './company-emails.controller';
import { CompanyEmailsScheduler } from './company-emails.scheduler';
import { CompanyEmailsService } from './company-emails.service';

@Module({
  imports: [PrismaModule, AuditModule, MailModule, QueueModule],
  controllers: [CompanyEmailsController],
  providers: [CompanyEmailsService, CompanyEmailsScheduler],
  exports: [CompanyEmailsService],
})
export class CompanyEmailsModule {}
