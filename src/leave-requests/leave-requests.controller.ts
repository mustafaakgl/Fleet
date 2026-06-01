import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { LeaveRequestsService } from './leave-requests.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; role: string };
}

@Controller('leave-requests')
@UseGuards(JwtAuthGuard, DriverBlockGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class LeaveRequestsController {
  constructor(private readonly leaveRequests: LeaveRequestsService) {}

  @Get()
  list(
    @Query('driver_id') driver_id?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
  ) {
    return this.leaveRequests.list({ driver_id, status, type });
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.leaveRequests.getById(id);
  }

  @Post()
  @Roles(...OPERATIONAL_WRITE_ROLES)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateLeaveRequestDto) {
    return this.leaveRequests.create({
      driverId: dto.driver_id,
      type: dto.type,
      startDate: new Date(dto.start_date),
      endDate: new Date(dto.end_date),
      reason: dto.reason,
    });
  }

  @Post(':id/approve')
  @Roles(...OPERATIONAL_WRITE_ROLES)
  @HttpCode(HttpStatus.OK)
  approve(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.leaveRequests.approveLeaveRequest(id, req.user.id);
  }

  @Post(':id/reject')
  @Roles(...OPERATIONAL_WRITE_ROLES)
  @HttpCode(HttpStatus.OK)
  reject(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.leaveRequests.rejectLeaveRequest(id, req.user.id);
  }

  @Post(':id/cancel')
  @Roles(...OPERATIONAL_WRITE_ROLES)
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id') id: string) {
    return this.leaveRequests.cancelLeaveRequest(id);
  }

  @Post(':id/needs-review')
  @Roles(...OPERATIONAL_WRITE_ROLES)
  @HttpCode(HttpStatus.OK)
  needsReview(@Param('id') id: string) {
    return this.leaveRequests.moveToNeedsReview(id);
  }
}
