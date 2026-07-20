import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseFilePipeBuilder,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Response } from 'express';
import { BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequiresWrite } from '../common/decorators/requires-write.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { DriverBlockGuard } from '../common/guards/driver-block.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OPERATIONAL_ROLES } from '../common/utils/permissions';
import { DOCUMENT_UPLOAD_ABSOLUTE_DIR } from '../storage/local-storage.service';
import { CreateEquipmentIssuanceDto } from './dto/create-equipment-issuance.dto';
import { DriverSignEquipmentIssuanceDto } from './dto/driver-sign-equipment-issuance.dto';
import { ApproveEquipmentIssuanceDto } from './dto/approve-equipment-issuance.dto';
import { CancelEquipmentIssuanceDto } from './dto/cancel-equipment-issuance.dto';
import { EquipmentIssuancesService } from './equipment-issuances.service';

const MAX_EQUIPMENT_ISSUANCE_FORM_BYTES = 10 * 1024 * 1024;

const EQUIPMENT_ISSUANCE_PDF_UPLOAD_INTERCEPTOR = FileInterceptor('file', {
  storage: diskStorage({
    destination: DOCUMENT_UPLOAD_ABSOLUTE_DIR,
    filename: (_req, file, cb) => {
      const extension = file.originalname.includes('.')
        ? file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase()
        : '.pdf';
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`);
    },
  }),
  limits: {
    fileSize: MAX_EQUIPMENT_ISSUANCE_FORM_BYTES,
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      cb(new BadRequestException('Only PDF uploads are allowed.') as Error, false);
      return;
    }
    cb(null, true);
  },
});

type UploadedScanFile = {
  originalname: string;
  filename: string;
  mimetype: string;
  path: string;
};

function requestMeta(req: Request) {
  return {
    ipAddress: req.ip,
    userAgent: req.get('user-agent') ?? null,
  };
}

@Controller('equipment-issuances')
@UseGuards(JwtAuthGuard, DriverBlockGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class EquipmentIssuancesController {
  constructor(private readonly equipmentIssuancesService: EquipmentIssuancesService) {}

  @Get()
  list(@Query('driverId') driverId?: string, @Query('status') status?: string) {
    return this.equipmentIssuancesService.list({
      driverId,
      status: status as never,
    });
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.equipmentIssuancesService.getById(id);
  }

  @Post()
  @RequiresWrite()
  @UseInterceptors(EQUIPMENT_ISSUANCE_PDF_UPLOAD_INTERCEPTOR)
  create(
    @Body() dto: CreateEquipmentIssuanceDto,
    @CurrentUser('id') actorUserId: string,
    @Req() req: Request,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: MAX_EQUIPMENT_ISSUANCE_FORM_BYTES })
        .build({ fileIsRequired: true, errorHttpStatusCode: HttpStatus.BAD_REQUEST }),
    )
    file: UploadedScanFile,
  ) {
    return this.equipmentIssuancesService.create(dto, file, actorUserId, requestMeta(req));
  }

  @Get(':id/form')
  async downloadForm(@Param('id') id: string, @Res() res: Response) {
    const file = await this.equipmentIssuancesService.downloadForm(id);
    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(file.fileName)}"`,
      'Cache-Control': 'private, no-store',
    });
    file.stream.pipe(res);
  }

  @Post(':id/manual-upload')
  @RequiresWrite()
  @UseInterceptors(EQUIPMENT_ISSUANCE_PDF_UPLOAD_INTERCEPTOR)
  manualUpload(
    @Param('id') id: string,
    @CurrentUser('id') actorUserId: string,
    @Req() req: Request,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: MAX_EQUIPMENT_ISSUANCE_FORM_BYTES })
        .build({ fileIsRequired: true, errorHttpStatusCode: HttpStatus.BAD_REQUEST }),
    )
    file: UploadedScanFile,
  ) {
    return this.equipmentIssuancesService.manualUpload(id, file, actorUserId, requestMeta(req));
  }

  @Post(':id/approve')
  @RequiresWrite()
  approve(
    @Param('id') id: string,
    @Body() dto: ApproveEquipmentIssuanceDto,
    @CurrentUser('id') actorUserId: string,
    @Req() req: Request,
  ) {
    return this.equipmentIssuancesService.approve(id, dto, actorUserId, requestMeta(req));
  }

  @Post(':id/cancel')
  @RequiresWrite()
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelEquipmentIssuanceDto,
    @CurrentUser('id') actorUserId: string,
    @Req() req: Request,
  ) {
    return this.equipmentIssuancesService.cancel(id, dto, actorUserId, requestMeta(req));
  }
}

@Controller('driver/equipment-issuances')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('driver')
export class DriverEquipmentIssuancesController {
  constructor(private readonly equipmentIssuancesService: EquipmentIssuancesService) {}

  @Get()
  listMine(@CurrentUser('id') userId: string) {
    return this.equipmentIssuancesService.listForDriver(userId);
  }

  @Get(':id')
  getMine(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.equipmentIssuancesService.getByIdForDriver(userId, id);
  }

  @Get(':id/form')
  async downloadOwnForm(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const file = await this.equipmentIssuancesService.downloadFormForDriver(userId, id);
    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(file.fileName)}"`,
      'Cache-Control': 'private, no-store',
    });
    file.stream.pipe(res);
  }

  @Post(':id/sign')
  @HttpCode(HttpStatus.OK)
  sign(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: DriverSignEquipmentIssuanceDto,
    @Req() req: Request,
  ) {
    return this.equipmentIssuancesService.signByDriver(userId, id, dto, requestMeta(req));
  }
}