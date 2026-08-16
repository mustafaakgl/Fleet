import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { FINANCIAL_ROLES } from '../../common/utils/permissions';
import { FUEL_RECEIPT_UPLOAD_ABSOLUTE_DIR } from '../../storage/local-storage.service';
import {
  ApproveFuelReceiptDto,
  ListFuelReceiptsQueryDto,
  RejectFuelReceiptDto,
} from './dto/review-fuel-receipt.dto';
import { FuelReceiptReviewService } from './fuel-receipt-review.service';

/**
 * Muhasebenin yakit fisi inceleme ucu.
 *
 * ROL: `FINANCIAL_ROLES` (admin, boss, accounting) — repoda ZATEN VAR olan
 * canonical sabit. Yeni bir guard uydurulmadi ve `OPERATIONAL_WRITE_ROLES`
 * genisletilmedi: o grup ofisi iceriyor ve ofisin mali tutarlari gormesi
 * gerekmiyor. Burada `office` bilincli olarak DISARIDA — dogrudan URL yazsa
 * bile RolesGuard reddeder; frontend'de menuyu gizlemek tek basina guvenlik
 * degildir.
 *
 * `driver` da disarida: surucu kendi fisini yalnizca kendi ucundan gorur
 * (bkz. FuelReceiptDriverController).
 */
@Controller('fleet/fuel-receipts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...FINANCIAL_ROLES)
export class FuelReceiptReviewController {
  constructor(private readonly review: FuelReceiptReviewService) {}

  /**
   * Inceleme kuyrugu. Varsayilan: yalnizca `submitted`, en uzun bekleyen once,
   * sunucu tarafinda sayfalanmis.
   */
  @Get()
  list(@Query() query: ListFuelReceiptsQueryDto) {
    return this.review.list(query);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.review.detail(id);
  }

  /**
   * Fis goruntusu — YETKILI akis.
   *
   * Ham depolama yolu istemciye hic verilmiyor; dosya adi veritabanindan
   * geliyor ama yalnizca son parcasi kullaniliyor (bkz. resolveFileForReview),
   * yani dizin disina cikilamaz.
   */
  @Get(':id/file')
  async file(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const file = await this.review.resolveFileForReview(id);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(file.fileName)}"`,
    );
    createReadStream(join(FUEL_RECEIPT_UPLOAD_ABSOLUTE_DIR, file.storedFileName)).pipe(res);
  }

  /**
   * Onay. `expectedUpdatedAt` ZORUNLU: iki muhasebeci ayni fisi ayni anda
   * kapatamasin. Kaybeden istek 409 `fuel_receipt_review_conflict` alir.
   */
  @Post(':id/approve')
  @HttpCode(200)
  approve(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: ApproveFuelReceiptDto,
  ) {
    return this.review.approve(userId, id, dto);
  }

  /** Ret. Neden ZORUNLU — surucu neyi duzeltecegini bilmeli. */
  @Post(':id/reject')
  @HttpCode(200)
  reject(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: RejectFuelReceiptDto,
  ) {
    return this.review.reject(userId, id, dto);
  }
}
