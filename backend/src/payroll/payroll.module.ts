import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PayrollController } from './payroll.controller';
import { PayrollSettingsService } from './payroll-settings.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [PayrollController],
  providers: [PayrollSettingsService],
  exports: [PayrollSettingsService],
})
export class PayrollModule {}
