import { Module } from '@nestjs/common';
import { TenantCurrencyService } from '../common/utils/tenant-currency.service';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ServiceRecordsController } from './service-records.controller';
import { ServiceRecordsService } from './service-records.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [ServiceRecordsController],
  providers: [ServiceRecordsService, TenantCurrencyService],
  exports: [ServiceRecordsService],
})
export class ServiceRecordsModule {}
