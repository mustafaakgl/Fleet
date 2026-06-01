import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { DriverBlockGuard } from '../common/guards/driver-block.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OPERATIONAL_ROLES, OPERATIONAL_WRITE_ROLES } from '../common/utils/permissions';
import { CreateVehicleHandoverDto } from './dto/create-vehicle-handover.dto';
import { UpdateVehicleHandoverDto } from './dto/update-vehicle-handover.dto';
import { VehicleHandoversService } from './vehicle-handovers.service';

@Controller('vehicle-handovers')
@UseGuards(JwtAuthGuard, DriverBlockGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class VehicleHandoversController {
  constructor(private readonly vehicleHandoversService: VehicleHandoversService) {}

  @Get()
  listHandovers(
    @Query('driverId') driverId?: string,
    @Query('vehicleId') vehicleId?: string,
    @Query('assignmentId') assignmentId?: string,
    @Query('status') status?: string,
    @Query('photoStatus') photoStatus?: string,
    @Query('date') date?: string,
  ) {
    return this.vehicleHandoversService.listHandovers({
      driverId,
      vehicleId,
      assignmentId,
      status,
      photoStatus,
      date,
    });
  }

  @Get(':id')
  getHandoverById(@Param('id') id: string) {
    return this.vehicleHandoversService.getHandoverById(id);
  }

  @Post()
  @Roles(...OPERATIONAL_WRITE_ROLES)
  createHandover(@Body() dto: CreateVehicleHandoverDto, @CurrentUser('id') currentUserId?: string) {
    return this.vehicleHandoversService.createHandover(dto, currentUserId);
  }

  @Post('from-assignment/:assignmentId')
  @Roles(...OPERATIONAL_WRITE_ROLES)
  createHandoverFromAssignment(
    @Param('assignmentId') assignmentId: string,
    @CurrentUser('id') currentUserId?: string,
  ) {
    return this.vehicleHandoversService.createHandoverFromAssignment(assignmentId, currentUserId);
  }

  @Patch(':id')
  @Roles(...OPERATIONAL_WRITE_ROLES)
  updateHandover(@Param('id') id: string, @Body() dto: UpdateVehicleHandoverDto) {
    return this.vehicleHandoversService.updateHandover(id, dto);
  }

  @Post(':id/approve-photo')
  @Roles(...OPERATIONAL_WRITE_ROLES)
  approvePhoto(@Param('id') id: string) {
    return this.vehicleHandoversService.approvePhoto(id);
  }

  @Post(':id/reject-photo')
  @Roles(...OPERATIONAL_WRITE_ROLES)
  rejectPhoto(@Param('id') id: string, @CurrentUser('id') currentUserId?: string) {
    return this.vehicleHandoversService.rejectPhoto(id, currentUserId);
  }

  @Post(':id/complete')
  @Roles(...OPERATIONAL_WRITE_ROLES)
  markCompleted(@Param('id') id: string, @CurrentUser('id') currentUserId?: string) {
    return this.vehicleHandoversService.markCompleted(id, currentUserId);
  }
}
