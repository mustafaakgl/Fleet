import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { OrderIntakeChannel } from '@prisma/client';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { RequiresWrite } from '../common/decorators/requires-write.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { DriverBlockGuard } from '../common/guards/driver-block.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OPERATIONAL_ROLES } from '../common/utils/permissions';
import { AUTOMATION_DOCUMENT_UPLOAD_ABSOLUTE_DIR } from '../storage/local-storage.service';
import {
  ApproveOrderIntakeDto,
  DecideOrderIntakeTaskDto,
  ListOrderIntakeQueryDto,
  RejectOrderIntakeDto,
} from './dto/order-intake.dto';
import { OrderIntakeDecisionService } from './order-intake-decision.service';
import { MAX_ORDER_INTAKE_BYTES, OrderIntakeService } from './order-intake.service';

interface AuthenticatedRequest {
  user: { id: string; role?: string };
}

/**
 * SIPARIS GELEN KUTUSU (Faz 16).
 *
 * ROLLER REPODAN TURETILDI, GENISLETILMEDI — `transport-orders.controller`
 * ile AYNI kombinasyon:
 *
 *   - `DriverBlockGuard` + `@Roles(...OPERATIONAL_ROLES)`: SURUCU ve MUSTERI
 *     hicbir ucu goremez (403). Gelen kutusu ticari bir yuzeydir.
 *   - `@RequiresWrite()` yalnizca YAZMA uclarinda: taslak/revizyon ureten
 *     onay, operasyon yazma rolleri (admin, boss, office) icin. Muhasebe
 *     operasyon plani ACAMAZ — bu, `transport-orders`ta zaten boyle ve gelen
 *     kutusu o kisiti GEVSETEMEZ.
 *   - FINANSAL ALANLAR yanit govdesinde maskeleniyor (bkz.
 *     order-intake-field-security). Ekranda gizlemek, ayni ucu `curl` ile
 *     cagiran birine hicbir sey yapmaz.
 *
 * GOREV KARARLARI ROL BAZLI VE SERVISTE: ofis operasyonel gorevi, muhasebe
 * finansal gorevi kapatir. `@RequiresWrite()` burada KULLANILMIYOR cunku o
 * muhasebeyi tamamen disarida birakir ve finansal incelemeyi imkansiz kilardi.
 */
@Controller('order-intake')
@UseGuards(JwtAuthGuard, DriverBlockGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class OrderIntakeController {
  constructor(
    private readonly intake: OrderIntakeService,
    private readonly decisions: OrderIntakeDecisionService,
  ) {}

  /**
   * `.eml` ya da tasima emri PDF'i yukleme.
   *
   * KANAL SUNUCUDA BELIRLENIYOR: istemcinin bildirdigi tur degil, dosyanin
   * ILK BAYTLARI. Bir `.eml` uzantisi PDF icerigi tasiyabilir ve tersi.
   */
  @Post('uploads')
  @RequiresWrite()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_ORDER_INTAKE_BYTES } }))
  @HttpCode(201)
  async upload(
    @Req() request: AuthenticatedRequest,
    @UploadedFile() file: { buffer: Buffer; size: number; originalname?: string } | undefined,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException({ code: 'order_intake_file_missing' });
    }
    return this.intake.ingest(
      { kind: 'user', userId: request.user.id },
      {
        channel: detectChannel(file.buffer),
        raw: file.buffer,
        size: file.size,
        fileName: file.originalname,
      },
    );
  }

  /** Gelen kutusu listesi — niyet ve durum filtreleriyle. */
  @Get('messages')
  list(@Req() request: AuthenticatedRequest, @Query() query: ListOrderIntakeQueryDto) {
    return this.intake.list(
      { intent: query.intent, status: query.status, take: query.take, skip: query.skip },
      request.user.role,
    );
  }

  @Get('messages/:id')
  detail(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.intake.detail(id, request.user.role);
  }

  /**
   * HAM BELGE akisi.
   *
   * `Content-Disposition: attachment` ve `nosniff`: `.eml`/PDF tarayicida
   * RENDER EDILMIYOR, indiriliyor. Ham icerigi tarayiciya cizdirmek, sanitize
   * ettigimiz her seyi geri getirirdi.
   */
  @Get('messages/:id/raw')
  async raw(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const file = await this.intake.resolveRawDocument(id, request.user.role);
    response.setHeader('Content-Type', 'application/octet-stream');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Disposition', 'attachment');
    // DEPOLAMA YOLU YANITA GIRMEZ; yalnizca akis doner.
    createReadStream(join(AUTOMATION_DOCUMENT_UPLOAD_ABSOLUTE_DIR, file.storedFileName)).pipe(response);
  }

  /** Iptal etkisi — ONIZLEME. Hicbir sey degismez. */
  @Get('reviews/:id/cancellation-impact')
  cancellationImpact(@Param('id') id: string) {
    return this.decisions.cancellationImpact(id);
  }

  /**
   * Operasyonel ya da finansal inceleme gorevini karara baglar.
   *
   * Rol kontrolu SERVISTE ve sirasa gore: ofis 1, muhasebe 2, admin/boss ikisi.
   */
  @Post('reviews/:id/tasks/:sequence')
  @HttpCode(200)
  decideTask(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('sequence', ParseIntPipe) sequence: number,
    @Body() dto: DecideOrderIntakeTaskDto,
  ) {
    return this.decisions.decideTask(
      request.user.id,
      request.user.role,
      id,
      sequence,
      dto.decision,
      dto.note,
    );
  }

  /**
   * Onay — TASLAK / BEKLEYEN REVIZYON / IPTAL ONIZLEMESI uretir.
   *
   * `@RequiresWrite()`: canonical operasyon kaydi ureten tek uc bu ve
   * muhasebe operasyon plani ACAMAZ.
   */
  @Post('reviews/:id/approve')
  @RequiresWrite()
  @HttpCode(200)
  approve(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ApproveOrderIntakeDto,
  ) {
    return this.decisions.approve(request.user.id, request.user.role, id, {
      intent: dto.intent,
      companyId: dto.companyId,
      orderId: dto.orderId,
      expectedUpdatedAt: dto.expectedUpdatedAt,
      values: dto.values,
      consignments: dto.consignments,
      acknowledgeDuplicate: dto.acknowledgeDuplicate,
    });
  }

  @Post('reviews/:id/reject')
  @RequiresWrite()
  @HttpCode(200)
  reject(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: RejectOrderIntakeDto,
  ) {
    return this.decisions.reject(request.user.id, id, dto.reason);
  }
}

/**
 * Kanali ILK BAYTLARDAN belirler.
 *
 * `%PDF-` ile baslayan her sey PDF kanali; digerleri zarf olarak ayristirilir.
 * Uzantiya ya da istemcinin bildirdigi MIME turune GUVENILMEZ — ikisi de
 * serbestce yazilir.
 */
function detectChannel(buffer: Buffer): OrderIntakeChannel {
  return buffer.subarray(0, 5).toString('latin1') === '%PDF-'
    ? OrderIntakeChannel.web_pdf
    : OrderIntakeChannel.web_eml;
}
