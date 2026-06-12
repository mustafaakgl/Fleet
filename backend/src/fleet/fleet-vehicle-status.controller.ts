import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OPERATIONAL_ROLES } from '../common/utils/permissions';
import { OdometerCorrectionDto } from './dto/odometer-correction.dto';
import { FleetVehicleStatusService } from './fleet-vehicle-status.service';

@Controller('driver/fleet/vehicles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('driver')
export class FleetVehicleStatusDriverController {
  constructor(private readonly vehicleStatus: FleetVehicleStatusService) {}

  @Get(':vehicleId/status')
  getStatus(@CurrentUser('id') userId: string, @Param('vehicleId') vehicleId: string) {
    return this.vehicleStatus.getVehicleStatusForDriver(userId, vehicleId);
  }

  @Post(':vehicleId/odometer-correction')
  correctOdometer(
    @CurrentUser('id') userId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() dto: OdometerCorrectionDto,
  ) {
    return this.vehicleStatus.applyOdometerCorrectionForDriver(userId, vehicleId, dto);
  }
}

@Controller('fleet/vehicles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class FleetVehicleStatusController {
  constructor(private readonly vehicleStatus: FleetVehicleStatusService) {}

  @Get(':vehicleId/status')
  getStatus(@Param('vehicleId') vehicleId: string) {
    return this.vehicleStatus.getVehicleStatus(vehicleId);
  }

  @Post(':vehicleId/odometer-correction')
  correctOdometer(@Param('vehicleId') vehicleId: string, @Body() dto: OdometerCorrectionDto) {
    return this.vehicleStatus.applyOdometerCorrection(vehicleId, dto);
  }
}
