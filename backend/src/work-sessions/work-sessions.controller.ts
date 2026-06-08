import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { DriverBlockGuard } from '../common/guards/driver-block.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OPERATIONAL_ROLES } from '../common/utils/permissions';
import { WorkSessionsService } from './work-sessions.service';

@Controller('work-sessions')
@UseGuards(JwtAuthGuard, DriverBlockGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class WorkSessionsController {
  constructor(private readonly workSessionsService: WorkSessionsService) {}

  @Get()
  list(
    @Query('driver_id') driverId?: string,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('status') status?: 'active' | 'ended',
  ) {
    return this.workSessionsService.listSessions({
      driverId,
      dateFrom,
      dateTo,
      status,
    });
  }
}
