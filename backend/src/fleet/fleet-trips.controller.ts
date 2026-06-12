import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OPERATIONAL_ROLES } from '../common/utils/permissions';
import { BatchFleetTripLocationsDto } from './dto/batch-fleet-trip-locations.dto';
import { ListFleetTripsQueryDto } from './dto/list-fleet-trips.query';
import { StartFleetTripDto } from './dto/start-fleet-trip.dto';
import { FleetTripsService } from './fleet-trips.service';

@Controller('driver/fleet/trips')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('driver')
export class FleetTripsDriverController {
  constructor(private readonly fleetTrips: FleetTripsService) {}

  @Post('start')
  start(@CurrentUser('id') userId: string, @Body() dto: StartFleetTripDto) {
    return this.fleetTrips.startTripForDriver(userId, dto.vehicleId);
  }

  @Post(':id/stop')
  @HttpCode(HttpStatus.OK)
  stop(@CurrentUser('id') userId: string, @Param('id') tripId: string) {
    return this.fleetTrips.stopTripForDriver(userId, tripId);
  }

  @Post(':id/locations')
  @HttpCode(HttpStatus.OK)
  appendLocations(
    @CurrentUser('id') userId: string,
    @Param('id') tripId: string,
    @Body() dto: BatchFleetTripLocationsDto,
  ) {
    return this.fleetTrips.appendLocationsForDriver(userId, tripId, dto.points);
  }

  @Get()
  list(@CurrentUser('id') userId: string, @Query() query: ListFleetTripsQueryDto) {
    return this.fleetTrips.listTripsForDriver(userId, query);
  }

  @Get(':id')
  getById(@CurrentUser('id') userId: string, @Param('id') tripId: string) {
    return this.fleetTrips.getTripByIdForDriver(userId, tripId);
  }
}

@Controller('fleet/trips')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class FleetTripsController {
  constructor(private readonly fleetTrips: FleetTripsService) {}

  @Get()
  list(@Query() query: ListFleetTripsQueryDto) {
    return this.fleetTrips.listTrips(query);
  }

  @Get(':id')
  getById(@Param('id') tripId: string) {
    return this.fleetTrips.getTripById(tripId);
  }
}
