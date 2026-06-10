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
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ReportDefectDto } from './dto/report-defect.dto';
import { DefectsService } from './defects.service';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;

const DEFECT_REPORT_UPLOAD = FilesInterceptor('photos', 5, {
  storage: memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(new BadRequestException('Unsupported image type') as Error, false);
      return;
    }
    cb(null, true);
  },
});

@Controller('driver/defects')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('driver')
export class DefectsDriverController {
  constructor(private readonly defects: DefectsService) {}

  @Get()
  listMine(@CurrentUser('id') userId: string) {
    return this.defects.getDriverDefects(userId);
  }

  @Post('report')
  @UseInterceptors(DEFECT_REPORT_UPLOAD)
  report(
    @CurrentUser('id') userId: string,
    @Body() dto: ReportDefectDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    const photos = (files ?? []).map((file) => ({
      originalname: file.originalname,
      buffer: file.buffer,
    }));
    return this.defects.reportManualDefect(userId, dto, photos);
  }

  @Post(':id/confirm')
  confirm(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body('note') note?: string,
  ) {
    return this.defects.confirmDefect(userId, id, note);
  }

  @Get(':id/photo/:photoIndex')
  streamPhoto(
    @Param('id') id: string,
    @Param('photoIndex') photoIndexRaw: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') actorRole: string,
    @Res() res: Response,
  ) {
    const photoIndex = Number(photoIndexRaw);
    if (!Number.isInteger(photoIndex) || photoIndex < 0) {
      throw new BadRequestException('Invalid photo index');
    }
    return this.defects.streamPhoto(id, photoIndex, userId, actorRole, res, {
      driverSelfUserId: userId,
    });
  }
}
