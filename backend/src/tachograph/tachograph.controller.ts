import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
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
import { TachoIngestTokenGuard } from './guards/tacho-ingest-token.guard';

type UploadedDddFile = {
  originalname: string;
  size: number;
  buffer: Buffer;
};

const DDD_UPLOAD_INTERCEPTOR = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
});

@Controller('tachograph')
export class TachographController {
  constructor(private readonly tachographService: TachographService) {}

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
    if (!vehicleId) {
      throw new BadRequestException('vehicleId is required');
    }

    return this.tachographService.ingestDddFile(file.buffer, {
      tenantId,
      uploadedByUserId: userId,
      vehicleId,
      fileName: file.originalname,
      capturedAt,
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
    });
  }
}
