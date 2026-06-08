import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RequiresWrite } from '../common/decorators/requires-write.decorator';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { DriverBlockGuard } from '../common/guards/driver-block.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ADMIN_ONLY_ROLES } from '../common/utils/permissions';
import { AnonymizeDriverDto } from './dto/anonymize-driver.dto';
import { AnonymizeUserDto } from './dto/anonymize-user.dto';
import { PrivacyService } from './privacy.service';

@Controller('privacy')
@UseGuards(JwtAuthGuard, DriverBlockGuard, RolesGuard)
@Roles(...ADMIN_ONLY_ROLES)
export class PrivacyController {
  constructor(private readonly privacyService: PrivacyService) {}

  @Get('export/driver/:id')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async exportDriver(
    @Param('id') id: string,
    @CurrentUser('id') actorUserId: string,
    @Res() res: Response,
  ) {
    const stamp = new Date().toISOString().slice(0, 10);
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="driver-export-${id}-${stamp}.zip"`,
      'Cache-Control': 'private, no-store',
    });
    await this.privacyService.streamDriverExport(id, actorUserId, res);
  }

  @Get('export/user/:id')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async exportUser(
    @Param('id') id: string,
    @CurrentUser('id') actorUserId: string,
    @Res() res: Response,
  ) {
    const stamp = new Date().toISOString().slice(0, 10);
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="user-export-${id}-${stamp}.zip"`,
      'Cache-Control': 'private, no-store',
    });
    await this.privacyService.streamUserExport(id, actorUserId, res);
  }

  @Post('delete/driver/:id')
  @RequiresWrite()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  anonymizeDriver(
    @Param('id') id: string,
    @CurrentUser('id') actorUserId: string,
    @Body() dto: AnonymizeDriverDto,
  ) {
    return this.privacyService.anonymizeDriver(id, dto.reason, actorUserId);
  }

  @Post('delete/user/:id')
  @RequiresWrite()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  anonymizeUser(
    @Param('id') id: string,
    @CurrentUser('id') actorUserId: string,
    @Body() dto: AnonymizeUserDto,
  ) {
    return this.privacyService.anonymizeUser(id, dto.reason, actorUserId);
  }
}
