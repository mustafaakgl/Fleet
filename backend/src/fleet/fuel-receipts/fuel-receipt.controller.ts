import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { MAX_RECEIPT_FILE_BYTES } from './core/receipt-file.util';
import { ConfirmFuelReceiptDto } from './dto/confirm-fuel-receipt.dto';
import { FuelReceiptService, type UploadedReceiptBuffer } from './fuel-receipt.service';

/**
 * BELLEK ICI yukleme — diske DEGIL.
 *
 * Sebep: dosyanin gercek turu (magic byte) ve SHA-256 hash'i, kayit yaratmadan
 * ONCE bilinmeli. Multer'in diskStorage'i dosyayi once yazar; o durumda gecersiz
 * ya da duplicate bir dosya diske dusmus olur ve temizlenmesi gerekir. 8 MB
 * sinirinda bellekte tutmak guvenli ve akisi basitlestiriyor.
 *
 * `fileFilter` YOK: istemcinin bildirdigi MIME'a gore eleme yapmak yaniltici
 * bir guvenlik hissi verir (o alan serbestce yazilir). Gercek karar servis
 * icinde ilk baytlara bakilarak veriliyor.
 */
const RECEIPT_UPLOAD_INTERCEPTOR = FileInterceptor('receipt', {
  storage: memoryStorage(),
  limits: { fileSize: MAX_RECEIPT_FILE_BYTES, files: 1 },
});

/**
 * Surucunun yakit fisi ucu.
 *
 * Hicbir uc `driverId`, `vehicleId` ya da `tenantId` KABUL ETMEZ: ucu de
 * oturumdan cozulur. Baska surucunun fisi 404 ile gizlenir — "yetkin yok"
 * demek, o kaydin var oldugunu sizdirmak olurdu.
 */
@Controller('driver/fuel-receipts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('driver')
export class FuelReceiptDriverController {
  constructor(private readonly receipts: FuelReceiptService) {}

  /**
   * Fis yukler. `fuelingIntentId` OPSIYONEL — aktif tur ya da istasyon secimi
   * olmadan da fis yuklenebilir ve bu yol hicbir zaman kapanmaz.
   */
  @Post()
  @UseInterceptors(RECEIPT_UPLOAD_INTERCEPTOR)
  upload(
    @CurrentUser('id') userId: string,
    @UploadedFile() receipt?: UploadedReceiptBuffer,
    @Body('fuelingIntentId') fuelingIntentId?: string,
  ) {
    return this.receipts.upload(userId, receipt, fuelingIntentId?.trim() || undefined);
  }

  /** Surucunun kendi fisleri, en yeniden eskiye. */
  @Get()
  list(@CurrentUser('id') userId: string, @Query('limit') limit?: string) {
    const parsed = Number(limit);
    return this.receipts.list(userId, Number.isFinite(parsed) ? parsed : undefined);
  }

  @Get(':id')
  getOne(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.receipts.getById(userId, id);
  }

  /**
   * Fis goruntusu — YETKILI akis.
   *
   * Ham depolama yolu istemciye hic verilmiyor; goruntuye yalnizca kaydin
   * sahibi, kendi oturumuyla, bu uc uzerinden ulasir.
   */
  @Get(':id/file')
  async file(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.receipts.resolveFileForDriver(userId, id);
    res.setHeader('Content-Type', file.mimeType);
    // inline: surucu fisi ekranda gormek istiyor, indirmek degil.
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.fileName)}"`);
    createReadStream(file.absolutePath).pipe(res);
  }

  /**
   * OCR'i calistirir. Tekrarlanan es zamanli cagri saglayiciya IKINCI KEZ
   * gitmez; mevcut durum doner.
   */
  @Post(':id/analyze')
  analyze(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.receipts.analyze(userId, id);
  }

  /**
   * Surucu degerleri dogrular -> `submitted`.
   *
   * Strict DTO + global `forbidNonWhitelisted`: izin verilmeyen tek bir alan
   * (ornegin `workflowStatus` ya da `vehicleId`) istegi 400 yapar.
   */
  @Put(':id/confirm')
  confirm(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: ConfirmFuelReceiptDto,
  ) {
    return this.receipts.confirm(userId, id, dto);
  }
}
