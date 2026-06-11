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
import { RequiresWrite } from '../common/decorators/requires-write.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { DriverBlockGuard } from '../common/guards/driver-block.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OPERATIONAL_ROLES } from '../common/utils/permissions';
import { CustomerMessagesService } from '../customer-portal/customer-messages.service';
import { SendCustomerMessageDto } from '../customer-portal/dto/send-customer-message.dto';
import { AssignmentsService } from './assignments.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { CopyDayDto } from './dto/copy-day.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import { TransitionAssignmentDto } from './dto/transition-assignment.dto';

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; role: string };
}

@Controller('assignments')
@UseGuards(JwtAuthGuard, DriverBlockGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class AssignmentsController {
  constructor(
    private readonly assignments: AssignmentsService,
    private readonly customerMessages: CustomerMessagesService,
  ) {}

  @Get()
  list(
    @Query('date') date?: string,
    @Query('driver_id') driver_id?: string,
    @Query('vehicle_id') vehicle_id?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.assignments.list({
      date,
      driver_id,
      vehicle_id,
      status,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id/customer-messages')
  listCustomerMessages(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.customerMessages.listForFleet(id, req.user.id);
  }

  @Post(':id/customer-messages')
  @RequiresWrite()
  @HttpCode(HttpStatus.CREATED)
  sendCustomerMessage(
    @Param('id') id: string,
    @Body() dto: SendCustomerMessageDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.customerMessages.sendFromFleet(id, req.user.id, dto.body);
  }

  @Post('copy-day')
  @RequiresWrite()
  @HttpCode(HttpStatus.OK)
  copyDay(@Body() dto: CopyDayDto, @Req() req: AuthenticatedRequest) {
    return this.assignments.copyDay(dto.from_date, dto.to_date, req.user.id);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.assignments.getById(id);
  }

  @Post()
  @RequiresWrite()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateAssignmentDto, @Req() req: AuthenticatedRequest) {
    return this.assignments.create(dto, req.user.id);
  }

  @Patch(':id')
  @RequiresWrite()
  update(@Param('id') id: string, @Body() dto: UpdateAssignmentDto, @Req() req: AuthenticatedRequest) {
    return this.assignments.update(id, dto, req.user.id);
  }

  @Post(':id/cancel')
  @RequiresWrite()
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.assignments.cancel(id, req.user.id);
  }

  @Post(':id/transition')
  @RequiresWrite()
  @HttpCode(HttpStatus.OK)
  transition(
    @Param('id') id: string,
    @Body() dto: TransitionAssignmentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.assignments.transition(id, dto.to, req.user.id);
  }
}
