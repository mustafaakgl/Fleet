import { Module } from '@nestjs/common';
import { CompanyEmailsController } from './company-emails.controller';
import { CompanyEmailsService } from './company-emails.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CompanyEmailsController],
  providers: [CompanyEmailsService],
  exports: [CompanyEmailsService],
})
export class CompanyEmailsModule {}
