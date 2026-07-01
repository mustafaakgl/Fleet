import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { RequiresWrite } from '../common/decorators/requires-write.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { DevicesService } from './devices.service';

@Controller('devices')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'boss', 'office')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  list() {
    return this.devicesService.list();
  }

  @Get('unassigned')
  listUnassigned() {
    return this.devicesService.listUnassigned();
  }

  @Post()
  @RequiresWrite()
  create(@Body() dto: CreateDeviceDto) {
    return this.devicesService.create(dto);
  }

  @Patch(':id')
  @RequiresWrite()
  update(@Param('id') id: string, @Body() dto: UpdateDeviceDto) {
    return this.devicesService.update(id, dto);
  }

  @Delete(':id')
  @RequiresWrite()
  remove(@Param('id') id: string) {
    return this.devicesService.remove(id);
  }
}
