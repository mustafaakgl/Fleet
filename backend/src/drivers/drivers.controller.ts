import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { DriverBlockGuard } from '../common/guards/driver-block.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OPERATIONAL_ROLES } from '../common/utils/permissions';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { DriverBirthdaysService } from './driver-birthdays.service';
import { DriversService } from './drivers.service';

@Controller('drivers')
@UseGuards(JwtAuthGuard, DriverBlockGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class DriversController {
  constructor(
    private readonly driversService: DriversService,
    private readonly driverBirthdaysService: DriverBirthdaysService,
  ) {}

  @Post('birthdays/send-today')
  sendTodayBirthdayNotifications() {
    return this.driverBirthdaysService.sendTodayBirthdayNotifications();
  }

  @Get()
  listDrivers(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.driversService.listDrivers({
      status,
      search,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
  }

  @Get(':id')
  getDriver(@Param('id') id: string) {
    return this.driversService.getById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createDriver(@Body() dto: CreateDriverDto) {
    return this.driversService.create(dto);
  }

  @Patch(':id')
  updateDriver(@Param('id') id: string, @Body() dto: UpdateDriverDto) {
    return this.driversService.update(id, dto);
  }

  @Delete(':id')
  deactivateDriver(@Param('id') id: string) {
    return this.driversService.deactivate(id);
  }

  @Get(':id/handovers')
  getHandovers(@Param('id') id: string) {
    return this.driversService.getHandovers(id);
  }

  @Get(':id/incidents')
  getIncidents(@Param('id') id: string) {
    return this.driversService.getIncidents(id);
  }

  @Get(':id/risk')
  getRisk(@Param('id') id: string) {
    return this.driversService.getRisk(id);
  }
}
