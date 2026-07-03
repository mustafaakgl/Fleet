import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { RequiresWrite } from '../common/decorators/requires-write.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OPERATIONAL_ROLES } from '../common/utils/permissions';
import { TachographService } from './tachograph.service';
import { TachographApiService } from './tachograph-api.service';
import { TachoIngestTokenGuard } from './guards/tacho-ingest-token.guard';
import { validateDddUpload } from './ddd/ddd-upload-validation.util';
import { DddFileSource, TachoInfringementType, DtcSeverity } from '@prisma/client';

type UploadedDddFile = {
  originalname: string;
  size: number;
  buffer: Buffer;
};

const DDD_UPLOAD_INTERCEPTOR = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

function assertValidDddUpload(file: UploadedDddFile) {
  const validation = validateDddUpload(file.originalname, file.size);
  if (!validation.ok) {
    throw new BadRequestException(validation.reason);
  }
}

@Controller('tachograph')
export class TachographController {
  constructor(
    private readonly tachographService: TachographService,
    private readonly tachographApiService: TachographApiService,
  ) {}

  @Get('badges')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...OPERATIONAL_ROLES)
  getBadges(@CurrentUser('tenantId') tenantId?: string) {
    if (!tenantId) {
      throw new BadRequestException('tenantId missing in auth context');
    }
    return this.tachographApiService.getBadges(tenantId);
  }

  @Get('compliance/overview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...OPERATIONAL_ROLES)
  getComplianceOverview(
    @CurrentUser('tenantId') tenantId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    if (!tenantId) {
      throw new BadRequestException('tenantId missing in auth context');
    }
    return this.tachographApiService.getComplianceOverview(tenantId, from, to);
  }

  @Get('dashboard-summary')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...OPERATIONAL_ROLES)
  getDashboardSummary(@CurrentUser('tenantId') tenantId?: string) {
    if (!tenantId) {
      throw new BadRequestException('tenantId missing in auth context');
    }
    return this.tachographApiService.getDashboardSummary(tenantId);
  }

  @Get('drivers/:driverId/story')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...OPERATIONAL_ROLES)
  getDriverStory(
    @CurrentUser('tenantId') tenantId?: string,
    @Param('driverId') driverId?: string,
    @Query('weeks') weeks?: string,
  ) {
    if (!tenantId) {
      throw new BadRequestException('tenantId missing in auth context');
    }
    if (!driverId) {
      throw new BadRequestException('driverId is required');
    }
    const parsedWeeks = weeks ? Number(weeks) : 12;
    return this.tachographApiService.getDriverStory(
      tenantId,
      driverId,
      Number.isFinite(parsedWeeks) ? parsedWeeks : 12,
    );
  }

  @Get('infringements')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...OPERATIONAL_ROLES)
  listInfringements(
    @CurrentUser('tenantId') tenantId?: string,
    @Query('driverId') driverId?: string,
    @Query('types') types?: string,
    @Query('severity') severity?: DtcSeverity,
    @Query('status') status?: 'open' | 'acknowledged',
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (!tenantId) {
      throw new BadRequestException('tenantId missing in auth context');
    }

    const parsedTypes = types
      ? (types.split(',').filter(Boolean) as TachoInfringementType[])
      : undefined;

    return this.tachographApiService.listInfringements(tenantId, {
      driverId,
      types: parsedTypes,
      severity,
      status,
      from,
      to,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
  }

  @Get('infringements/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...OPERATIONAL_ROLES)
  getInfringement(
    @CurrentUser('tenantId') tenantId?: string,
    @Param('id') id?: string,
  ) {
    if (!tenantId) {
      throw new BadRequestException('tenantId missing in auth context');
    }
    if (!id) {
      throw new BadRequestException('id is required');
    }
    return this.tachographApiService.getInfringementDetail(tenantId, id);
  }

  @Patch('infringements/:id/acknowledge')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...OPERATIONAL_ROLES)
  @RequiresWrite()
  @HttpCode(HttpStatus.OK)
  acknowledgeInfringement(
    @CurrentUser('tenantId') tenantId?: string,
    @CurrentUser('id') userId?: string,
    @Param('id') id?: string,
    @Body('note') note?: string,
  ) {
    if (!tenantId) {
      throw new BadRequestException('tenantId missing in auth context');
    }
    if (!userId) {
      throw new BadRequestException('userId missing in auth context');
    }
    if (!id) {
      throw new BadRequestException('id is required');
    }
    return this.tachographApiService.acknowledgeInfringement(tenantId, id, userId, note ?? '');
  }

  @Get('remaining')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...OPERATIONAL_ROLES)
  getRemaining(
    @CurrentUser('tenantId') tenantId?: string,
    @Query('driverId') driverId?: string,
  ) {
    if (!tenantId) {
      throw new BadRequestException('tenantId missing in auth context');
    }
    return this.tachographApiService.getRemainingDriving(tenantId, driverId);
  }

  @Patch('ddd/files/:id/assign')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...OPERATIONAL_ROLES)
  @RequiresWrite()
  @HttpCode(HttpStatus.OK)
  assignDddFile(
    @CurrentUser('tenantId') tenantId?: string,
    @CurrentUser('id') userId?: string,
    @Param('id') id?: string,
    @Body('driverId') driverId?: string,
  ) {
    if (!tenantId) {
      throw new BadRequestException('tenantId missing in auth context');
    }
    if (!userId) {
      throw new BadRequestException('userId missing in auth context');
    }
    if (!id) {
      throw new BadRequestException('id is required');
    }
    if (!driverId) {
      throw new BadRequestException('driverId is required');
    }
    return this.tachographApiService.assignDddFile(tenantId, id, driverId, userId);
  }

  @Get('ddd/files')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...OPERATIONAL_ROLES)
  listFiles(@CurrentUser('tenantId') tenantId?: string) {
    if (!tenantId) {
      throw new BadRequestException('tenantId missing in auth context');
    }
    return this.tachographService.listDddFiles(tenantId);
  }

  @Post('ddd/upload')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...OPERATIONAL_ROLES)
  @RequiresWrite()
  @HttpCode(HttpStatus.CREATED)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(DDD_UPLOAD_INTERCEPTOR)
  uploadByUser(
    @UploadedFile() file: UploadedDddFile,
    @Body('vehicleId') vehicleId: string,
    @Body('capturedAt') capturedAt: string | undefined,
    @CurrentUser('tenantId') tenantId?: string,
    @CurrentUser('id') userId?: string,
  ) {
    if (!tenantId) {
      throw new BadRequestException('tenantId missing in auth context');
    }
    if (!file?.buffer) {
      throw new BadRequestException('file is required');
    }
    assertValidDddUpload(file);
    if (!vehicleId) {
      throw new BadRequestException('vehicleId is required');
    }

    return this.tachographService.ingestDddFile(file.buffer, {
      tenantId,
      uploadedByUserId: userId,
      vehicleId,
      fileName: file.originalname,
      capturedAt,
      source: DddFileSource.manual,
    });
  }

  @Post('ddd/upload/service')
  @Public()
  @UseGuards(TachoIngestTokenGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(DDD_UPLOAD_INTERCEPTOR)
  uploadByService(
    @UploadedFile() file: UploadedDddFile,
    @Body('tenantId') tenantId: string,
    @Body('vehicleId') vehicleId: string,
    @Body('capturedAt') capturedAt: string | undefined,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('file is required');
    }
    assertValidDddUpload(file);
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }
    if (!vehicleId) {
      throw new BadRequestException('vehicleId is required');
    }

    return this.tachographService.ingestDddFile(file.buffer, {
      tenantId,
      vehicleId,
      fileName: file.originalname,
      capturedAt,
      source: DddFileSource.service,
    });
  }
}
