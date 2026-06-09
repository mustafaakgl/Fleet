import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseFilePipeBuilder,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { DOCUMENT_UPLOAD_ABSOLUTE_DIR } from '../storage/local-storage.service';
import { CreateDriverMorningCheckinDto } from './dto/create-driver-morning-checkin.dto';
import { CreateDriverRequestDto } from './dto/create-driver-request.dto';
import { CreateDriverTransportRequestDto } from './dto/create-driver-transport-request.dto';
import { CreateDriverAccidentDto } from './dto/create-driver-accident.dto';
import { CreateDriverHandoverDto } from './dto/create-driver-handover.dto';
import { SubmitHandoverEquipmentChecklistDto } from './dto/submit-handover-equipment.dto';
import { UpdateDriverLanguageDto } from './dto/update-driver-language.dto';
import { UpdateDriverProfileDto } from './dto/update-driver-profile.dto';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import { SubmitLocationDto } from '../tracking/dto/submit-location.dto';
import { UploadDriverDocumentDto } from './dto/upload-driver-document.dto';
import { DriverMobileService } from './driver-mobile.service';
import {
  DRIVER_FILE_UPLOAD_INTERCEPTOR,
  MAX_DRIVER_UPLOAD_BYTES,
} from './driver-upload.config';

const MAX_FILE_SIZE_BYTES = MAX_DRIVER_UPLOAD_BYTES;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

const HANDOVER_PHOTO_UPLOAD_INTERCEPTOR = FileInterceptor('file', {
  storage: diskStorage({
    destination: DOCUMENT_UPLOAD_ABSOLUTE_DIR,
    filename: (_req, file, cb) => {
      const extension = file.originalname.includes('.')
        ? file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase()
        : '';
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${uniqueSuffix}${extension}`);
    },
  }),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(
        new BadRequestException(
          'Unsupported image type. Allowed types: JPG, JPEG, PNG, WEBP.',
        ) as Error,
        false,
      );
      return;
    }
    cb(null, true);
  },
});

type UploadedImageFile = {
  originalname: string;
  filename: string;
};

@Controller('driver')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('driver')
export class DriverMobileController {
  constructor(private readonly driverMobile: DriverMobileService) {}

  @Get('me')
  me(@CurrentUser('id') userId: string) {
    return this.driverMobile.me(userId);
  }

  @Post('me/language')
  @HttpCode(HttpStatus.OK)
  updateLanguage(@CurrentUser('id') userId: string, @Body() dto: UpdateDriverLanguageDto) {
    return this.driverMobile.updatePreferredLanguage(userId, dto.language);
  }

  @Post('me/profile')
  @HttpCode(HttpStatus.OK)
  updateProfile(@CurrentUser('id') userId: string, @Body() dto: UpdateDriverProfileDto) {
    return this.driverMobile.updateProfile(userId, dto);
  }

  @Post('me/push-token')
  @HttpCode(HttpStatus.OK)
  registerPushToken(@CurrentUser('id') userId: string, @Body() dto: RegisterPushTokenDto) {
    return this.driverMobile.registerPushToken(userId, dto.token);
  }

  @Delete('me/push-token')
  @HttpCode(HttpStatus.OK)
  clearPushToken(@CurrentUser('id') userId: string) {
    return this.driverMobile.clearPushToken(userId);
  }

  @Post('me/location-consent')
  @HttpCode(HttpStatus.OK)
  grantLocationConsent(@CurrentUser('id') userId: string) {
    return this.driverMobile.grantLocationConsent(userId);
  }

  @Get('me/location-status')
  getLocationStatus(@CurrentUser('id') userId: string) {
    return this.driverMobile.getLocationStatus(userId);
  }

  @Post('me/location-sharing/start')
  @HttpCode(HttpStatus.OK)
  startLocationSharing(@CurrentUser('id') userId: string) {
    return this.driverMobile.startLocationSharing(userId);
  }

  @Post('me/location-sharing/end')
  @HttpCode(HttpStatus.OK)
  endLocationSharing(@CurrentUser('id') userId: string) {
    return this.driverMobile.endLocationSharing(userId);
  }

  @Post('location')
  @HttpCode(HttpStatus.OK)
  submitLocation(@CurrentUser('id') userId: string, @Body() dto: SubmitLocationDto) {
    return this.driverMobile.submitLocation(userId, dto);
  }

  @Get('assignments/today')
  listTodayAssignments(@CurrentUser('id') userId: string, @Query('date') date?: string) {
    return this.driverMobile.listTodayAssignments(userId, date);
  }

  @Get('assignments/:id')
  getAssignmentById(@CurrentUser('id') userId: string, @Param('id') assignmentId: string) {
    return this.driverMobile.getAssignmentById(userId, assignmentId);
  }

  @Get('morning-checkins')
  listMorningCheckins(@CurrentUser('id') userId: string, @Query('date') date?: string) {
    return this.driverMobile.listMorningCheckins(userId, date);
  }

  @Post('morning-checkins')
  createMorningCheckin(@CurrentUser('id') userId: string, @Body() dto: CreateDriverMorningCheckinDto) {
    return this.driverMobile.createMorningCheckin(userId, dto);
  }

  @Get('work-sessions/current')
  getCurrentWorkSession(@CurrentUser('id') userId: string) {
    return this.driverMobile.getCurrentWorkSession(userId);
  }

  @Post('work-sessions/start')
  @HttpCode(HttpStatus.OK)
  startWorkSession(@CurrentUser('id') userId: string) {
    return this.driverMobile.startWorkSession(userId);
  }

  @Post('work-sessions/end')
  @HttpCode(HttpStatus.OK)
  endWorkSession(
    @CurrentUser('id') userId: string,
    @Body() body: { reason?: 'manual' | 'app_background' | 'logout' },
  ) {
    return this.driverMobile.endWorkSession(userId, body.reason ?? 'manual');
  }

  @Get('vehicle-handovers')
  listHandovers(
    @CurrentUser('id') userId: string,
    @Query('status') status?: string,
    @Query('photoStatus') photoStatus?: string,
    @Query('date') date?: string,
  ) {
    return this.driverMobile.listHandovers(userId, { status, photoStatus, date });
  }

  @Post('vehicle-handovers')
  createHandover(@CurrentUser('id') userId: string, @Body() dto: CreateDriverHandoverDto) {
    return this.driverMobile.createHandover(userId, dto);
  }

  @Get('vehicle-handovers/:id')
  getHandover(@CurrentUser('id') userId: string, @Param('id') handoverId: string) {
    return this.driverMobile.getHandover(userId, handoverId);
  }

  @Get('documents')
  listDriverDocuments(@CurrentUser('id') userId: string) {
    return this.driverMobile.listDriverDocuments(userId);
  }

  @Get('documents/:id/download')
  async downloadDriverDocument(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Res() res: Response,
  ) {
    const file = await this.driverMobile.downloadDriverDocument(userId, documentId);

    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(file.fileName)}"`,
      'Cache-Control': 'private, no-store',
    });

    file.stream.pipe(res);
  }

  @Post('documents')
  @UseInterceptors(HANDOVER_PHOTO_UPLOAD_INTERCEPTOR)
  uploadDriverDocument(
    @CurrentUser('id') userId: string,
    @Body() dto: UploadDriverDocumentDto,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({
          maxSize: MAX_FILE_SIZE_BYTES,
        })
        .build({
          fileIsRequired: true,
          errorHttpStatusCode: HttpStatus.BAD_REQUEST,
        }),
    )
    file: UploadedImageFile,
  ) {
    return this.driverMobile.uploadDriverDocument(userId, dto, file);
  }

  @Post('vehicle-handovers/:id/photo')
  @UseInterceptors(HANDOVER_PHOTO_UPLOAD_INTERCEPTOR)
  uploadHandoverPhoto(
    @CurrentUser('id') userId: string,
    @Param('id') handoverId: string,
    @Query('slot') slot: string,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({
          maxSize: MAX_FILE_SIZE_BYTES,
        })
        .build({
          fileIsRequired: true,
          errorHttpStatusCode: HttpStatus.BAD_REQUEST,
        }),
    )
    file: UploadedImageFile,
  ) {
    return this.driverMobile.uploadHandoverPhoto(userId, handoverId, slot, file);
  }

  @Post('vehicle-handovers/:id/equipment-checklist')
  @HttpCode(HttpStatus.OK)
  submitHandoverEquipmentChecklist(
    @CurrentUser('id') userId: string,
    @Param('id') handoverId: string,
    @Body() dto: SubmitHandoverEquipmentChecklistDto,
  ) {
    return this.driverMobile.submitHandoverEquipmentChecklist(userId, handoverId, dto);
  }

  @Get('requests')
  listRequests(
    @CurrentUser('id') userId: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
  ) {
    return this.driverMobile.listRequests(userId, status, type);
  }

  @Post('requests')
  createRequest(@CurrentUser('id') userId: string, @Body() dto: CreateDriverRequestDto) {
    return this.driverMobile.createRequest(userId, dto);
  }

  @Post('requests/:id/attachments')
  @UseInterceptors(DRIVER_FILE_UPLOAD_INTERCEPTOR)
  uploadLeaveRequestAttachment(
    @CurrentUser('id') userId: string,
    @Param('id') requestId: string,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({
          maxSize: MAX_FILE_SIZE_BYTES,
        })
        .build({
          fileIsRequired: true,
          errorHttpStatusCode: HttpStatus.BAD_REQUEST,
        }),
    )
    file: UploadedImageFile,
  ) {
    return this.driverMobile.uploadLeaveRequestAttachment(userId, requestId, file);
  }

  @Get('transport-requests')
  listTransportRequests(
    @CurrentUser('id') userId: string,
    @Query('status') status?: string,
  ) {
    return this.driverMobile.listTransportRequests(userId, status);
  }

  @Get('transport-form-options')
  getTransportFormOptions(@CurrentUser('id') userId: string) {
    return this.driverMobile.getTransportFormOptions(userId);
  }

  @Post('transport-requests')
  createTransportRequest(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateDriverTransportRequestDto,
  ) {
    return this.driverMobile.createTransportRequest(userId, dto);
  }

  @Post('transport-requests/:id/attachments')
  @UseInterceptors(DRIVER_FILE_UPLOAD_INTERCEPTOR)
  uploadTransportRequestAttachment(
    @CurrentUser('id') userId: string,
    @Param('id') transportRequestId: string,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({
          maxSize: MAX_FILE_SIZE_BYTES,
        })
        .build({
          fileIsRequired: true,
          errorHttpStatusCode: HttpStatus.BAD_REQUEST,
        }),
    )
    file: UploadedImageFile,
  ) {
    return this.driverMobile.uploadTransportRequestAttachment(userId, transportRequestId, file);
  }

  @Get('accidents')
  listAccidents(
    @CurrentUser('id') userId: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
  ) {
    return this.driverMobile.listAccidents(userId, type, status);
  }

  @Post('accidents')
  createAccident(@CurrentUser('id') userId: string, @Body() dto: CreateDriverAccidentDto) {
    return this.driverMobile.createAccident(userId, dto);
  }

  @Post('accidents/:id/attachments')
  @UseInterceptors(DRIVER_FILE_UPLOAD_INTERCEPTOR)
  uploadAccidentAttachment(
    @CurrentUser('id') userId: string,
    @Param('id') accidentId: string,
    @Query('documentType') documentType: string | undefined,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({
          maxSize: MAX_FILE_SIZE_BYTES,
        })
        .build({
          fileIsRequired: true,
          errorHttpStatusCode: HttpStatus.BAD_REQUEST,
        }),
    )
    file: UploadedImageFile,
  ) {
    return this.driverMobile.uploadAccidentAttachment(userId, accidentId, file, documentType);
  }

  @Get('notifications')
  listNotifications(@CurrentUser('id') userId: string, @Query('status') status?: string) {
    return this.driverMobile.listNotifications(userId, status);
  }

  @Get('notifications/unread-count')
  unreadCount(@CurrentUser('id') userId: string) {
    return this.driverMobile.unreadNotificationCount(userId);
  }

  @Post('notifications/:id/read')
  @HttpCode(HttpStatus.OK)
  markNotificationRead(@CurrentUser('id') userId: string, @Param('id') notificationId: string) {
    return this.driverMobile.markNotificationRead(userId, notificationId);
  }

  @Post('notifications/read-all')
  @HttpCode(HttpStatus.OK)
  markAllRead(@CurrentUser('id') userId: string) {
    return this.driverMobile.markAllNotificationsRead(userId);
  }
}
