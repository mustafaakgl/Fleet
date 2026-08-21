import { Module } from '@nestjs/common';
import { ActualRevenueService } from '../common/finance/actual-revenue.service';
import { PrismaModule } from '../prisma/prisma.module';
import { FinanceController } from './finance.controller';
import { FinanceSummaryService } from './finance-summary.service';

@Module({
  imports: [PrismaModule],
  controllers: [FinanceController],
  providers: [FinanceSummaryService, ActualRevenueService],
})
export class FinanceModule {}
