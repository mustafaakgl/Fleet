import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequiresWrite } from '../common/decorators/requires-write.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ADMIN_ONLY_ROLES, OPERATIONAL_ROLES } from '../common/utils/permissions';
import { CreateDriverLicenseDto } from './dto/create-driver-license.dto';
import { UpdateDriverLicenseDto } from './dto/update-driver-license.dto';
import { DriverLicensesService } from './driver-licenses.service';
import { LicenseChecksService } from './license-checks.service';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;

const LICENSE_PHOTO_UPLOAD = FileFieldsInterceptor(
  [
    { name: 'front', maxCount: 1 },
    { name: 'back', maxCount: 1 },
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

@Controller('driver-licenses')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class DriverLicensesController {
  constructor(
    private readonly driverLicenses: DriverLicensesService,
    private readonly licenseChecks: LicenseChecksService,
  ) {}

  @Get()
  list(@Query('driver_id') driverId?: string) {
    return this.driverLicenses.list({ driver_id: driverId });
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.driverLicenses.getById(id);
  }

  @Post()
  @RequiresWrite()
  @UseInterceptors(LICENSE_PHOTO_UPLOAD)
  create(
    @Body() dto: CreateDriverLicenseDto,
    @CurrentUser('id') actorUserId: string,
    @UploadedFiles()
    files?: { front?: Express.Multer.File[]; back?: Express.Multer.File[] },
  ) {
    const photos = {
      front: files?.front?.[0]
        ? { originalname: files.front[0].originalname, buffer: files.front[0].buffer }
        : undefined,
      back: files?.back?.[0]
        ? { originalname: files.back[0].originalname, buffer: files.back[0].buffer }
        : undefined,
    };
    return this.driverLicenses.create(dto, actorUserId, photos);
  }

  @Patch(':id')
  @RequiresWrite()
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDriverLicenseDto,
    @CurrentUser('id') actorUserId: string,
  ) {
    return this.driverLicenses.update(id, dto, actorUserId);
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
    if (slot !== 'front' && slot !== 'back') {
      throw new BadRequestException('slot must be front or back');
    }
    return this.licenseChecks.streamLicenseRecordPhoto(id, slot, actorUserId, actorRole, res);
  }
}
