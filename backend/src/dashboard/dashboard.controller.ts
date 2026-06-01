import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { DriverBlockGuard } from '../common/guards/driver-block.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { FINANCIAL_ROLES, OPERATIONAL_ROLES } from '../common/utils/permissions';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, DriverBlockGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  getDashboard(@Query('date') date?: string, @CurrentUser('role') role?: string) {
    const selectedDate = date ?? new Date().toISOString().slice(0, 10);
    const selectedRole = role ?? 'office';
    return this.dashboardService.getDashboard(selectedDate, selectedRole);
  }

  @Get('revenue-analytics')
  @Roles(...FINANCIAL_ROLES)
  getRevenueAnalytics(@Query('date') date?: string, @CurrentUser('role') role?: string) {
    const selectedDate = date ? new Date(date) : new Date();
    return this.dashboardService.getRevenueAnalytics(selectedDate, role);
  }
}
