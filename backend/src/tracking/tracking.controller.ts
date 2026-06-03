import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OPERATIONAL_ROLES } from '../common/utils/permissions';
import { LiveTrackingQueryDto } from './dto/live-tracking-query.dto';
import { LocationHistoryQueryDto } from './dto/location-history-query.dto';
import { TrackingService } from './tracking.service';

@Controller('tracking')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Get('live')
  getLiveTracking(@Query() query: LiveTrackingQueryDto) {
    return this.trackingService.getLiveTracking({
      staleAfterSec: query.staleAfterSec ?? 300,
      includeOffline: query.includeOffline ?? false,
      search: query.search,
    });
  }

  @Get('drivers/:driverId/latest')
  getDriverLatest(@Param('driverId') driverId: string) {
    return this.trackingService.getDriverLatest(driverId);
  }

  @Get('drivers/:driverId/history')
  getDriverHistory(
    @Param('driverId') driverId: string,
    @Query() query: LocationHistoryQueryDto,
    @CurrentUser('id') currentUserId: string,
  ) {
    return this.trackingService.getDriverHistory(driverId, {
      from: query.from,
      to: query.to,
      limit: query.limit ?? 500,
    }, currentUserId);
  }

  @Get('vehicles/:vehicleId/history')
  getVehicleHistory(
    @Param('vehicleId') vehicleId: string,
    @Query() query: LocationHistoryQueryDto,
    @CurrentUser('id') currentUserId: string,
  ) {
    return this.trackingService.getVehicleHistory(vehicleId, {
      from: query.from,
      to: query.to,
      limit: query.limit ?? 500,
    }, currentUserId);
  }
}
