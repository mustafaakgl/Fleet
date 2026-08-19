import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AutomationDocumentKind,
  DocumentIntakeSource,
  OrderIntakeChannel,
  OrderIntakeFinancialContent,
  OrderIntakeIntent,
  OrderIntakeMessageStatus,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AUTOMATION_DOCUMENT_UPLOAD_ABSOLUTE_DIR } from '../storage/local-storage.service';
import { sanitizeReceiptFileName } from '../fleet/fuel-receipts/core/receipt-file.util';
import { AutomationJobService } from './automation-job.service';
import { DocumentIntakeService, type IntakeActor } from './document-intake.service';
import { extractUnsafeText, inspectIntakeFile, IntakeFileError } from './core/intake-file';
import { parseEml, type EmlAttachment } from './core/order-intake-eml';
import {
  canOpenRawDocument,
  maskConfidence,
  maskEvidence,
  maskExtractionPayload,
  maskMessageSummary,
} from './core/order-intake-field-security';
import {
  buildDedupeKey,
  detectFinancialContent,
  hashContent,
  type FinancialContent,
} from './core/order-intake-identity';

/**
 * SIPARIS GELEN KUTUSU — GUVENLI GIRIS (Faz 16).
 *
 * UC KANAL, TEK YOL: web `.eml` yuklemesi, web PDF yuklemesi ve mock posta
 * connector'u AYNI islevden geciyor. Kanal basina ayri bir hat acmak, uc yerde
 * uc farkli guvenlik davranisi demekti — ve biri kacinilmaz olarak geride
 * kalirdi.
 *
 * ZARFIN TAMAMI GUVENSIZ VERIDIR: konu, gonderen, `Message-ID`, govde, dosya
 * adlari ve ek icerikleri. Bu servis onlari YALNIZCA saklar ve sanitize eder;
 * hicbiri talimat olarak yorumlanmaz, hicbiri yetki uretmez ve hicbiri
 * denetim kaydina KOPYALANMAZ.
 *
 * EKLER FAZ 14'TEN GECER: her ek `DocumentIntakeService.upload` cagriliyor ve
 * magic-byte / boyut / sayfa / sifreli-PDF / piksel kontrollerini oradan
 * aliyor. Burada ikinci bir dosya dogrulamasi YAZILMADI — yazilsaydi ikisi
 * zamanla ayrisir ve zayif olani gecerli sinir olurdu.
 */

/** Ham zarf icin ust sinir. Ekler ayrica Faz 14 sinirlarina tabi. */
export const MAX_ORDER_INTAKE_BYTES = Number(
  process.env.ORDER_INTAKE_MAX_BYTES ?? 30 * 1024 * 1024,
);

/** Tek mesajda islenecek en fazla ek. */
export const MAX_ORDER_INTAKE_ATTACHMENTS = 20;

export interface OrderIntakeInput {
  channel: OrderIntakeChannel;
  raw: Buffer;
  size?: number;
  /** GUVENSIZ dosya adi — sanitize edilerek saklanir. */
  fileName?: string | null;
  /** Connector kanalinda posta kutusu adresi. */
  mailbox?: string | null;
}

export interface AttachmentOutcome {
  fileName: string;
  declaredMimeType: string | null;
  byteSize: number;
  /** Kabul edilen ekin Faz 14 yukleme kimligi. */
  intakeId: string | null;
  /** `intake_file_*` reddi. `null` = kabul edildi. */
  rejectionCode: string | null;
}

export interface IngestResult {
  messageId: string;
  /** Ayni mesaj daha once dustuyse `true` ve YENI HICBIR SEY olusmadi. */
  duplicate: boolean;
  attachments: AttachmentOutcome[];
}

/** Prisma tekillik ihlali — yaris durumunda beklenen sonuc, hata degil. */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Aday JSON'undan kimlikleri guvenle cikarir. Bicim bozuksa BOS liste. */
function idsOf(candidates: unknown): string[] {
  if (typeof candidates !== 'object' || candidates === null) return [];
  const ids = (candidates as { ids?: unknown }).ids;
  if (!Array.isArray(ids)) return [];
  return ids.filter((id): id is string => typeof id === 'string').slice(0, 50);
}

const FINANCIAL_CONTENT: Record<FinancialContent, OrderIntakeFinancialContent> = {
  yes: OrderIntakeFinancialContent.yes,
  no: OrderIntakeFinancialContent.no,
  unknown: OrderIntakeFinancialContent.unknown,
};

@Injectable()
export class OrderIntakeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly documentIntake: DocumentIntakeService,
    private readonly jobs: AutomationJobService,
  ) {}

  /**
   * Bir mesaji gelen kutusuna alir.
   *
   * SIRA: boyut → zarf ayristirma → IDEMPOTENCY → blob → mesaj → ekler.
   *
   * Idempotency ekleri islemeden ONCE bakiliyor: ayni mesaj ikinci kez
   * dustugunde eklerin yeniden dogrulanmasi ve yeniden yazilmasi bosuna is
   * olurdu — ve daha kotusu, ikinci kez calisan siniflandirma ayni belge icin
   * ikinci bir mantiksal belge uretme riskini acardi.
   */
  async ingest(actor: IntakeActor, input: OrderIntakeInput): Promise<IngestResult> {
    const size = input.size ?? input.raw.length;
    if (!input.raw || input.raw.length === 0) {
      throw new BadRequestException({ code: 'order_intake_file_missing' });
    }
    if (size > MAX_ORDER_INTAKE_BYTES) {
      throw new BadRequestException({ code: 'order_intake_file_too_large' });
    }

    const contentHash = hashContent(input.raw);
    const isEnvelope = input.channel !== OrderIntakeChannel.web_pdf;
    const mailbox = input.mailbox?.trim().toLowerCase() || null;

    // PDF kanalinda ZARF YOK: `Message-ID`, gonderen ve konu bulunmaz ve
    // UYDURULMAZ. Anahtar yalnizca icerige dayanir.
    const envelope = isEnvelope ? parseEml(input.raw) : null;

    const dedupeKey = buildDedupeKey({
      mailbox,
      externalMessageId: envelope?.messageId ?? null,
      contentHash,
    });

    const existing = await this.prisma.orderIntakeMessage.findFirst({
      where: { dedupeKey },
      select: { id: true },
    });
    if (existing) {
      return { messageId: existing.id, duplicate: true, attachments: await this.attachmentsOf(existing.id) };
    }

    // --- Ekleri belirle ---
    // PDF kanalinda dosyanin KENDISI tek ektir; ayri bir "govde" yoktur.
    const rawAttachments: EmlAttachment[] = isEnvelope
      ? (envelope?.attachments ?? []).slice(0, MAX_ORDER_INTAKE_ATTACHMENTS)
      : [
          {
            fileName: input.fileName ?? 'transportauftrag.pdf',
            declaredMimeType: null,
            content: input.raw,
          },
        ];

    const attachmentSource =
      actor.kind === 'connector' ? DocumentIntakeSource.connector : DocumentIntakeSource.web;

    const outcomes: AttachmentOutcome[] = [];
    /** Ek metinleri — YALNIZCA finansal icerik tespiti icin, saklanmaz. */
    const attachmentTexts: string[] = [];

    for (const attachment of rawAttachments) {
      const fileName = sanitizeReceiptFileName(attachment.fileName);
      const outcome: AttachmentOutcome = {
        fileName,
        declaredMimeType: attachment.declaredMimeType,
        byteSize: attachment.content.length,
        intakeId: null,
        rejectionCode: null,
      };

      try {
        // FAZ 14 SINIRLARI: magic byte, boyut, sayfa sayisi, sifreli PDF,
        // piksel bombasi. Burada TEKRARLANMIYOR.
        const inspected = inspectIntakeFile(attachment.content, attachment.content.length);
        const uploaded = await this.documentIntake.upload(
          actor,
          {
            buffer: attachment.content,
            size: attachment.content.length,
            originalname: fileName,
            mimetype: inspected.kind,
          },
          { source: attachmentSource, idempotencyKey: null },
        );
        outcome.intakeId = uploaded.intakeId;
        const text = extractUnsafeText(attachment.content, inspected.pageCount);
        attachmentTexts.push(text.pages.join('\n'), text.metadata);
      } catch (error) {
        // REDDEDILEN EK SESSIZCE KAYBOLMAZ: sebebi kaydediliyor ki incelemeci
        // "gonderilen belge buydu" sanmasin. Hata SINIFI saklaniyor, saglayici
        // mesaji ya da yol DEGIL.
        outcome.rejectionCode = this.rejectionCodeOf(error);
        if (outcome.rejectionCode === null) throw error;
      }

      outcomes.push(outcome);
    }

    const financial = detectFinancialContent([
      envelope?.subject,
      envelope?.bodyText,
      ...attachmentTexts,
    ]);

    const artifactId = isEnvelope
      ? await this.storeEnvelope(actor, input, contentHash, size)
      : await this.artifactOfIntake(outcomes[0]?.intakeId ?? null, actor, input, contentHash, size);

    let message: { id: string };
    try {
      message = await this.prisma.orderIntakeMessage.create({
        data: {
          artifactId,
          channel: input.channel,
          status: OrderIntakeMessageStatus.extracting,
          mailbox,
          externalMessageId: envelope?.messageId ?? null,
          inReplyTo: envelope?.inReplyTo ?? null,
          fromAddress: envelope?.fromAddress ?? null,
          fromDisplayName: envelope?.fromDisplayName ?? null,
          subject: envelope?.subject ?? null,
          sentAt: envelope?.sentAt ?? null,
          contentHash,
          dedupeKey,
          bodyText: envelope?.bodyText || null,
          bodyHtml: envelope?.bodyHtml || null,
          attachmentCount: outcomes.length,
          containsFinancialData: FINANCIAL_CONTENT[financial],
          uploadedById: actor.kind === 'user' ? actor.userId : null,
          connectorId: actor.kind === 'connector' ? actor.connectorId : null,
        },
        select: { id: true },
      });
    } catch (error) {
      // YARIS: ayni mesaj es zamanli iki kez dustu. Ikisi de yukaridaki
      // "var mi?" kontrolunde bos gordu; tekillik uygulamada degil
      // VERITABANINDA cozuluyor. Kaybeden taraf ikinci mesaj ACMAZ.
      if (isUniqueViolation(error)) {
        const raced = await this.prisma.orderIntakeMessage.findFirst({
          where: { dedupeKey },
          select: { id: true },
        });
        if (!raced) throw error;
        return { messageId: raced.id, duplicate: true, attachments: await this.attachmentsOf(raced.id) };
      }
      throw error;
    }

    await this.prisma.orderIntakeAttachment.createMany({
      data: outcomes.map((outcome, index) => ({
        messageId: message.id,
        intakeId: outcome.intakeId,
        fileName: outcome.fileName,
        declaredMimeType: outcome.declaredMimeType,
        byteSize: outcome.byteSize,
        // Ayni mesajta birebir ayni ek TEK satir acar (`@@unique`); indeks
        // yalnizca ayni icerigi tasiyan iki farkli eki ayirmak icin degil,
        // BOS icerikli eklerin cakismamasi icin de gerekli.
        contentHash: hashContent(rawAttachments[index]!.content),
        rejectionCode: outcome.rejectionCode,
      })),
      skipDuplicates: true,
    });

    await this.audit.logAction({
      actorUserId: actor.kind === 'user' ? actor.userId : undefined,
      action: 'order_intake.received',
      entityType: 'OrderIntakeMessage',
      entityId: message.id,
      summary: `Auftragseingang erfasst (${input.channel})`,
      // KONU, GONDEREN, GOVDE VE HASH DENETIME GIRMEZ: denetim kaydi genis
      // okunur ve guvensiz metni oraya kopyalamak, onu ikinci bir yere
      // yaymak olurdu.
      metadata: {
        messageId: message.id,
        channel: input.channel,
        attachmentCount: outcomes.length,
        rejectedAttachments: outcomes.filter((item) => item.rejectionCode !== null).length,
        containsFinancialData: financial,
        viaConnector: actor.kind === 'connector',
      },
    });

    await this.enqueueExtraction(message.id, outcomes);

    return { messageId: message.id, duplicate: false, attachments: outcomes };
  }

  /**
   * Cikarim isini kuyruga koyar.
   *
   * PAYLOAD ICERIK TASIMAZ — yalnizca MESAJ KIMLIGI ve kabul edilen eklerin
   * kimlikleri. Konu ve govde kuyruk kaydina girseydi, is kaydini okuyabilen
   * her sey (loglar, hata raporlari, denetim) guvensiz metni de okurdu.
   * Worker icerigi ayri ve YETKILENDIRILMIS bir uctan cekiyor.
   *
   * IS ACILAMAZSA MESAJ KAYBOLMAZ: hata yutuluyor ve mesaj `failed`
   * isaretleniyor. Kuyruk sorunu yuzunden gelen bir siparisin hic
   * gorunmemesi, en kotu basarisizlik bicimi olurdu.
   */
  private async enqueueExtraction(messageId: string, outcomes: AttachmentOutcome[]): Promise<void> {
    const accepted = outcomes
      .filter((outcome) => outcome.intakeId !== null)
      .map((outcome) => ({ id: outcome.intakeId! }));

    try {
      await this.jobs.createJob(null, {
        jobType: 'transport_order.extract',
        schemaVersion: 1,
        payload: {
          messageId,
          ...(accepted.length > 0 ? { attachmentIntakeIds: accepted } : {}),
        },
      });
    } catch {
      await this.prisma.orderIntakeMessage.updateMany({
        where: { id: messageId },
        data: {
          status: OrderIntakeMessageStatus.failed,
          // Teknik hata SINIFI, saglayici mesaji degil.
          failureClass: 'extraction_job_not_queued',
        },
      });
    }
  }

  /** Faz 14 hata sinifini cikarir; baska bir hata ise `null` doner. */
  private rejectionCodeOf(error: unknown): string | null {
    if (error instanceof IntakeFileError) return error.code;
    if (error instanceof BadRequestException) {
      const response = error.getResponse();
      if (typeof response === 'object' && response !== null && 'code' in response) {
        const code = (response as { code: unknown }).code;
        if (typeof code === 'string') return code;
      }
    }
    return null;
  }

  /**
   * Ham `.eml` zarfini saklar.
   *
   * NEDEN `DocumentIntakeService.upload` KULLANILMIYOR: o islev magic-byte
   * kontrolu yapiyor ve PDF/goruntu disindaki her seyi REDDEDIYOR — dogru
   * davranis, cunku orada saklanan sey bir BELGE. Zarf belge degil; kontrolu
   * gevsetmek yerine ayri ve dar bir yol acildi.
   *
   * ONCE DOSYA, SONRA DB: ters sira, dosyasi olmayan bir kayit birakirdi.
   */
  private async storeEnvelope(
    actor: IntakeActor,
    input: OrderIntakeInput,
    contentHash: string,
    size: number,
  ): Promise<string> {
    const existing = await this.prisma.automationDocument.findFirst({
      where: { fileHash: contentHash },
      select: { id: true },
    });
    if (existing) return existing.id;

    const storedFileName = `${randomUUID()}.eml`;
    const absolutePath = join(AUTOMATION_DOCUMENT_UPLOAD_ABSOLUTE_DIR, storedFileName);
    await writeFile(absolutePath, input.raw);

    try {
      const created = await this.prisma.automationDocument.create({
        data: {
          kind: AutomationDocumentKind.order_intake,
          fileHash: contentHash,
          storedFileName,
          mimeType: 'message/rfc822',
          originalName: sanitizeReceiptFileName(input.fileName ?? 'nachricht.eml'),
          fileSize: size,
          uploadedById: actor.kind === 'user' ? actor.userId : null,
        },
        select: { id: true },
      });
      return created.id;
    } catch (error) {
      await unlink(absolutePath).catch(() => undefined);
      if (isUniqueViolation(error)) {
        const raced = await this.prisma.automationDocument.findFirst({
          where: { fileHash: contentHash },
          select: { id: true },
        });
        if (raced) return raced.id;
      }
      throw error;
    }
  }

  /**
   * PDF kanalinda blob ZATEN Faz 14 tarafindan yazildi.
   *
   * Ikinci kez yazmak ayni dosyayi iki blob'a bolerdi ve `[tenantId, fileHash]`
   * tekilligi zaten buna izin vermezdi.
   */
  private async artifactOfIntake(
    intakeId: string | null,
    actor: IntakeActor,
    input: OrderIntakeInput,
    contentHash: string,
    size: number,
  ): Promise<string> {
    if (intakeId) {
      const intake = await this.prisma.documentIntake.findFirst({
        where: { id: intakeId },
        select: { artifactId: true },
      });
      if (intake) return intake.artifactId;
    }
    // Ek REDDEDILDI (ornegin sifreli PDF): dosya Faz 14 tarafindan hic
    // yazilmadi. Zarfi yine de sakliyoruz — incelemeci NE GELDIGINI gormeli.
    return this.storeEnvelope(actor, input, contentHash, size);
  }

  // -------------------------------------------------------------------------
  // Okuma — MASKELEME SUNUCU YANITINDA
  // -------------------------------------------------------------------------

  /**
   * Gelen kutusu listesi.
   *
   * Filtreler NIYETE gore: arayuzdeki new/amendment/cancellation/unknown
   * sekmelerinin karsiligi. Ozet, rolune gore maskelenerek doner — konu satiri
   * bile tutar tasiyabilir.
   */
  async list(
    query: { intent?: string; status?: string; take?: number; skip?: number },
    role: string | null | undefined,
  ): Promise<{ items: Record<string, unknown>[]; total: number }> {
    const take = Math.min(Math.max(query.take ?? 25, 1), 100);
    const skip = Math.max(query.skip ?? 0, 0);
    const where = {
      ...(query.status ? { status: query.status as OrderIntakeMessageStatus } : {}),
      ...(query.intent ? { review: { proposedIntent: query.intent as OrderIntakeIntent } } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.orderIntakeMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        select: {
          id: true,
          channel: true,
          status: true,
          subject: true,
          fromAddress: true,
          fromDisplayName: true,
          mailbox: true,
          sentAt: true,
          createdAt: true,
          attachmentCount: true,
          containsFinancialData: true,
          bodyText: true,
          review: {
            select: {
              id: true,
              proposedIntent: true,
              resolvedIntent: true,
              status: true,
              companyMatchStatus: true,
              orderMatchStatus: true,
              possibleDuplicate: true,
              matchedCompany: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.orderIntakeMessage.count({ where }),
    ]);

    const items = rows.map((row) =>
      maskMessageSummary(
        {
          id: row.id,
          channel: row.channel,
          status: row.status,
          subject: row.subject,
          // ONIZLEME KIRPILMIS: liste ekraninda tam govde gostermenin sebebi yok.
          bodyPreview: row.bodyText ? row.bodyText.slice(0, 160) : null,
          fromAddress: row.fromAddress,
          fromDisplayName: row.fromDisplayName,
          mailbox: row.mailbox,
          sentAt: row.sentAt,
          createdAt: row.createdAt,
          attachmentCount: row.attachmentCount,
          containsFinancialData: row.containsFinancialData,
          review: row.review,
          rawDocumentAvailable: canOpenRawDocument(role, row.containsFinancialData),
        },
        role,
      ),
    );

    return { items, total };
  }

  /**
   * Tek bir mesajin tam gorunumu.
   *
   * AJANIN CIKTISI ve INSANIN KARARI AYRI donuyor: `proposed` degismez oneri,
   * `review` sunucunun eslestirmesi ve insanin secimi. Ikisini tek nesnede
   * birlestirmek, arayuzde "model mi dedi insan mi secti" ayrimini kaybettirirdi.
   */
  async detail(messageId: string, role: string | null | undefined): Promise<Record<string, unknown>> {
    const message = await this.prisma.orderIntakeMessage.findFirst({
      where: { id: messageId },
      select: {
        id: true,
        channel: true,
        status: true,
        subject: true,
        bodyText: true,
        bodyHtml: true,
        fromAddress: true,
        fromDisplayName: true,
        mailbox: true,
        inReplyTo: true,
        sentAt: true,
        createdAt: true,
        containsFinancialData: true,
        failureClass: true,
        attachments: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            fileName: true,
            declaredMimeType: true,
            byteSize: true,
            rejectionCode: true,
            intakeId: true,
          },
        },
        review: {
          select: {
            id: true,
            status: true,
            proposedIntent: true,
            resolvedIntent: true,
            companyMatchStatus: true,
            companyCandidates: true,
            orderMatchStatus: true,
            orderCandidates: true,
            possibleDuplicate: true,
            rejectionReason: true,
            matchedCompany: { select: { id: true, name: true } },
            selectedCompany: { select: { id: true, name: true } },
            matchedOrder: { select: { id: true, orderNumber: true, status: true, updatedAt: true } },
            selectedOrder: { select: { id: true, orderNumber: true, status: true, updatedAt: true } },
            duplicateOfOrder: { select: { id: true, orderNumber: true, status: true } },
            proposal: {
              select: {
                id: true,
                payload: true,
                confidence: true,
                evidence: true,
                checks: true,
                resultTransportOrderId: true,
                resultTransportOrderRevisionId: true,
                approvalTasks: {
                  orderBy: { sequence: 'asc' },
                  select: {
                    sequence: true,
                    status: true,
                    decision: true,
                    assignedRole: true,
                    decidedAt: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!message) {
      throw new NotFoundException({ code: 'order_intake_message_not_found' });
    }

    const proposal = message.review?.proposal ?? null;

    /**
     * ADAYLARI ISIMLERIYLE COZ.
     *
     * Sunucu adaylari KIMLIK olarak tutuyor; arayuzun secim listesi cizebilmesi
     * icin ad gerekiyor. Cozum KIRACI KAPSAMLI: listede baska bir kiracinin
     * kaydi varsa (olmamali) burada da GORUNMEZ — ve secim ucu zaten kimligi
     * ayrica yeniden dogruluyor, yani liste bir yetki kaynagi DEGIL.
     */
    const companyCandidateIds = idsOf(message.review?.companyCandidates);
    const orderCandidateIds = idsOf(message.review?.orderCandidates);

    const [companyCandidates, orderCandidates] = await Promise.all([
      companyCandidateIds.length > 0
        ? this.prisma.company.findMany({
            where: { id: { in: companyCandidateIds } },
            select: { id: true, name: true },
            take: 50,
          })
        : Promise.resolve([]),
      orderCandidateIds.length > 0
        ? this.prisma.transportOrder.findMany({
            where: { id: { in: orderCandidateIds } },
            select: { id: true, orderNumber: true, status: true, updatedAt: true },
            take: 50,
          })
        : Promise.resolve([]),
    ]);
    const summary = maskMessageSummary(
      {
        id: message.id,
        channel: message.channel,
        status: message.status,
        subject: message.subject,
        bodyPreview: message.bodyText ? message.bodyText.slice(0, 160) : null,
        containsFinancialData: message.containsFinancialData,
      },
      role,
    );

    return {
      ...summary,
      fromAddress: message.fromAddress,
      fromDisplayName: message.fromDisplayName,
      mailbox: message.mailbox,
      inReplyTo: message.inReplyTo,
      sentAt: message.sentAt,
      createdAt: message.createdAt,
      failureClass: message.failureClass,
      /**
       * GUVENLI ONIZLEME: `bodyHtml` zaten sanitize edilmis olarak SAKLANIYOR
       * (script, uzak gorsel, tiklanabilir link yok). Ham HTML hicbir zaman
       * ne saklandi ne de doner. Fiyat tasiyan mesajda ofise govde de kapali.
       */
      bodyHtml: canOpenRawDocument(role, message.containsFinancialData) ? message.bodyHtml : null,
      bodyText: canOpenRawDocument(role, message.containsFinancialData) ? message.bodyText : null,
      rawDocumentAvailable: canOpenRawDocument(role, message.containsFinancialData),
      attachments: message.attachments,
      review: message.review
        ? {
            id: message.review.id,
            status: message.review.status,
            proposedIntent: message.review.proposedIntent,
            resolvedIntent: message.review.resolvedIntent,
            companyMatchStatus: message.review.companyMatchStatus,
            companyCandidates: message.review.companyCandidates,
            /** Secim listesi icin cozulmus adaylar. */
            companyOptions: companyCandidates,
            orderMatchStatus: message.review.orderMatchStatus,
            orderCandidates: message.review.orderCandidates,
            orderOptions: orderCandidates,
            possibleDuplicate: message.review.possibleDuplicate,
            duplicateOfOrder: message.review.duplicateOfOrder,
            rejectionReason: message.review.rejectionReason,
            matchedCompany: message.review.matchedCompany,
            selectedCompany: message.review.selectedCompany,
            matchedOrder: message.review.matchedOrder,
            selectedOrder: message.review.selectedOrder,
            tasks: proposal?.approvalTasks ?? [],
            resultTransportOrderId: proposal?.resultTransportOrderId ?? null,
            resultTransportOrderRevisionId: proposal?.resultTransportOrderRevisionId ?? null,
          }
        : null,
      proposed: proposal
        ? {
            id: proposal.id,
            payload: maskExtractionPayload(
              (proposal.payload ?? {}) as Record<string, unknown>,
              role,
            ),
            confidence: maskConfidence(
              proposal.confidence as Record<string, number> | null,
              role,
            ),
            evidence: maskEvidence(
              proposal.evidence as { entries?: unknown } | null,
              role,
            ),
            checks: proposal.checks,
          }
        : null,
    };
  }

  /**
   * Ham `.eml` / PDF akisi icin dosya adini cozer.
   *
   * ROL KONTROLU BURADA: fiyat tasiyan (ya da tasidigi BILINMEYEN) bir belge
   * yalnizca finansal role aciliyor. Ham belge alan bazinda maskelenemez —
   * icinde ne varsa okunur.
   */
  async resolveRawDocument(
    messageId: string,
    role: string | null | undefined,
  ): Promise<{ storedFileName: string; mimeType: string; originalName: string }> {
    const message = await this.prisma.orderIntakeMessage.findFirst({
      where: { id: messageId },
      select: {
        containsFinancialData: true,
        artifact: { select: { storedFileName: true, mimeType: true, originalName: true } },
      },
    });
    if (!message) {
      throw new NotFoundException({ code: 'order_intake_message_not_found' });
    }
    if (!canOpenRawDocument(role, message.containsFinancialData)) {
      throw new ForbiddenException({ code: 'order_intake_raw_document_forbidden' });
    }
    return message.artifact;
  }

  private async attachmentsOf(messageId: string): Promise<AttachmentOutcome[]> {
    const rows = await this.prisma.orderIntakeAttachment.findMany({
      where: { messageId },
      orderBy: { createdAt: 'asc' },
      select: {
        fileName: true,
        declaredMimeType: true,
        byteSize: true,
        intakeId: true,
        rejectionCode: true,
      },
    });
    return rows.map((row) => ({
      fileName: row.fileName,
      declaredMimeType: row.declaredMimeType,
      byteSize: row.byteSize,
      intakeId: row.intakeId,
      rejectionCode: row.rejectionCode,
    }));
  }
}
