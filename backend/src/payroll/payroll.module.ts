import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PayrollController } from './payroll.controller';
import { PayrollPeriodService } from './payroll-period.service';
import { PayrollSettingsService } from './payroll-settings.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [PayrollController],
  providers: [PayrollSettingsService, PayrollPeriodService],
  exports: [PayrollSettingsService, PayrollPeriodService],
})
export class PayrollModule {}
