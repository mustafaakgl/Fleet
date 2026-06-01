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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { DriverBlockGuard } from '../common/guards/driver-block.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OPERATIONAL_ROLES, OPERATIONAL_WRITE_ROLES } from '../common/utils/permissions';
import { TransportRequestsService } from './transport-requests.service';
import { CreateTransportRequestDto } from './dto/create-transport-request.dto';
import { RejectTransportRequestDto } from './dto/reject-transport-request.dto';

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; role: string };
}

@Controller('transport-requests')
@UseGuards(JwtAuthGuard, DriverBlockGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class TransportRequestsController {
  constructor(private readonly transport: TransportRequestsService) {}

  @Get()
  list(
    @Query('status') status?: string,
    @Query('driver_id') driver_id?: string,
    @Query('date') date?: string,
  ) {
    return this.transport.listRequests({ status, driver_id, date });
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.transport.getById(id);
  }

  @Post()
  @Roles(...OPERATIONAL_WRITE_ROLES)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateTransportRequestDto, @CurrentUser('id') currentUserId?: string) {
    return this.transport.createRequest({
      driverId: dto.driver_id,
      vehicleId: dto.vehicle_id,
      companyId: dto.company_id,
      cargoName: dto.cargo_name,
      cargoOwner: dto.cargo_owner,
      pickupAddress: dto.pickup_address,
      deliveryAddress: dto.delivery_address,
      requestedDate: new Date(dto.requested_date),
      startTime: dto.start_time,
      endTime: dto.end_time,
      notes: dto.notes,
    }, currentUserId);
  }

  @Post(':id/approve')
  @Roles(...OPERATIONAL_WRITE_ROLES)
  @HttpCode(HttpStatus.OK)
  approve(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.transport.approveRequest(id, req.user.id);
  }

  @Post(':id/reject')
  @Roles(...OPERATIONAL_WRITE_ROLES)
  @HttpCode(HttpStatus.OK)
  reject(
    @Param('id') id: string,
    @Body() dto: RejectTransportRequestDto,
    @CurrentUser('id') currentUserId?: string,
  ) {
    return this.transport.rejectRequest(id, dto.reason, currentUserId);
  }
}
