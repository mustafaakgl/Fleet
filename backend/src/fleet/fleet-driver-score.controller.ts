import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OPERATIONAL_ROLES } from '../common/utils/permissions';
import { DriverScoreQueryDto } from './dto/driver-score.query';
import { FleetDriverScoreService } from './fleet-driver-score.service';

@Controller('driver/fleet')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('driver')
export class FleetDriverScoreDriverController {
  constructor(private readonly driverScore: FleetDriverScoreService) {}

  @Get('score')
  getMyScore(@CurrentUser('id') userId: string, @Query() query: DriverScoreQueryDto) {
    return this.driverScore.getDriverScoreForUser(userId, query);
  }
}

@Controller('fleet/drivers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class FleetDriverScoreController {
  constructor(private readonly driverScore: FleetDriverScoreService) {}

  @Get(':driverId/score')
  getDriverScore(@Param('driverId') driverId: string, @Query() query: DriverScoreQueryDto) {
    return this.driverScore.getDriverScore(driverId, query);
  }
}
