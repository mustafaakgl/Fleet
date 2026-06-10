import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { DefectSeverity, DefectStatus } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequiresWrite } from '../common/decorators/requires-write.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ADMIN_ONLY_ROLES, OPERATIONAL_ROLES } from '../common/utils/permissions';
import { DefectsService } from './defects.service';
import { UpdateDefectStatusDto } from './dto/update-defect-status.dto';

@Controller('defects')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class DefectsController {
  constructor(private readonly defects: DefectsService) {}

  @Get()
  list(
    @Query('vehicle_id') vehicleId?: string,
    @Query('status') status?: DefectStatus,
    @Query('severity') severity?: DefectSeverity,
    @Query('driver_id') driverId?: string,
  ) {
    return this.defects.list({ vehicle_id: vehicleId, status, severity, driver_id: driverId });
  }

  @Get('repair-companies')
  repairCompanies() {
    return this.defects.listRepairCompanies();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.defects.getById(id);
  }

  @Patch(':id/status')
  @RequiresWrite()
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateDefectStatusDto,
    @CurrentUser('id') actorUserId: string,
  ) {
    return this.defects.updateStatus(id, dto, actorUserId);
  }

  @Get(':id/photo/:photoIndex')
  @Roles(...ADMIN_ONLY_ROLES)
  streamPhoto(
    @Param('id') id: string,
    @Param('photoIndex') photoIndexRaw: string,
    @CurrentUser('id') actorUserId: string,
    @CurrentUser('role') actorRole: string,
    @Res() res: Response,
  ) {
    const photoIndex = Number(photoIndexRaw);
    if (!Number.isInteger(photoIndex) || photoIndex < 0) {
      throw new BadRequestException('Invalid photo index');
    }
    return this.defects.streamPhoto(id, photoIndex, actorUserId, actorRole, res);
  }
}
