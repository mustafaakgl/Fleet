import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AutomationDocumentKind,
  DocumentIntakeSource,
  OrderIntakeChannel,
  OrderIntakeFinancialContent,
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
import { DocumentIntakeService, type IntakeActor } from './document-intake.service';
import { extractUnsafeText, inspectIntakeFile, IntakeFileError } from './core/intake-file';
import { parseEml, type EmlAttachment } from './core/order-intake-eml';
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

    return { messageId: message.id, duplicate: false, attachments: outcomes };
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
