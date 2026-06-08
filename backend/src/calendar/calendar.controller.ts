import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CalendarSource } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequiresWrite } from '../common/decorators/requires-write.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { DriverBlockGuard } from '../common/guards/driver-block.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OPERATIONAL_ROLES } from '../common/utils/permissions';
import { CalendarService } from './calendar.service';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';

@Controller('calendar')
@UseGuards(JwtAuthGuard, DriverBlockGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get()
  list(
    @Query('driver_id') driver_id?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.calendar.listCalendarEvents({ driver_id, from, to });
  }

  @Get('driver/:driverId')
  getDriverCalendar(@Param('driverId') driverId: string) {
    return this.calendar.getDriverCalendar(driverId);
  }

  @Post()
  @RequiresWrite()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateCalendarEventDto, @CurrentUser('id') actorUserId?: string) {
    return this.calendar.createCalendarEvent(
      {
        driverId: dto.driver_id,
        assignmentId: dto.assignment_id,
        date: new Date(dto.date),
        status: dto.status,
        uiStatus: dto.ui_status,
        source: CalendarSource.manual,
      },
      actorUserId,
    );
  }

  @Delete(':id')
  @RequiresWrite()
  remove(@Param('id') id: string, @CurrentUser('id') actorUserId?: string) {
    return this.calendar.deleteCalendarEvent(id, actorUserId);
  }
}
