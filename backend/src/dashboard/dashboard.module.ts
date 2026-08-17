import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { CostDashboardService } from './cost-dashboard.service';
import { DashboardService } from './dashboard.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DashboardController],
  providers: [DashboardService, CostDashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
