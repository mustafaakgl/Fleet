import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseFilePipeBuilder,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { RequiresWrite } from '../common/decorators/requires-write.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { DriverBlockGuard } from '../common/guards/driver-block.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OPERATIONAL_ROLES } from '../common/utils/permissions';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { VehiclesService } from './vehicles.service';
import {
  UploadedVehiclePhotoFile,
  VEHICLE_PHOTO_MAX_BYTES,
  VEHICLE_PHOTO_UPLOAD_INTERCEPTOR,
} from './vehicle-photo-upload';

@Controller('vehicles')
@UseGuards(JwtAuthGuard, DriverBlockGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get()
  listVehicles(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.vehiclesService.list({
      status,
      search,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
  }

  @Get(':id/photo')
  async downloadVehiclePhoto(
    @Param('id') id: string,
    @CurrentUser('id') actorUserId: string,
    @Res() res: Response,
  ) {
    const file = await this.vehiclesService.resolveVehiclePhotoDownload(id);
    await this.vehiclesService.recordVehiclePhotoDownload(id, actorUserId);

    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(file.fileName)}"`,
      'Cache-Control': 'private, no-store',
    });

    file.stream.pipe(res);
  }

  @Get(':id')
  getVehicle(@Param('id') id: string) {
    return this.vehiclesService.getById(id);
  }

  @Post()
  @RequiresWrite()
  @HttpCode(HttpStatus.CREATED)
  createVehicle(
    @Body() dto: CreateVehicleDto,
    @CurrentUser('id') actorUserId: string,
    @CurrentUser('tenantId') tenantId: string | undefined,
  ) {
    return this.vehiclesService.create(dto, actorUserId, tenantId);
  }

  @Patch(':id')
  @RequiresWrite()
  updateVehicle(
    @Param('id') id: string,
    @Body() dto: UpdateVehicleDto,
    @CurrentUser('id') actorUserId: string,
  ) {
    return this.vehiclesService.update(id, dto, actorUserId);
  }

  @Post(':id/photo')
  @RequiresWrite()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(VEHICLE_PHOTO_UPLOAD_INTERCEPTOR)
  uploadVehiclePhoto(
    @Param('id') id: string,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: VEHICLE_PHOTO_MAX_BYTES })
        .build({
          fileIsRequired: true,
          errorHttpStatusCode: HttpStatus.BAD_REQUEST,
        }),
    )
    file: UploadedVehiclePhotoFile,
    @CurrentUser('id') actorUserId: string,
  ) {
    return this.vehiclesService.uploadPhoto(id, file, actorUserId);
  }

  @Delete(':id')
  @RequiresWrite()
  deactivateVehicle(@Param('id') id: string, @CurrentUser('id') actorUserId: string) {
    return this.vehiclesService.deactivate(id, actorUserId);
  }

  @Get(':id/assignments')
  getAssignments(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
  ) {
    return this.vehiclesService.getAssignments(id, { from, to, status });
  }

  @Get(':id/handovers')
  getHandovers(@Param('id') id: string) {
    return this.vehiclesService.getHandovers(id);
  }

  @Get(':id/incidents')
  getIncidents(@Param('id') id: string) {
    return this.vehiclesService.getIncidents(id);
  }
}
