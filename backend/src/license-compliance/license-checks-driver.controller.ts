import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubmitLicenseCheckDto } from './dto/submit-license-check.dto';
import { LicenseChecksService } from './license-checks.service';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;

const CHECK_SUBMIT_UPLOAD = FileFieldsInterceptor(
  [
    { name: 'front', maxCount: 1 },
    { name: 'back', maxCount: 1 },
    { name: 'selfie', maxCount: 1 },
  ],
  {
    storage: memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE_BYTES },
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        cb(new BadRequestException('Unsupported image type') as Error, false);
        return;
      }
      cb(null, true);
    },
  },
);

@Controller('driver/license-check')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('driver')
export class LicenseChecksDriverController {
  constructor(private readonly licenseChecks: LicenseChecksService) {}

  @Get('status')
  status(@CurrentUser('id') userId: string) {
    return this.licenseChecks.getDriverStatus(userId);
  }

  @Get('history')
  history(@CurrentUser('id') userId: string) {
    return this.licenseChecks.getDriverHistory(userId);
  }

  @Post('submit')
  @UseInterceptors(CHECK_SUBMIT_UPLOAD)
  submit(
    @CurrentUser('id') userId: string,
    @Body() dto: SubmitLicenseCheckDto,
    @UploadedFiles()
    files?: {
      front?: Express.Multer.File[];
      back?: Express.Multer.File[];
      selfie?: Express.Multer.File[];
    },
  ) {
    return this.licenseChecks.submitDriverCheck(userId, dto, {
      front: files?.front?.[0]
        ? { originalname: files.front[0].originalname, buffer: files.front[0].buffer }
        : undefined,
      back: files?.back?.[0]
        ? { originalname: files.back[0].originalname, buffer: files.back[0].buffer }
        : undefined,
      selfie: files?.selfie?.[0]
        ? { originalname: files.selfie[0].originalname, buffer: files.selfie[0].buffer }
        : undefined,
    });
  }

  @Get(':id/photo/:slot')
  streamPhoto(
    @Param('id') id: string,
    @Param('slot') slot: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') actorRole: string,
    @Res() res: Response,
  ) {
    if (slot !== 'front' && slot !== 'back' && slot !== 'selfie') {
      throw new BadRequestException('slot must be front, back, or selfie');
    }
    return this.licenseChecks.streamPhoto(id, slot, userId, actorRole, res, {
      driverSelfUserId: userId,
    });
  }
}
