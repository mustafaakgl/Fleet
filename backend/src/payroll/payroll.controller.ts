import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { RequiresWrite } from '../common/decorators/requires-write.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { FINANCIAL_ROLES } from '../common/utils/permissions';
import { OpenPayrollPeriodDto } from './dto/open-payroll-period.dto';
import { UpsertDayTypeMappingDto } from './dto/upsert-day-type-mapping.dto';
import { UpsertDriverPayrollProfileDto } from './dto/upsert-driver-payroll-profile.dto';
import { UpsertPublicHolidayDto } from './dto/upsert-public-holiday.dto';
import { UpsertTenantPayrollProfileDto } from './dto/upsert-tenant-payroll-profile.dto';
import { PayrollPeriodService } from './payroll-period.service';
import { PayrollSettingsService } from './payroll-settings.service';

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; role: string; tenantId: string };
}

/**
 * DATEV Lohn yapilandirma uclari.
 *
 * Rol kapisi faturalamayla ayni desende: okuma FINANCIAL_ROLES (admin, patron,
 * muhasebe), yazma icin uc bazinda RequiresWrite('accounting') — global yazma
 * listesi muhasebeyi disliyor ve muhasebeci kendi bordro ayarini kaydedemezdi.
 */
@Controller('payroll')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...FINANCIAL_ROLES)
export class PayrollController {
  constructor(
    private readonly settings: PayrollSettingsService,
    private readonly periods: PayrollPeriodService,
  ) {}

  @Get('profile')
  getTenantProfile() {
    return this.settings.getTenantProfile();
  }

  @Put('profile')
  @RequiresWrite('accounting')
  upsertTenantProfile(
    @Body() dto: UpsertTenantPayrollProfileDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.settings.upsertTenantProfile(request.user.tenantId, dto, request.user.id);
  }

  @Get('drivers')
  listDriverProfiles() {
    return this.settings.listDriverProfiles();
  }

  @Put('drivers/:driverId/profile')
  @RequiresWrite('accounting')
  upsertDriverProfile(
    @Param('driverId') driverId: string,
    @Body() dto: UpsertDriverPayrollProfileDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.settings.upsertDriverProfile(
      request.user.tenantId,
      driverId,
      dto,
      request.user.id,
    );
  }

  @Get('day-type-mappings')
  listDayTypeMappings(@Req() request: AuthenticatedRequest) {
    return this.settings.listDayTypeMappings(request.user.tenantId);
  }

  @Put('day-type-mappings')
  @RequiresWrite('accounting')
  upsertDayTypeMapping(
    @Body() dto: UpsertDayTypeMappingDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.settings.upsertDayTypeMapping(request.user.tenantId, dto, request.user.id);
  }

  @Get('periods')
  listPeriods() {
    return this.periods.listPeriods();
  }

  /** Ay yoksa acar. Donem kaydi bordronun ilk adimi, ayrica olusturma ucu yok. */
  @Post('periods')
  @RequiresWrite('accounting')
  openPeriod(
    @Body() dto: OpenPayrollPeriodDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.periods.getOrCreatePeriod(request.user.tenantId, dto.year, dto.month);
  }

  @Get('periods/:id')
  getPeriod(@Param('id') id: string) {
    return this.periods.getPeriod(id);
  }

  @Get('periods/:id/drivers/:driverId/days')
  getPeriodDriverDays(@Param('id') id: string, @Param('driverId') driverId: string) {
    return this.periods.getPeriodDriverDays(id, driverId);
  }

  @Post('periods/:id/recompute')
  @RequiresWrite('accounting')
  recomputePeriod(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.periods.recomputePeriod(id, request.user.id);
  }

  @Post('periods/:id/submit')
  @RequiresWrite('accounting')
  submitPeriod(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.periods.submitForReview(id, request.user.id);
  }

  @Post('periods/:id/reopen')
  @RequiresWrite('accounting')
  reopenPeriod(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.periods.reopen(id, request.user.id);
  }

  @Post('periods/:id/approve')
  @RequiresWrite('accounting')
  approvePeriod(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.periods.approve(id, request.user.id);
  }

  @Get('holidays')
  listHolidays(@Query('year') year?: string) {
    return this.settings.listHolidays(year);
  }

  @Post('holidays')
  @RequiresWrite('accounting')
  upsertHoliday(@Body() dto: UpsertPublicHolidayDto, @Req() request: AuthenticatedRequest) {
    return this.settings.upsertHoliday(request.user.tenantId, dto, request.user.id);
  }

  @Delete('holidays/:id')
  @RequiresWrite('accounting')
  deleteHoliday(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.settings.deleteHoliday(id, request.user.id);
  }
}
