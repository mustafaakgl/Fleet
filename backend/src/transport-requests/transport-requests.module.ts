import { Module } from '@nestjs/common';
import { TransportRequestsController } from './transport-requests.controller';
import { TransportRequestsService } from './transport-requests.service';
import { AuditModule } from '../audit/audit.module';
import { CompanyEmailsModule } from '../company-emails/company-emails.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, CompanyEmailsModule, AuditModule, NotificationsModule],
  controllers: [TransportRequestsController],
  providers: [TransportRequestsService],
  exports: [TransportRequestsService],
})
export class TransportRequestsModule {}
