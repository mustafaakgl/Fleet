import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AUTOMATION_ROLES } from '../common/utils/permissions';
import { AUTOMATION_DOCUMENT_UPLOAD_ABSOLUTE_DIR } from '../storage/local-storage.service';
import {
  AutomationDocumentService,
  MAX_AUTOMATION_DOCUMENT_BYTES,
} from './automation-document.service';
import { AutomationJobService } from './automation-job.service';
import { AutomationProposalService } from './automation-proposal.service';
import {
  CreateAutomationJobDto,
  DecideProposalDto,
  ListProposalsQueryDto,
} from './dto/ordivan.dto';

/**
 * Otomasyon kuyrugu — insan tarafi (Faz 12).
 *
 * ROL: `AUTOMATION_ROLES` (admin, boss).
 *
 * ONAY HICBIR DOMAIN KAYDI URETMEZ: ne Assignment, ne Tour, ne belge, ne
 * fatura. Yalnizca onerinin durumu degisir ve insanin ne yaptigi olculur.
 */
@Controller('ordivan/automation')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...AUTOMATION_ROLES)
export class AutomationQueueController {
  constructor(
    private readonly jobs: AutomationJobService,
    private readonly proposals: AutomationProposalService,
    private readonly documents: AutomationDocumentService,
  ) {}

  /**
   * Servis faturasi yukleme (Faz 13).
   *
   * Yalnizca GERCEK PDF; tur ilk baytlardan okunuyor. Ayni kiraci icinde ayni
   * dosya ikinci kez yuklenirse YENI IS ACILMAZ, var olan belge doner.
   *
   * Istemci ne `tenantId`, ne extraction sonucu, ne de hedef `vehicleId`
   * dayatabilir: hicbiri bu ucun govdesinde YOK.
   */
  @Post('documents/service-invoice')
  @UseInterceptors(
    FileInterceptor('document', { limits: { fileSize: MAX_AUTOMATION_DOCUMENT_BYTES } }),
  )
  @HttpCode(201)
  async uploadServiceInvoice(
    @CurrentUser('id') userId: string,
    @UploadedFile()
    file: { buffer: Buffer; size: number; originalname?: string; mimetype?: string },
  ) {
    const document = await this.documents.upload(userId, file);
    if (document.duplicate) {
      // IDEMPOTENT: ayni dosya yeniden yuklendiginde ikinci is acilmiyor.
      return document;
    }

    const job = await this.jobs.createJob(userId, {
      jobType: 'document.service_invoice.extract',
      schemaVersion: 1,
      // Belge ICERIGI is kaydina girmiyor; yalnizca kimligi ve boyutu.
      payload: {
        documentId: document.id,
        originalName: document.originalName,
        contentLength: document.fileSize,
      },
      documentId: document.id,
    });

    return { ...document, jobId: job.id };
  }

  /** Yetkili PDF onizlemesi. Ham depolama yolu istemciye verilmiyor. */
  @Get('documents/:id/file')
  async documentFile(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const file = await this.documents.resolveFileForReview(id);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.fileName)}"`);
    createReadStream(join(AUTOMATION_DOCUMENT_UPLOAD_ABSOLUTE_DIR, file.storedFileName)).pipe(res);
  }

  /** Is olusturma. Registry disi tur ya da surum BURADA duser. */
  @Post('jobs')
  @HttpCode(201)
  createJob(@CurrentUser('id') userId: string, @Body() dto: CreateAutomationJobDto) {
    return this.jobs.createJob(userId, dto);
  }

  @Get('proposals')
  list(@Query() query: ListProposalsQueryDto) {
    return this.proposals.list(query);
  }

  @Get('proposals/metrics')
  metrics() {
    return this.proposals.reviewMetrics();
  }

  @Get('proposals/:id')
  detail(@Param('id') id: string) {
    return this.proposals.detail(id);
  }

  /** Karar. Aciklama zorunlu, `expectedUpdatedAt` cakismayi engeller. */
  @Post('proposals/:id/decide')
  @HttpCode(200)
  decide(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: DecideProposalDto,
  ) {
    return this.proposals.decide(userId, id, dto);
  }
}
