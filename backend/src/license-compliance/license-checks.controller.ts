import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequiresWrite } from '../common/decorators/requires-write.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ADMIN_ONLY_ROLES, OPERATIONAL_ROLES } from '../common/utils/permissions';
import { RejectLicenseCheckDto } from './dto/reject-license-check.dto';
import { LicenseChecksService } from './license-checks.service';
import { LicenseComplianceService } from './license-compliance.service';

@Controller('license-checks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class LicenseChecksController {
  constructor(
    private readonly licenseChecks: LicenseChecksService,
    private readonly compliance: LicenseComplianceService,
  ) {}

  @Get()
  list(@Query('status') status?: string, @Query('driver_id') driverId?: string) {
    return this.licenseChecks.list({ status, driver_id: driverId });
  }

  @Get('pending')
  listPending() {
    return this.licenseChecks.listPending();
  }

  @Get('compliance-summary')
  complianceSummary() {
    return this.compliance.getComplianceSummary();
  }

  @Get('drivers/:driverId/compliance')
  driverCompliance(@Param('driverId') driverId: string) {
    return this.compliance.getDriverCompliance(driverId);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.licenseChecks.getById(id);
  }

  @Post(':id/approve')
  @RequiresWrite()
  @Roles(...ADMIN_ONLY_ROLES)
  approve(@Param('id') id: string, @CurrentUser('id') actorUserId: string) {
    return this.licenseChecks.approve(id, actorUserId);
  }

  @Post(':id/reject')
  @RequiresWrite()
  @Roles(...ADMIN_ONLY_ROLES)
  reject(
    @Param('id') id: string,
    @Body() dto: RejectLicenseCheckDto,
    @CurrentUser('id') actorUserId: string,
  ) {
    return this.licenseChecks.reject(id, dto, actorUserId);
  }

  @Get(':id/photo/:slot')
  @Roles(...ADMIN_ONLY_ROLES)
  streamPhoto(
    @Param('id') id: string,
    @Param('slot') slot: string,
    @CurrentUser('id') actorUserId: string,
    @CurrentUser('role') actorRole: string,
    @Res() res: Response,
  ) {
    if (slot !== 'front' && slot !== 'back' && slot !== 'selfie') {
      throw new BadRequestException('slot must be front, back, or selfie');
    }
    return this.licenseChecks.streamPhoto(id, slot, actorUserId, actorRole, res);
  }
}
