import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { DriverBlockGuard } from '../common/guards/driver-block.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequiresWrite } from '../common/decorators/requires-write.decorator';
import { OPERATIONAL_ROLES } from '../common/utils/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RemindersService } from './reminders.service';

@Controller('reminders')
@UseGuards(JwtAuthGuard, DriverBlockGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Get()
  listReminders(
    @Query('status') status?: string,
    @Query('reminderType') reminderType?: string,
    @Query('targetType') targetType?: string,
  ) {
    return this.remindersService.listReminders({
      status,
      reminderType,
      targetType,
    });
  }

  @Post('generate')
  @RequiresWrite()
  generateReminders(@CurrentUser('id') actorUserId?: string) {
    return this.remindersService.generateReminders(actorUserId);
  }

  @Post(':id/resolve')
  @RequiresWrite()
  resolveReminder(@Param('id') id: string, @CurrentUser('id') actorUserId?: string) {
    return this.remindersService.resolveReminder(id, actorUserId);
  }

  @Post(':id/ignore')
  @RequiresWrite()
  ignoreReminder(@Param('id') id: string, @CurrentUser('id') actorUserId?: string) {
    return this.remindersService.ignoreReminder(id, actorUserId);
  }
}
