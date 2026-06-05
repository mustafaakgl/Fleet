import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseFilePipeBuilder,
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
import { Throttle } from '@nestjs/throttler';
import { RequiresWrite } from '../common/decorators/requires-write.decorator';
import { diskStorage } from 'multer';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DriverBlockGuard } from '../common/guards/driver-block.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OPERATIONAL_ROLES } from '../common/utils/permissions';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { DocumentsService } from './documents.service';
import {
  DOCUMENT_UPLOAD_ABSOLUTE_DIR,
} from '../storage/local-storage.service';
import { StorageService } from '../storage/storage.service';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

const DOCUMENT_UPLOAD_INTERCEPTOR = FileInterceptor('file', {
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
          'Unsupported file type. Allowed types: PDF, JPG, JPEG, PNG, WEBP.',
        ) as Error,
        false,
      );
      return;
    }
    cb(null, true);
  },
});

type UploadedDocumentFile = {
  originalname: string;
  filename: string;
  mimetype: string;
  size: number;
};

@Controller('documents')
@UseGuards(JwtAuthGuard, DriverBlockGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly storageService: StorageService,
  ) {}

  @Get()
  listDocuments(
    @Query('owner_type') owner_type?: string,
    @Query('owner_id') owner_id?: string,
    @Query('status') status?: string,
    @Query('document_type') document_type?: string,
    @Query('search') search?: string,
  ) {
    return this.documentsService.listDocuments({
      ownerType: owner_type,
      ownerId: owner_id,
      status,
      documentType: document_type,
      search,
    });
  }

  @Get('expiring')
  getExpiringDocuments(@Query('days') days?: string) {
    const parsedDays = days ? Number(days) : 90;
    return this.documentsService.getExpiringDocuments(parsedDays);
  }

  @Get('missing-required')
  getMissingRequired() {
    return this.documentsService.getMissingRequiredDocuments();
  }

  @Get('owner/:ownerType/:ownerId')
  getDocumentsByOwner(@Param('ownerType') ownerType: string, @Param('ownerId') ownerId: string) {
    return this.documentsService.getDocumentsByOwner(ownerType, ownerId);
  }

  @Get(':id/download')
  async downloadDocument(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Res() res: Response,
  ) {
    const file = await this.documentsService.resolveDocumentDownload(id, { userId, role });
    await this.documentsService.recordDocumentDownload(id, userId);

    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(file.fileName)}"`,
      'Cache-Control': 'private, no-store',
    });

    file.stream.pipe(res);
  }

  @Get(':id')
  getDocumentById(@Param('id') id: string) {
    return this.documentsService.getDocumentByIdForClient(id);
  }

  @Post()
  @RequiresWrite()
  async createDocument(@Body() dto: CreateDocumentDto, @CurrentUser('id') userId?: string, @Query('uploadedById') uploadedById?: string) {
    const finalUploadedById = userId ?? uploadedById;
    const created = await this.documentsService.createDocument(dto, finalUploadedById);
    return this.documentsService.mapDocumentToClient(created);
  }

  @Post('upload')
  @RequiresWrite()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(DOCUMENT_UPLOAD_INTERCEPTOR)
  async uploadDocument(
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
    file: UploadedDocumentFile,
    @Body('ownerType') ownerType: string,
    @Body('ownerId') ownerId: string,
    @Body('documentType') documentType: string,
    @Body('expiryDate') expiryDate?: string,
    @Body('notes') notes?: string,
    @CurrentUser('id') userId?: string,
    @Query('uploadedById') uploadedById?: string,
  ) {
    if (!file) {
      throw new BadRequestException('file is required');
    }

    const created = await this.documentsService.createUploadedDocument(
      {
        ownerType,
        ownerId,
        documentType,
        expiryDate,
        notes,
      },
      {
        originalName: file.originalname,
        storedFileName: file.filename,
        fileUrl: this.storageService.buildStoredPath('documents', file.filename),
      },
      userId ?? uploadedById,
    );
    await this.documentsService.syncUploadedFile(
      this.storageService.buildStoredPath('documents', file.filename),
    );
    return this.documentsService.mapDocumentToClient(created);
  }

  @Post(':id/replace-upload')
  @RequiresWrite()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(DOCUMENT_UPLOAD_INTERCEPTOR)
  async replaceUploadDocument(
    @Param('id') id: string,
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
    file: UploadedDocumentFile,
    @Body('documentType') documentType?: string,
    @Body('expiryDate') expiryDate?: string,
    @Body('notes') notes?: string,
    @CurrentUser('id') userId?: string,
    @Query('uploadedById') uploadedById?: string,
  ) {
    if (!file) {
      throw new BadRequestException('file is required');
    }

    const replaced = await this.documentsService.replaceDocumentWithUpload(
      id,
      {
        documentType,
        expiryDate,
        notes,
      },
      {
        originalName: file.originalname,
        storedFileName: file.filename,
        fileUrl: this.storageService.buildStoredPath('documents', file.filename),
      },
      userId ?? uploadedById,
    );
    await this.documentsService.syncUploadedFile(
      this.storageService.buildStoredPath('documents', file.filename),
    );
    return this.documentsService.mapDocumentToClient(replaced);
  }

  @Patch(':id')
  @RequiresWrite()
  updateDocument(@Param('id') id: string, @Body() dto: UpdateDocumentDto) {
    return this.documentsService.updateDocument(id, dto);
  }

  @Post(':id/replace')
  replaceDocument(@Param('id') id: string, @Body() dto: UpdateDocumentDto, @CurrentUser('id') userId?: string, @Query('uploadedById') uploadedById?: string) {
    const finalUploadedById = userId ?? uploadedById;
    return this.documentsService.replaceDocument(id, dto, finalUploadedById);
  }

  @Delete(':id')
  deleteDocument(@Param('id') id: string, @CurrentUser('id') currentUserId?: string) {
    return this.documentsService.deleteDocument(id, currentUserId);
  }
}
