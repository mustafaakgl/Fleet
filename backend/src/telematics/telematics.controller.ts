import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OPERATIONAL_ROLES } from '../common/utils/permissions';
import { DriverScoresQueryDto, DriverTripsQueryDto } from './dto/driver-scores.query';
import { VehicleHealthSeriesQueryDto } from './dto/vehicle-health-series.query';
import { TelematicsService } from './telematics.service';

@Controller('telematics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class TelematicsController {
  constructor(private readonly telematics: TelematicsService) {}

  @Get('vehicle-health')
  getVehicleHealth() {
    return this.telematics.getVehicleHealth();
  }

  @Get('vehicle-health/:vehicleId/series')
  getVehicleHealthSeries(
    @Param('vehicleId') vehicleId: string,
    @Query() query: VehicleHealthSeriesQueryDto,
  ) {
    return this.telematics.getVehicleHealthSeries(vehicleId, query.window);
  }

  @Get('driver-scores')
  getDriverScores(@Query() query: DriverScoresQueryDto) {
    return this.telematics.getDriverScores(query);
  }

  @Get('driver-scores/:driverId/trips')
  getDriverTrips(@Param('driverId') driverId: string, @Query() query: DriverTripsQueryDto) {
    return this.telematics.getDriverTrips(driverId, query);
  }
}
