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
import { Roles } from '../common/decorators/roles.decorator';
import { DriverBlockGuard } from '../common/guards/driver-block.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OPERATIONAL_ROLES, OPERATIONAL_WRITE_ROLES } from '../common/utils/permissions';
import { AssignmentsService } from './assignments.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import { TransitionAssignmentDto } from './dto/transition-assignment.dto';

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; role: string };
}

@Controller('assignments')
@UseGuards(JwtAuthGuard, DriverBlockGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Get()
  list(
    @Query('date') date?: string,
    @Query('driver_id') driver_id?: string,
    @Query('vehicle_id') vehicle_id?: string,
    @Query('status') status?: string,
  ) {
    return this.assignments.list({ date, driver_id, vehicle_id, status });
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.assignments.getById(id);
  }

  @Post()
  @Roles(...OPERATIONAL_WRITE_ROLES)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateAssignmentDto, @Req() req: AuthenticatedRequest) {
    return this.assignments.create(dto, req.user.id);
  }

  @Patch(':id')
  @Roles(...OPERATIONAL_WRITE_ROLES)
  update(@Param('id') id: string, @Body() dto: UpdateAssignmentDto, @Req() req: AuthenticatedRequest) {
    return this.assignments.update(id, dto, req.user.id);
  }

  @Post(':id/cancel')
  @Roles(...OPERATIONAL_WRITE_ROLES)
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.assignments.cancel(id, req.user.id);
  }

  @Post(':id/transition')
  @Roles(...OPERATIONAL_WRITE_ROLES)
  @HttpCode(HttpStatus.OK)
  transition(
    @Param('id') id: string,
    @Body() dto: TransitionAssignmentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.assignments.transition(id, dto.to, req.user.id);
  }
}
