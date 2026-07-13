import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequiresWrite } from '../common/decorators/requires-write.decorator';
import { DriverBlockGuard } from '../common/guards/driver-block.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OPERATIONAL_ROLES } from '../common/utils/permissions';
import { CorrectWorkSessionDto } from './dto/correct-work-session.dto';
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
    @Query('stale_open') staleOpen?: string,
  ) {
    return this.workSessionsService.listSessions({
      driverId,
      dateFrom,
      dateTo,
      status,
      staleOpen: staleOpen === 'true',
    });
  }

  @Patch(':id/correct')
  @RequiresWrite()
  @HttpCode(HttpStatus.OK)
  correct(@Param('id') id: string, @Body() dto: CorrectWorkSessionDto, @CurrentUser('id') actorUserId: string) {
    return this.workSessionsService.correctSessionById(id, dto, actorUserId);
  }
}
