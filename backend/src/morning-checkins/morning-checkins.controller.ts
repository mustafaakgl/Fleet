import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { DriverBlockGuard } from '../common/guards/driver-block.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OPERATIONAL_ROLES, OPERATIONAL_WRITE_ROLES } from '../common/utils/permissions';
import { MorningCheckinsService } from './morning-checkins.service';
import { CreateMorningCheckinDto } from './dto/create-morning-checkin.dto';
import { UpdateMorningCheckinDto } from './dto/update-morning-checkin.dto';

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; role: string };
}

@Controller('morning-checkins')
@UseGuards(JwtAuthGuard, DriverBlockGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class MorningCheckinsController {
  constructor(private readonly morningCheckins: MorningCheckinsService) {}

  @Get()
  list(
    @Query('date') date?: string,
    @Query('driver_id') driver_id?: string,
    @Query('status') status?: string,
  ) {
    return this.morningCheckins.list({ date, driver_id, status });
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.morningCheckins.getById(id);
  }

  @Post()
  @Roles(...OPERATIONAL_WRITE_ROLES)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateMorningCheckinDto, @CurrentUser('id') actorUserId: string) {
    return this.morningCheckins.create(dto, actorUserId);
  }

  @Patch(':id')
  @Roles(...OPERATIONAL_WRITE_ROLES)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMorningCheckinDto,
    @CurrentUser('id') actorUserId: string,
  ) {
    return this.morningCheckins.update(id, dto, actorUserId);
  }

  @Post(':id/add-to-einsatzplan')
  @Roles(...OPERATIONAL_WRITE_ROLES)
  @HttpCode(HttpStatus.OK)
  addToEinsatzplan(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.morningCheckins.addToEinsatzplan(id, req.user.id);
  }
}
