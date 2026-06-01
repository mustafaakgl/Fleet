import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { DriverBlockGuard } from '../common/guards/driver-block.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { canViewFinancialFields, maskFinancialFields, OPERATIONAL_ROLES } from '../common/utils/permissions';
import { CreateAccidentDto } from './dto/create-accident.dto';
import { UpdateAccidentDto } from './dto/update-accident.dto';
import { AccidentsService } from './accidents.service';

@Controller('accidents')
@UseGuards(JwtAuthGuard, DriverBlockGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class AccidentsController {
  constructor(private readonly accidentsService: AccidentsService) {}

  @Get()
  listIncidents(
    @Query('type') type?: string,
    @Query('driverId') driverId?: string,
    @Query('vehicleId') vehicleId?: string,
    @Query('companyId') companyId?: string,
    @Query('assignmentId') assignmentId?: string,
    @Query('status') status?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @CurrentUser('role') role?: string,
  ) {
    return this.accidentsService.listIncidents({
      type,
      driverId,
      vehicleId,
      companyId,
      assignmentId,
      status,
      dateFrom,
      dateTo,
    }).then((data) => maskFinancialFields(data, role));
  }

  @Get('driver/:driverId')
  getDriverIncidents(@Param('driverId') driverId: string, @CurrentUser('role') role?: string) {
    return this.accidentsService.getDriverIncidents(driverId).then((data) => maskFinancialFields(data, role));
  }

  @Get('vehicle/:vehicleId')
  getVehicleIncidents(@Param('vehicleId') vehicleId: string, @CurrentUser('role') role?: string) {
    return this.accidentsService.getVehicleIncidents(vehicleId).then((data) => maskFinancialFields(data, role));
  }

  @Get('company/:companyId')
  getCompanyIncidents(@Param('companyId') companyId: string, @CurrentUser('role') role?: string) {
    return this.accidentsService.getCompanyIncidents(companyId).then((data) => maskFinancialFields(data, role));
  }

  @Post('recalculate-risk/:driverId')
  recalculateDriverRisk(@Param('driverId') driverId: string) {
    return this.accidentsService.recalculateDriverRisk(driverId);
  }

  @Get(':id')
  getIncidentById(@Param('id') id: string, @CurrentUser('role') role?: string) {
    return this.accidentsService.getIncidentById(id).then((data) => maskFinancialFields(data, role));
  }

  @Post()
  createIncident(@Body() data: CreateAccidentDto, @CurrentUser('role') role?: string) {
    if (!canViewFinancialFields(role) && data.damageValue !== undefined) {
      throw new ForbiddenException('You do not have permission to set damage value');
    }
    return this.accidentsService.createIncident(data).then((result) => maskFinancialFields(result, role));
  }

  @Patch(':id')
  updateIncident(@Param('id') id: string, @Body() data: UpdateAccidentDto, @CurrentUser('role') role?: string) {
    if (!canViewFinancialFields(role) && data.damageValue !== undefined) {
      throw new ForbiddenException('You do not have permission to update damage value');
    }
    return this.accidentsService.updateIncident(id, data).then((result) => maskFinancialFields(result, role));
  }

  @Patch(':id/status')
  updateIncidentStatus(
    @Param('id') id: string,
    @Body('status') status: 'reported' | 'under_review' | 'resolved' | 'rejected',
    @CurrentUser('role') role?: string,
  ) {
    return this.accidentsService.updateIncidentStatus(id, status).then((result) => maskFinancialFields(result, role));
  }
}
