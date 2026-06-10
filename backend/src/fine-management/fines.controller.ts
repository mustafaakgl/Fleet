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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { FineStatus } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequiresWrite } from '../common/decorators/requires-write.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ADMIN_ONLY_ROLES, OPERATIONAL_ROLES } from '../common/utils/permissions';
import { AssignFineDriverDto } from './dto/assign-fine-driver.dto';
import { CreateFineDto } from './dto/create-fine.dto';
import { FineMatchPreviewDto } from './dto/match-preview.dto';
import { UpdateFineStatusDto } from './dto/update-fine-status.dto';
import { FinesService } from './fines.service';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
];
const MAX_FILE_SIZE_BYTES = 12 * 1024 * 1024;

const FINE_DOCUMENT_UPLOAD = FileInterceptor('document', {
  storage: memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(new BadRequestException('Unsupported document type') as Error, false);
      return;
    }
    cb(null, true);
  },
});

@Controller('fines')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class FinesController {
  constructor(private readonly fines: FinesService) {}

  @Get()
  list(
    @Query('status') status?: FineStatus,
    @Query('vehicle_id') vehicleId?: string,
    @Query('driver_id') driverId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.fines.list({ status, vehicle_id: vehicleId, driver_id: driverId, from, to });
  }

  @Get('due-soon')
  dueSoon(@Query('days') days?: string) {
    const parsed = days ? Number(days) : 7;
    return this.fines.listDueSoon(Number.isFinite(parsed) ? parsed : 7);
  }

  @Get('stats')
  stats() {
    return this.fines.getStats();
  }

  @Post('match-preview')
  matchPreview(@Body() dto: FineMatchPreviewDto) {
    return this.fines.previewMatch(dto.vehicle_id, dto.violation_at, dto.tolerance_minutes);
  }

  @Post()
  @RequiresWrite()
  @UseInterceptors(FINE_DOCUMENT_UPLOAD)
  create(
    @Body() dto: CreateFineDto,
    @CurrentUser('id') actorUserId: string,
    @CurrentUser('tenantId') tenantId: string | undefined,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.fines.create(
      dto,
      actorUserId,
      tenantId ?? 'default-tenant',
      file ? { originalname: file.originalname, buffer: file.buffer } : undefined,
    );
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.fines.getById(id);
  }

  @Post(':id/assign-driver')
  @RequiresWrite()
  assignDriver(
    @Param('id') id: string,
    @Body() dto: AssignFineDriverDto,
    @CurrentUser('id') actorUserId: string,
  ) {
    return this.fines.assignDriver(id, dto, actorUserId);
  }

  @Post(':id/notify-driver')
  @RequiresWrite()
  notifyDriver(@Param('id') id: string, @CurrentUser('id') actorUserId: string) {
    return this.fines.notifyDriver(id, actorUserId);
  }

  @Patch(':id/status')
  @RequiresWrite()
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateFineStatusDto,
    @CurrentUser('id') actorUserId: string,
  ) {
    return this.fines.updateStatus(id, dto, actorUserId);
  }

  @Get(':id/document')
  @Roles(...ADMIN_ONLY_ROLES)
  streamDocument(
    @Param('id') id: string,
    @CurrentUser('id') actorUserId: string,
    @CurrentUser('role') actorRole: string,
    @Res() res: Response,
  ) {
    return this.fines.streamDocument(id, actorUserId, actorRole, res);
  }
}
