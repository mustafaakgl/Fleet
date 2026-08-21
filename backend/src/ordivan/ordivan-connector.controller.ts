import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Res,
  ServiceUnavailableException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentIntakeSource, OrderIntakeChannel } from '@prisma/client';
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
import { connectorHasCapability } from './core/job-type-registry';
import { MAX_INTAKE_FILE_BYTES } from './core/intake-file';
import { OrderIntakeContentService } from './order-intake-content.service';
import { DispatchService } from './dispatch.service';
import { MAX_ORDER_INTAKE_BYTES, OrderIntakeService } from './order-intake.service';
import { DocumentIntakeService } from './document-intake.service';
import { ConnectorIntakeUploadDto, ConnectorOrderIntakeMessageDto } from './dto/document-inbox.dto';
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
    private readonly intake: DocumentIntakeService,
    private readonly orderIntake: OrderIntakeService,
    private readonly orderIntakeContent: OrderIntakeContentService,
    private readonly dispatch: DispatchService,
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

  /**
   * Tamamlama IDEMPOTENT; bayat deneme REDDEDILIR.
   *
   * DISPATCH BAGLAMASI BURADA (Faz 17g): `dispatch.plan` isi tamamlandiginda
   * ajanin ciktisi `DispatchProposal`e BAGLANMALI, yoksa oneri sonsuza kadar
   * `processing` kalir. Baglama `AutomationJobService` icinde yapilamiyor
   * cunku `DispatchService` zaten ona bagimli — ters yon bir DONGU olurdu.
   * Controller ikisini de goruyor ve dogru yer burasi.
   *
   * BAGLAMA SESSIZCE BASARISIZ OLABILIR ve bu bilincli: `linkProposal` bes
   * kosullu bir CAS. Kosul tutmazsa (bayat deneme, revizyon degismis, zaten
   * baglanmis) cevap YOK SAYILIYOR — hata firlatmak worker'i sonsuz yeniden
   * denemeye sokardi. Tamamlama yaniti bu yuzden DEGISMIYOR.
   */
  @Post('jobs/:id/complete')
  @UseGuards(ConnectorCredentialGuard)
  @HttpCode(200)
  async complete(
    @CurrentConnector() connector: AuthenticatedConnector,
    @Param('id') id: string,
    @Body() dto: CompleteJobDto,
  ) {
    const result = await this.jobs.completeJob(connector, id, dto);

    if (dto.proposalType === 'dispatch.plan.suggestion' && result.proposalId) {
      const context = await this.jobs.dispatchContextFor(id);
      if (context) {
        const payload = (dto.payload ?? {}) as { rankedCandidates?: unknown };
        const rankings = Array.isArray(payload.rankedCandidates)
          ? (payload.rankedCandidates as Array<Record<string, unknown>>).map((entry) => ({
              candidateRef: String(entry.candidateRef ?? ''),
              rank: typeof entry.rank === 'number' ? entry.rank : 0,
              rationaleKey: String(entry.rationaleKey ?? ''),
            }))
          : [];

        await this.dispatch.linkProposal({
          dispatchProposalId: context.dispatchProposalId,
          jobId: id,
          attempt: context.attempt,
          automationProposalId: result.proposalId,
          rankings,
        });
      }
    }

    return result;
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

  /**
   * BELGE YUKLEME (Faz 14) — tarayici connector'i.
   *
   * YETENEK KONTROLU: connector'da `document.intake.upload@v1` YOKSA uc
   * kapalidir. Is alma yetkisi olan bir connector otomatikman yukleme de
   * yapamaz ve tersi de gecerli — yetkiler ayri.
   *
   * KISA OMURLU OTURUM: yukleme, connector'in KENDI kimlik dogrulamasiyla
   * yapilir (`ConnectorCredentialGuard`); ayri, uzun omurlu bir yukleme
   * anahtari URETILMEZ.
   *
   * IDEMPOTENCY: ag koptugunda tarayici ayni belgeyi yeniden gonderir.
   * `idempotencyKey` kiraci icinde tekil oldugu icin ikinci gonderim YENI
   * GIRDI ACMAZ — var olani doner.
   *
   * KIRACIYI ISTEMCI BELIRLEMEZ: `tenantId` yalnizca guard'in cozdugu
   * connector kaydindan gelir. Yerel klasor yolu, bilgisayar kullanici adi ve
   * cihaz verisi bu ucun govdesinde YOKTUR ve istenmez.
   */
  @Post('intake/uploads')
  @UseGuards(ConnectorCredentialGuard)
  @UseInterceptors(FileInterceptor('document', { limits: { fileSize: MAX_INTAKE_FILE_BYTES } }))
  @HttpCode(201)
  async intakeUpload(
    @CurrentConnector() connector: AuthenticatedConnector,
    @UploadedFile()
    file: { buffer: Buffer; size: number; originalname?: string; mimetype?: string } | undefined,
    @Body() dto: ConnectorIntakeUploadDto,
  ) {
    if (!connectorHasCapability(connector.capabilities, 'document.intake.upload@v1')) {
      throw new ForbiddenException({ code: 'ordivan_capability_missing' });
    }
    return this.intake.upload({ kind: 'connector', connectorId: connector.connectorId }, file, {
      source: DocumentIntakeSource.connector,
      idempotencyKey: dto.idempotencyKey,
    });
  }

  /**
   * SIPARIS MESAJI GONDERIMI (Faz 16) — mock posta connector'u.
   *
   * GERCEK CONNECTOR PROTOKOLU: ayni `ConnectorCredentialGuard`, ayni kimlik
   * modeli, ayri bir yetenek. Faz 16 kendi kimlik dogrulamasini ya da kendi
   * "posta ucunu" ACMADI — acsaydi, connector siniri iki ayri yerde tanimli
   * olurdu ve ikisi zamanla ayrisirdi.
   *
   * YETENEK AYRI: `order_intake.message.push@v1`. Belge yukleyebilen bir
   * tarayici connector'u otomatikman siparis mesaji GONDEREMEZ.
   *
   * KIRACIYI ISTEMCI BELIRLEMEZ: `tenantId` yalnizca guard'in cozdugu
   * connector kaydindan gelir. Govdedeki `mailbox` bir ETIKETTIR.
   *
   * IDEMPOTENCY SUNUCUDA: anahtar mesajin kendisinden turetiliyor; istemci
   * gonderemez (bkz. ConnectorOrderIntakeMessageDto).
   */
  @Post('order-intake/messages')
  @UseGuards(ConnectorCredentialGuard)
  @UseInterceptors(FileInterceptor('message', { limits: { fileSize: MAX_ORDER_INTAKE_BYTES } }))
  @HttpCode(201)
  async orderIntakeMessage(
    @CurrentConnector() connector: AuthenticatedConnector,
    @UploadedFile()
    file: { buffer: Buffer; size: number; originalname?: string } | undefined,
    @Body() dto: ConnectorOrderIntakeMessageDto,
  ) {
    if (!connectorHasCapability(connector.capabilities, 'order_intake.message.push@v1')) {
      throw new ForbiddenException({ code: 'ordivan_capability_missing' });
    }
    if (!file?.buffer) {
      throw new BadRequestException({ code: 'order_intake_file_missing' });
    }
    return this.orderIntake.ingest(
      { kind: 'connector', connectorId: connector.connectorId },
      {
        channel: OrderIntakeChannel.connector_mailbox,
        raw: file.buffer,
        size: file.size,
        fileName: file.originalname,
        mailbox: dto.mailbox,
      },
    );
  }

  /**
   * CIKARIM ICIN MESAJ ICERIGI (Faz 16).
   *
   * NEDEN AYRI UC: is payload'i icerik TASIMAZ (bkz. order-intake.service).
   * Kuyruk kaydinda duran her sey loglara, hata raporlarina ve denetime
   * sizabilir; guvensiz e-posta govdesini oraya kopyalamak icin hicbir sebep
   * yok. Icerik yalnizca burada, yetenegi olan connector'a ve YALNIZ kendi
   * kiracisinin mesaji icin aciliyor.
   *
   * DONEN HTML SANITIZE EDILMIS, donen metin GUVENSIZ. Worker bu metinden
   * KONTROL uretmiyor — kontrolleri sunucu ayni icerikten kendisi uretiyor.
   * Aksi halde ele gecirilmis bir connector "enjeksiyon yok" diyebilirdi.
   */
  @Get('order-intake/messages/:id/content')
  @UseGuards(ConnectorCredentialGuard)
  async orderIntakeMessageContent(
    @CurrentConnector() connector: AuthenticatedConnector,
    @Param('id') messageId: string,
  ) {
    if (!connectorHasCapability(connector.capabilities, 'transport_order.extract@v1')) {
      throw new ForbiddenException({ code: 'ordivan_capability_missing' });
    }
    return this.orderIntakeContent.contentForExtraction(messageId);
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
