import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  ServiceUnavailableException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentIntakeSource } from '@prisma/client';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OPERATIONAL_ROLES } from '../common/utils/permissions';
import { AUTOMATION_DOCUMENT_UPLOAD_ABSOLUTE_DIR } from '../storage/local-storage.service';
import { MAX_INTAKE_FILE_BYTES } from './core/intake-file';
import { DocumentIntakeService } from './document-intake.service';
import {
  CorrectIntakeDocumentDto,
  ListInboxQueryDto,
  RejectIntakeDocumentDto,
  ResegmentDto,
  RouteIntakeDocumentDto,
} from './dto/document-inbox.dto';
import { IntakeRoutingService } from './intake-routing.service';
import { isOrdivanEnabled, resolveOrdivanMode } from './ordivan.config';

/**
 * BELGE GELEN KUTUSU — INSAN TARAFI (Faz 14).
 *
 * ROL: `OPERATIONAL_ROLES` (admin, boss, accounting, office). SURUCU DISARIDA
 * ve mevcut surucu yakit fisi akisi DEGISMEDI — surucunun kendi fisini
 * yuklemesi bu ucla ilgisiz bir yoldur.
 *
 * ROLLER GENISLETILMEDI: bu controller yalnizca gelen kutusunu GORME hakkini
 * veriyor. Bir belgenin canonical kayda donusturulmesi, HEDEF MODULUN kendi
 * rol kisitina tabi (bkz. document-type-registry) ve `IntakeRoutingService`
 * bunu her istekte yeniden dogruluyor — menuyu gizlemek guvenlik degildir.
 */
@Controller('ordivan/inbox')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class DocumentInboxController {
  constructor(
    private readonly intake: DocumentIntakeService,
    private readonly routing: IntakeRoutingService,
  ) {}

  private assertEnabled(): void {
    if (!isOrdivanEnabled(resolveOrdivanMode())) {
      // `disabled` modda uc kapali, Fleet calismaya devam eder.
      throw new ServiceUnavailableException({ code: 'ordivan_disabled' });
    }
  }

  /**
   * Web ve mobil yukleme.
   *
   * Mobil tarayicidan kamera ile cekilen JPEG/PNG ve PDF ayni ucu kullanir;
   * `source` yalnizca RAPORLAMA icin ayrilir ve guvenlik kararina GIRMEZ —
   * girseydi, istemcinin bildirdigi bir alan kontrol seviyesini belirlerdi.
   */
  @Post('uploads')
  @UseInterceptors(FileInterceptor('document', { limits: { fileSize: MAX_INTAKE_FILE_BYTES } }))
  @HttpCode(201)
  async upload(
    @CurrentUser('id') userId: string,
    @UploadedFile()
    file: { buffer: Buffer; size: number; originalname?: string; mimetype?: string } | undefined,
    @Body('source') source?: string,
  ) {
    this.assertEnabled();
    return this.intake.upload({ kind: 'user', userId }, file, {
      source: source === 'mobile' ? DocumentIntakeSource.mobile : DocumentIntakeSource.web,
    });
  }

  @Get('documents')
  list(@Query() query: ListInboxQueryDto) {
    this.assertEnabled();
    return this.intake.list(query);
  }

  /** Detay + "onaylandiginda ne olacak" ozeti. Ozet ROLE gore hesaplanir. */
  @Get('documents/:id')
  detail(@CurrentUser('role') role: string, @Param('id') id: string) {
    this.assertEnabled();
    return this.intake.detail(id, role);
  }

  /** Tur, alt tur, arac, surucu ve atama duzeltmesi. */
  @Post('documents/:id/correct')
  @HttpCode(200)
  correct(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: CorrectIntakeDocumentDto,
  ) {
    this.assertEnabled();
    return this.intake.correct(userId, id, dto);
  }

  @Post('documents/:id/reject')
  @HttpCode(200)
  reject(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: RejectIntakeDocumentDto,
  ) {
    this.assertEnabled();
    return this.intake.reject(userId, id, dto.reason);
  }

  /**
   * Yonlendirme — MEVCUT surece devir.
   *
   * Rol kontrolu HEDEFE gore serviste yapiliyor: bu controller'a girebilen
   * bir `accounting` kullanicisi, ceza olusturamaz.
   */
  @Post('documents/:id/route')
  @HttpCode(200)
  route(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Param('id') id: string,
    @Body() dto: RouteIntakeDocumentDto,
  ) {
    this.assertEnabled();
    return this.routing.route(userId, role, id, dto);
  }

  /** Bolme / birlestirme. Orijinal dosya DEGISMEZ. */
  @Post('intakes/:id/resegment')
  @HttpCode(200)
  resegment(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: ResegmentDto,
  ) {
    this.assertEnabled();
    return this.intake.resegment(userId, id, dto.segments);
  }

  /**
   * YETKILI onizleme akisi.
   *
   * Dosya YALNIZCA bu uctan aciliyor; ham depolama yolu istemciye hicbir
   * yanitta verilmiyor. Baska kiracinin belgesi 404 doner — varligi
   * SIZDIRILMAZ.
   */
  @Get('intakes/:id/file')
  async file(@Param('id') id: string, @Res() res: Response): Promise<void> {
    this.assertEnabled();
    const file = await this.intake.resolveFileForReview(id);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.fileName)}"`);
    // Tarayici icerigi kendi tahminiyle yorumlamasin.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    createReadStream(join(AUTOMATION_DOCUMENT_UPLOAD_ABSOLUTE_DIR, file.storedFileName)).pipe(res);
  }
}
