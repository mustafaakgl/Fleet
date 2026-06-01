import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseFilePipeBuilder,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { DOCUMENT_UPLOAD_ABSOLUTE_DIR } from '../storage/local-storage.service';
import { CreateDriverMorningCheckinDto } from './dto/create-driver-morning-checkin.dto';
import { CreateDriverRequestDto } from './dto/create-driver-request.dto';
import { CreateDriverAccidentDto } from './dto/create-driver-accident.dto';
import { CreateDriverHandoverDto } from './dto/create-driver-handover.dto';
import { DriverMobileService } from './driver-mobile.service';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
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

  @Post('vehicle-handovers/:id/photo')
  @UseInterceptors(HANDOVER_PHOTO_UPLOAD_INTERCEPTOR)
  uploadHandoverPhoto(
    @CurrentUser('id') userId: string,
    @Param('id') handoverId: string,
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
    return this.driverMobile.uploadHandoverPhoto(userId, handoverId, file);
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
