import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { DriverBlockGuard } from '../common/guards/driver-block.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { FINANCIAL_ROLES, OPERATIONAL_ROLES } from '../common/utils/permissions';
import { CostDashboardService } from './cost-dashboard.service';
import { DashboardService } from './dashboard.service';
import { CostDashboardQueryDto } from './dto/cost-dashboard.query';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, DriverBlockGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService,
    private readonly costDashboard: CostDashboardService,
  ) {}

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

  @Get('revenue-by-company')
  @Roles(...FINANCIAL_ROLES)
  getRevenueByCompany(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @CurrentUser('role') role?: string,
  ) {
    return this.dashboardService.getRevenueByCompany(from, to, role);
  }

  /**
   * Arac maliyeti dashboard'u (Faz 8).
   *
   * `vehicle-costs` ucu KORUNUYOR — mevcut CSV ve tablo ona bagli. Bu uc ayni
   * canonical kaynaklardan TUREYEN karsilastirmali gorunumu doner; ayni veriyi
   * iki yerde HESAPLAMIYOR, ikisi de CostDashboardService/DashboardService
   * uzerinden ayni kurallari kullaniyor.
   */
  @Get('cost-dashboard')
  @Roles(...FINANCIAL_ROLES)
  getCostDashboard(@Query() query: CostDashboardQueryDto) {
    return this.costDashboard.getCostDashboard(query);
  }

  @Get('vehicle-costs')
  @Roles(...FINANCIAL_ROLES)
  getVehicleCosts(@Query('months') months?: string) {
    const parsed = months ? Number.parseInt(months, 10) : 6;
    return this.dashboardService.getVehicleCosts(Number.isNaN(parsed) ? 6 : parsed);
  }
}
