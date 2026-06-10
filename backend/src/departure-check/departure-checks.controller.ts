import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OPERATIONAL_ROLES } from '../common/utils/permissions';
import { DepartureCheckService } from './departure-check.service';
import { DepartureChecksService } from './departure-checks.service';

@Controller('departure-checks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class DepartureChecksController {
  constructor(
    private readonly departureChecks: DepartureChecksService,
    private readonly compliance: DepartureCheckService,
  ) {}

  @Get()
  list(
    @Query('driver_id') driverId?: string,
    @Query('vehicle_id') vehicleId?: string,
    @Query('work_date') workDate?: string,
  ) {
    return this.departureChecks.list({ driver_id: driverId, vehicle_id: vehicleId, work_date: workDate });
  }

  @Get('missing-today')
  missingToday() {
    return this.compliance.getMissingChecksToday();
  }

  @Get('vehicles/:vehicleId/compliance')
  vehicleCompliance(@Param('vehicleId') vehicleId: string) {
    return this.compliance.getVehicleCompliance(vehicleId);
  }

  @Get('vehicles/:vehicleId/history')
  vehicleHistory(@Param('vehicleId') vehicleId: string) {
    return this.departureChecks.listForVehicle(vehicleId);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.departureChecks.getById(id);
  }
}
