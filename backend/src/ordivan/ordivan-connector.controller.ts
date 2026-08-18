import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { AUTOMATION_DOCUMENT_UPLOAD_ABSOLUTE_DIR } from '../storage/local-storage.service';
import { AutomationDocumentService } from './automation-document.service';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { AutomationJobService } from './automation-job.service';
import { CurrentConnector } from './decorators/current-connector.decorator';
import {
  CompleteJobDto,
  ConnectorEnrollDto,
  ConnectorHeartbeatDto,
  FailJobDto,
  LeaseTokenDto,
} from './dto/ordivan.dto';
import { ConnectorCredentialGuard } from './guards/connector-credential.guard';
import { OrdivanConnectorService, type AuthenticatedConnector } from './ordivan-connector.service';
import {
  CURRENT_PROTOCOL_VERSION,
  MIN_SUPPORTED_PROTOCOL_VERSION,
  isOrdivanEnabled,
  resolveOrdivanMode,
} from './ordivan.config';

/**
 * CONNECTOR PROTOKOLU (Faz 12).
 *
 * Bu controller connector'in gorebilecegi TEK yuzeydir. Burada tanimli
 * olmayan hicbir sey connector'a acik degildir: genel SQL, shell, keyfi HTTP
 * ya da Fleet'in diger uclari YOK.
 *
 * BAGLANTI YONU: connector Fleet'e cikis yapar (outbound HTTPS). Musterinin
 * makinesinde INBOUND PORT ACILMAZ — bu, kurulumun en buyuk guvenlik ve
 * destek maliyetini ortadan kaldiriyor.
 *
 * KIRACIYI GUARD KURAR (bkz. ConnectorCredentialGuard); istekteki hicbir alan
 * kiraci belirleyemez.
 */
@Controller('ordivan/connector')
export class OrdivanConnectorController {
  constructor(
    private readonly connectors: OrdivanConnectorService,
    private readonly jobs: AutomationJobService,
    private readonly documents: AutomationDocumentService,
  ) {}

  /**
   * Enrollment: kod karsiliginda kalici anahtar.
   *
   * `@Public`: bu uc HENIZ anahtari olmayan makine icin var — kimlik
   * dogrulamasi kodun KENDISI. Kod tek kullanimlik ve kisa omurlu.
   */
  @Public()
  /**
   * SIKI RATE LIMIT: bu uc kimlik dogrulamasi olmadan cagrilabiliyor ve
   * dogru kod, bir makineye kiraci capinda yetki veriyor. Repodaki giris
   * ucuyla AYNI siniri kullaniyor (5/dk) — yeni bir politika icat edilmedi.
   */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('enroll')
  @HttpCode(200)
  enroll(@Body() dto: ConnectorEnrollDto) {
    if (!isOrdivanEnabled(resolveOrdivanMode())) {
      throw new ServiceUnavailableException({ code: 'ordivan_disabled' });
    }
    return this.connectors.enroll(dto);
  }

  @Post('heartbeat')
  @UseGuards(ConnectorCredentialGuard)
  @HttpCode(200)
  async heartbeat(
    @CurrentConnector() connector: AuthenticatedConnector,
    @Body() dto: ConnectorHeartbeatDto,
  ) {
    const result = await this.connectors.heartbeat(connector.connectorId, dto);
    return {
      ...result,
      protocol: {
        current: CURRENT_PROTOCOL_VERSION,
        minimumSupported: MIN_SUPPORTED_PROTOCOL_VERSION,
      },
      capabilities: connector.capabilities,
    };
  }

  /**
   * Is kiralama.
   *
   * Yalnizca AYNI KIRACININ ve connector'in yeteneklerine uyan isleri doner.
   * Ayni isi iki connector ayni anda alamaz (kosullu updateMany).
   */
  @Post('jobs/lease')
  @UseGuards(ConnectorCredentialGuard)
  @HttpCode(200)
  async lease(@CurrentConnector() connector: AuthenticatedConnector) {
    const job = await this.jobs.leaseJob(connector);
    return { job };
  }

  @Post('jobs/:id/running')
  @UseGuards(ConnectorCredentialGuard)
  @HttpCode(200)
  markRunning(
    @CurrentConnector() connector: AuthenticatedConnector,
    @Param('id') id: string,
    @Body() dto: LeaseTokenDto,
  ) {
    return this.jobs.markRunning(connector, id, dto.leaseToken);
  }

  /** Tamamlama IDEMPOTENT; bayat deneme REDDEDILIR. */
  @Post('jobs/:id/complete')
  @UseGuards(ConnectorCredentialGuard)
  @HttpCode(200)
  complete(
    @CurrentConnector() connector: AuthenticatedConnector,
    @Param('id') id: string,
    @Body() dto: CompleteJobDto,
  ) {
    return this.jobs.completeJob(connector, id, dto);
  }

  /**
   * Isin belgesini indirir (Faz 13).
   *
   * YALNIZCA LEASE ALDIGI IS: is kimligi, kiralayan connector ve GUNCEL
   * `leaseToken` birlikte dogrulaniyor. Bu olmasaydi gecerli bir anahtar,
   * kiracinin butun belgelerini indirmeye yeterdi.
   */
  @Get('jobs/:id/document')
  @UseGuards(ConnectorCredentialGuard)
  async jobDocument(
    @CurrentConnector() connector: AuthenticatedConnector,
    @Param('id') id: string,
    @Headers('x-ordivan-lease-token') leaseToken: string,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.documents.resolveFileForConnector(connector, id, leaseToken ?? '');
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.fileName)}"`);
    createReadStream(join(AUTOMATION_DOCUMENT_UPLOAD_ABSOLUTE_DIR, file.storedFileName)).pipe(res);
  }

  @Post('jobs/:id/fail')
  @UseGuards(ConnectorCredentialGuard)
  @HttpCode(200)
  fail(
    @CurrentConnector() connector: AuthenticatedConnector,
    @Param('id') id: string,
    @Body() dto: FailJobDto,
  ) {
    return this.jobs.failJob(connector, id, dto);
  }
}
