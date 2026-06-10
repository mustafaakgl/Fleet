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
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubmitDepartureCheckDto } from './dto/submit-departure-check.dto';
import { DepartureChecksService } from './departure-checks.service';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;

const DEPARTURE_SUBMIT_UPLOAD = AnyFilesInterceptor({
  storage: memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 35 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(new BadRequestException('Unsupported image type') as Error, false);
      return;
    }
    cb(null, true);
  },
});

@Controller('driver/departure-check')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('driver')
export class DepartureChecksDriverController {
  constructor(private readonly departureChecks: DepartureChecksService) {}

  @Get('status')
  status(@CurrentUser('id') userId: string) {
    return this.departureChecks.getDriverStatus(userId);
  }

  @Post('submit')
  @UseInterceptors(DEPARTURE_SUBMIT_UPLOAD)
  async submit(
    @CurrentUser('id') userId: string,
    @Body('payload') payloadRaw: string,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    if (!payloadRaw?.trim()) {
      throw new BadRequestException('payload is required');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(payloadRaw);
    } catch {
      throw new BadRequestException('payload must be valid JSON');
    }

    const dto = plainToInstance(SubmitDepartureCheckDto, parsed);
    const errors = await validate(dto);
    if (errors.length) {
      throw new BadRequestException('Invalid departure check payload');
    }

    const photosByItemKey: Record<string, Array<{ originalname: string; buffer: Buffer }>> = {};
    for (const file of files ?? []) {
      const match = /^photo_(.+)$/.exec(file.fieldname);
      if (!match) continue;
      const itemKey = match[1];
      if (!photosByItemKey[itemKey]) photosByItemKey[itemKey] = [];
      photosByItemKey[itemKey].push({
        originalname: file.originalname,
        buffer: file.buffer,
      });
    }

    return this.departureChecks.submitDriverCheck(userId, dto, photosByItemKey);
  }

  @Get(':id/items/:itemResultId/photo/:photoIndex')
  streamItemPhoto(
    @Param('id') id: string,
    @Param('itemResultId') itemResultId: string,
    @Param('photoIndex') photoIndexRaw: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') actorRole: string,
    @Res() res: Response,
  ) {
    const photoIndex = Number(photoIndexRaw);
    if (!Number.isInteger(photoIndex) || photoIndex < 0) {
      throw new BadRequestException('Invalid photo index');
    }
    return this.departureChecks.streamItemPhoto(
      id,
      itemResultId,
      photoIndex,
      userId,
      actorRole,
      res,
      { driverSelfUserId: userId },
    );
  }
}
