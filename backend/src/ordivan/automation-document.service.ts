import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AutomationDocumentKind, AutomationJobStatus } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AUTOMATION_DOCUMENT_UPLOAD_ABSOLUTE_DIR } from '../storage/local-storage.service';
import { detectReceiptFileKind } from '../fleet/fuel-receipts/core/receipt-file.util';
import type { AuthenticatedConnector } from './ordivan-connector.service';

/**
 * Belge boyut siniri.
 *
 * Yapilandirilabilir: bir servis faturasi genelde 1-2 sayfa, ama taranmis
 * yuksek cozunurluklu PDF'ler buyuk gelebiliyor. Varsayilan 15 MB.
 */
export const MAX_AUTOMATION_DOCUMENT_BYTES = Number(
  process.env.ORDIVAN_MAX_DOCUMENT_BYTES ?? 15 * 1024 * 1024,
);

export interface UploadedDocumentBuffer {
  buffer: Buffer;
  size: number;
  originalname?: string;
  mimetype?: string;
}

export interface AutomationDocumentView {
  id: string;
  kind: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  /** YETKILI akis. Ham depolama yolu ISTEMCIYE ASLA verilmez. */
  fileDownloadPath: string;
  /** Bu belge icin acilmis is (varsa). */
  jobId: string | null;
  /** Ayni dosya daha once yuklenmisti — yeni is ACILMADI. */
  duplicate: boolean;
}

/**
 * Otomasyon belgeleri (Faz 13).
 *
 * YALNIZ GERCEK PDF: karar dosyanin ILK BAYTLARINDAN veriliyor. Uzanti ve
 * istemcinin bildirdigi MIME serbestce yazilabilir; `evil.html` dosyasini
 * `application/pdf` diye gondermek tek satirlik bir istektir.
 *
 * KIRACI ICINDE TEKIL: ayni dosyanin ikinci yuklemesi yeni is ACMAZ, var olan
 * belgeyi doner (idempotent). Kiracilar ARASINDA hash ya da belge varligi
 * SIZMAZ — sorgular kiraci kapsamli.
 */
@Injectable()
export class AutomationDocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private view(
    row: {
      id: string;
      kind: string;
      originalName: string;
      mimeType: string;
      fileSize: number;
      createdAt: Date;
    },
    jobId: string | null,
    duplicate: boolean,
  ): AutomationDocumentView {
    return {
      id: row.id,
      kind: row.kind,
      originalName: row.originalName,
      mimeType: row.mimeType,
      fileSize: row.fileSize,
      createdAt: row.createdAt.toISOString(),
      // `storedFileName` BU YANITTA YOK ve olmayacak.
      fileDownloadPath: `/ordivan/automation/documents/${row.id}/file`,
      jobId,
      duplicate,
    };
  }

  async upload(
    userId: string,
    file: UploadedDocumentBuffer | undefined,
  ): Promise<AutomationDocumentView> {
    if (!file) {
      throw new BadRequestException({ code: 'automation_document_missing' });
    }
    if (file.size > MAX_AUTOMATION_DOCUMENT_BYTES) {
      throw new BadRequestException({ code: 'automation_document_too_large' });
    }

    // GERCEK tur ilk baytlardan; PDF disi her sey reddediliyor.
    const kind = detectReceiptFileKind(file.buffer.subarray(0, 16));
    if (kind !== 'application/pdf') {
      throw new BadRequestException({ code: 'automation_document_not_pdf' });
    }

    const fileHash = createHash('sha256').update(file.buffer).digest('hex');

    // Kiraci ICINDE duplicate: yeni is acilmaz, var olan doner. Ayni faturanin
    // iki kez maliyetlesmesi buradan baslardi.
    const existing = await this.prisma.automationDocument.findFirst({
      where: { fileHash },
      select: {
        id: true,
        kind: true,
        originalName: true,
        mimeType: true,
        fileSize: true,
        createdAt: true,
        jobs: { select: { id: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (existing) {
      return this.view(existing, existing.jobs[0]?.id ?? null, true);
    }

    const storedFileName = `${randomUUID()}.pdf`;
    const absolutePath = join(AUTOMATION_DOCUMENT_UPLOAD_ABSOLUTE_DIR, storedFileName);

    // Once DOSYA, sonra DB: DB yazimi patlarsa dosya geri aliniyor. Ters sira
    // olsaydi elimizde dosyasi olmayan bir belge kaydi kalirdi.
    await writeFile(absolutePath, file.buffer);

    try {
      const created = await this.prisma.automationDocument.create({
        data: {
          kind: AutomationDocumentKind.service_invoice,
          fileHash,
          storedFileName,
          mimeType: 'application/pdf',
          originalName: (file.originalname ?? 'rechnung.pdf').slice(0, 255),
          fileSize: file.size,
          uploadedById: userId,
        },
        select: {
          id: true,
          kind: true,
          originalName: true,
          mimeType: true,
          fileSize: true,
          createdAt: true,
        },
      });

      await this.audit.logAction({
        actorUserId: userId,
        action: 'automation_document.uploaded',
        entityType: 'AutomationDocument',
        entityId: created.id,
        summary: `Automationsdokument hochgeladen (${created.originalName})`,
        // HAM PDF, METIN, HASH VE DEPOLAMA YOLU DENETIME GIRMEZ.
        metadata: {
          documentId: created.id,
          kind: created.kind,
          fileSize: created.fileSize,
          mimeType: created.mimeType,
        },
      });

      return this.view(created, null, false);
    } catch (error) {
      await unlink(absolutePath).catch(() => undefined);
      throw error;
    }
  }

  /** Yetkili akis — muhasebe/yonetim onizlemesi. */
  async resolveFileForReview(
    documentId: string,
  ): Promise<{ storedFileName: string; mimeType: string; fileName: string }> {
    const row = await this.prisma.automationDocument.findFirst({
      where: { id: documentId },
      select: { storedFileName: true, mimeType: true, originalName: true },
    });
    if (!row) {
      // Baska kiracinin belgesi de 404 doner: varligi sizdirilmaz.
      throw new NotFoundException({ code: 'automation_document_not_found' });
    }
    return {
      storedFileName: row.storedFileName.split('/').pop() ?? '',
      mimeType: row.mimeType,
      fileName: row.originalName,
    };
  }

  /**
   * Connector indirmesi.
   *
   * Connector YALNIZCA lease aldigi ise ait belgeyi indirebilir: is kimligi,
   * kiralayan connector ve GUNCEL `leaseToken` birlikte dogrulaniyor. Bu
   * olmasaydi gecerli bir anahtar, kiracinin butun belgelerini indirmeye
   * yeterdi.
   */
  async resolveFileForConnector(
    connector: AuthenticatedConnector,
    jobId: string,
    leaseToken: string,
  ): Promise<{ storedFileName: string; mimeType: string; fileName: string }> {
    const job = await this.prisma.automationJob.findFirst({
      where: { id: jobId },
      select: {
        leasedByConnectorId: true,
        leaseToken: true,
        status: true,
        document: { select: { storedFileName: true, mimeType: true, originalName: true } },
      },
    });

    if (
      !job ||
      job.leasedByConnectorId !== connector.connectorId ||
      !job.leaseToken ||
      job.leaseToken !== leaseToken ||
      (job.status !== AutomationJobStatus.leased && job.status !== AutomationJobStatus.running)
    ) {
      throw new ConflictException({ code: 'ordivan_lease_not_current' });
    }
    if (!job.document) {
      throw new NotFoundException({ code: 'automation_document_not_found' });
    }

    return {
      storedFileName: job.document.storedFileName.split('/').pop() ?? '',
      mimeType: job.document.mimeType,
      fileName: job.document.originalName,
    };
  }
}
