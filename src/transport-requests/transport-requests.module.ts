import { Module } from '@nestjs/common';
import { TransportRequestsController } from './transport-requests.controller';
import { TransportRequestsService } from './transport-requests.service';
import { CompanyEmailsModule } from '../company-emails/company-emails.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, CompanyEmailsModule],
  controllers: [TransportRequestsController],
  providers: [TransportRequestsService],
  exports: [TransportRequestsService],
})
export class TransportRequestsModule {}
