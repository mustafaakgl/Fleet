import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AutomationDocumentKind,
  DocumentIntakeSource,
  DocumentIntakeStatus,
  IntakeDocumentStatus,
  IntakeVehicleMatchStatus,
  Prisma,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AUTOMATION_DOCUMENT_UPLOAD_ABSOLUTE_DIR } from '../storage/local-storage.service';
import { extensionForKind, sanitizeReceiptFileName } from '../fleet/fuel-receipts/core/receipt-file.util';
import type { AutomationCheckResult } from './core/automation-check.contract';
import {
  isKnownDocumentTypeKey,
  isKnownInspectionSubtype,
  resolveDocumentType,
  type DocumentTypeKey,
} from './core/document-type-registry';
import { PageRangeError, validatePageRanges, type PageRange } from './core/document-pages';
import {
  IntakeFileError,
  extractUnsafeText,
  inspectIntakeFile,
  type IntakeFileErrorCode,
} from './core/intake-file';
import { buildRoutingPlan, type RoutingPlan } from './core/intake-routing-plan';
import { resolveIntakeVehicle } from './core/intake-vehicle-match';
import { classifyDocument, type DocumentCandidates } from './core/mock-ordivan-classifier';

/**
 * BELGE GELEN KUTUSU — ALIM (Faz 14).
 *
 * TEK GIRIS MERKEZI: web, mobil ve connector (tarayici) ayni yolu kullanir.
 * Kanal yalnizca `source` alaninda gorunur; guvenlik kontrolleri, tekillik ve
 * siniflandirma UCUNDE DE AYNIDIR — bir kanalin "daha guvenilir" sayilmasi,
 * en zayif kanalin butun sistemin guvenligi olmasi demektir.
 *
 * ISTEMCI DAYATAMAZ: `tenantId`, belge turu, hedef modul, `vehicleId` ve onay
 * durumu bu servisin hicbir girisinde YOKTUR. Tur oneri olarak uretilir, karar
 * insanindir; kiraci baglamdan gelir.
 */

/** Yukleyen taraf. Ikisinden BIRI dolu olur. */
export type IntakeActor =
  | { kind: 'user'; userId: string }
  | { kind: 'connector'; connectorId: string };

export interface UploadedIntakeFile {
  buffer: Buffer;
  size: number;
  originalname?: string;
  mimetype?: string;
}

export interface IntakeUploadOptions {
  source: DocumentIntakeSource;
  /** Connector yuklemesinde ZORUNLU — ag kopmasinda tekrar gonderim tek girdi acar. */
  idempotencyKey?: string | null;
}

/** Mantiksal belgenin arayuze donen gorunumu. DEPOLAMA YOLU ASLA YOK. */
export interface IntakeDocumentView {
  id: string;
  typeKey: string;
  subtype: string | null;
  status: string;
  pageFrom: number;
  pageTo: number;
  confidence: number | null;
  vehicleId: string | null;
  vehicleMatchStatus: string;
  driverId: string | null;
  assignedUserId: string | null;
  /** Ajanin ILK ciktisi — degismez. Insanin duzeltmesiyle karsilastirmak icin. */
  proposed: {
    typeKey: string;
    subtype: string | null;
    pageFrom: number;
    pageTo: number;
    confidence: number | null;
  };
  corrected: boolean;
  evidence: unknown;
  candidates: unknown;
  checks: AutomationCheckResult[];
  routing: {
    destination: string;
    entityType: string;
    entityId: string;
    secondaryEntityType: string | null;
    secondaryEntityId: string | null;
  } | null;
  rejectionReason: string | null;
  domainReviewReason: string | null;
}

const MAX_LOGICAL_DOCUMENTS = 30;

/** Prisma tekillik ihlali — yaris durumunda beklenen bir sonuc, bir hata degil. */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class DocumentIntakeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // Yukleme
  // -------------------------------------------------------------------------

  /**
   * Fiziksel yukleme.
   *
   * SIRA: once dogrula, sonra tekillik, sonra DOSYA, sonra DB. Ters sira
   * olsaydi elimizde dosyasi olmayan bir belge kaydi kalirdi.
   *
   * KIRACI ICINDE TEKIL: ayni dosyanin ikinci yuklemesi YENI GIRDI ACMAZ, var
   * olani doner. Kiracilar ARASINDA hash de belge varligi da SIZMAZ — sorgular
   * kiraci kapsamli, cevap her iki durumda da ayni bicimde.
   */
  async upload(
    actor: IntakeActor,
    file: UploadedIntakeFile | undefined,
    options: IntakeUploadOptions,
  ): Promise<{ intakeId: string; duplicate: boolean; documents: IntakeDocumentView[] }> {
    // Idempotency once: ayni anahtarla gelen tekrar, DOSYAYI BILE islemeden
    // var olani donmeli.
    const idempotencyKey = options.idempotencyKey?.trim() || null;
    if (idempotencyKey) {
      const existing = await this.prisma.documentIntake.findFirst({
        where: { idempotencyKey },
        select: { id: true },
      });
      if (existing) {
        return { intakeId: existing.id, duplicate: true, documents: await this.documentsOf(existing.id) };
      }
    }

    let inspected;
    try {
      inspected = inspectIntakeFile(file?.buffer, file?.size);
    } catch (error) {
      if (error instanceof IntakeFileError) {
        // GUVENLI HATA: saglayici mesaji, yol ya da icerik tasimayan bir SINIF.
        throw new BadRequestException({ code: error.code as IntakeFileErrorCode });
      }
      throw error;
    }

    const buffer = file!.buffer;
    const fileHash = createHash('sha256').update(buffer).digest('hex');

    // Kiraci ICINDE duplicate: ayni faturanin iki kez maliyetlenmesi buradan
    // baslardi. Dosya YENIDEN YAZILMAZ, var olan blob'a baglanir.
    const existingArtifact = await this.prisma.automationDocument.findFirst({
      where: { fileHash },
      select: { id: true, intakes: { select: { id: true }, orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (existingArtifact?.intakes[0]) {
      const intakeId = existingArtifact.intakes[0].id;
      return { intakeId, duplicate: true, documents: await this.documentsOf(intakeId) };
    }

    const originalName = sanitizeReceiptFileName(file!.originalname);
    const storedFileName = `${randomUUID()}${extensionForKind(inspected.kind)}`;
    const absolutePath = join(AUTOMATION_DOCUMENT_UPLOAD_ABSOLUTE_DIR, storedFileName);

    let artifactId = existingArtifact?.id ?? null;
    if (!artifactId) {
      // Once DOSYA, sonra DB: DB yazimi patlarsa dosya geri aliniyor. Ters sira
      // olsaydi elimizde dosyasi olmayan bir belge kaydi kalirdi.
      await writeFile(absolutePath, buffer);
      try {
        const created = await this.prisma.automationDocument.create({
          data: {
            kind: AutomationDocumentKind.document_intake,
            fileHash,
            storedFileName,
            mimeType: inspected.kind,
            originalName,
            fileSize: file!.size,
            uploadedById: actor.kind === 'user' ? actor.userId : null,
          },
          select: { id: true },
        });
        artifactId = created.id;
      } catch (error) {
        await unlink(absolutePath).catch(() => undefined);
        // YARIS: baska bir istek AYNI dosyayi bu arada yazdi. Yukaridaki
        // "var mi?" kontrolu ikisinde de bos donmustu — tekillik uygulamada
        // degil veritabaninda cozuluyor.
        if (isUniqueViolation(error)) {
          const raced = await this.prisma.automationDocument.findFirst({
            where: { fileHash },
            select: { id: true },
          });
          if (!raced) throw error;
          artifactId = raced.id;
        } else {
          throw error;
        }
      }
    }

    let intake: { id: string };
    try {
      intake = await this.prisma.documentIntake.create({
        data: {
          artifactId,
          source: options.source,
          status: DocumentIntakeStatus.processing,
          pageCount: inspected.pageCount,
          idempotencyKey,
          uploadedById: actor.kind === 'user' ? actor.userId : null,
          connectorId: actor.kind === 'connector' ? actor.connectorId : null,
        },
        select: { id: true },
      });
    } catch (error) {
      // `artifactId` ve `idempotencyKey` TEKIL: yarisi kaybeden istek ikinci
      // girdi ACMAZ, var olani doner (idempotent).
      if (isUniqueViolation(error)) {
        const raced = await this.prisma.documentIntake.findFirst({
          where: idempotencyKey ? { idempotencyKey } : { artifactId },
          select: { id: true },
        });
        if (!raced) throw error;
        return { intakeId: raced.id, duplicate: true, documents: await this.documentsOf(raced.id) };
      }
      throw error;
    }

    await this.audit.logAction({
      actorUserId: actor.kind === 'user' ? actor.userId : undefined,
      action: 'document_intake.uploaded',
      entityType: 'DocumentIntake',
      entityId: intake.id,
      summary: `Dokument im Posteingang eingegangen (${options.source})`,
      // HAM METIN, HASH VE DEPOLAMA YOLU DENETIME GIRMEZ.
      metadata: {
        intakeId: intake.id,
        source: options.source,
        pageCount: inspected.pageCount,
        mimeType: inspected.kind,
        fileSize: file!.size,
        viaConnector: actor.kind === 'connector',
      },
    });

    await this.classify(intake.id, buffer, inspected.pageCount);

    return { intakeId: intake.id, duplicate: false, documents: await this.documentsOf(intake.id) };
  }

  /**
   * Mock Ordivan siniflandirmasi + SUNUCU tarafi arac eslestirmesi.
   *
   * BELGE METNI BURADA GUVENSIZ VERIDIR: yalnizca siniflandiriciya girer,
   * hicbir yere yazilmaz ve talimat olarak yorumlanmaz.
   */
  private async classify(intakeId: string, buffer: Buffer, pageCount: number): Promise<void> {
    const text = extractUnsafeText(buffer, pageCount);
    const result = classifyDocument(text, pageCount);

    // Arac eslestirmesi SUNUCUDA — ajan `vehicleId` uretemez.
    const vehicles = await this.prisma.vehicle.findMany({
      where: { deletedAt: null },
      select: { id: true, plateNumber: true, vin: true },
    });

    const rows = result.documents.slice(0, MAX_LOGICAL_DOCUMENTS).map((document) => {
      const match = resolveIntakeVehicle(vehicles, document.candidates);
      const checks: AutomationCheckResult[] = [
        ...document.checks,
        {
          code: 'vehicle_match',
          status: match.status,
          messageKey: `documentInbox.checks.vehicle_match.${match.status}`,
          messageParams: { reason: match.reason },
          evidence: {
            matchedBy: match.matchedBy,
            candidateCount: match.candidateIds.length,
            ambiguous: match.ambiguous,
          },
          ...(match.status === 'unknown' ? { unknownReason: match.reason } : {}),
        },
      ];

      return {
        intakeId,
        proposedTypeKey: document.typeKey,
        proposedConfidence: new Prisma.Decimal(document.confidence.toFixed(3)),
        proposedPageFrom: document.range.pageFrom,
        proposedPageTo: document.range.pageTo,
        proposedSubtype: document.subtype,
        evidence: document.evidence as unknown as Prisma.InputJsonValue,
        candidates: document.candidates as unknown as Prisma.InputJsonValue,
        checks: checks as unknown as Prisma.InputJsonValue,
        segmentationTrusted: result.segmentationTrusted,
        // Insanin karari ONERIYLE BASLAR ama ayri sutunda durur.
        typeKey: document.typeKey,
        subtype: document.subtype,
        pageFrom: document.range.pageFrom,
        pageTo: document.range.pageTo,
        status: IntakeDocumentStatus.needs_review,
        vehicleId: match.vehicleId,
        vehicleMatchStatus: match.status as IntakeVehicleMatchStatus,
      };
    });

    await this.prisma.intakeDocument.createMany({ data: rows });
    await this.prisma.documentIntake.updateMany({
      where: { id: intakeId },
      data: {
        status: DocumentIntakeStatus.needs_review,
        classifierVersion: result.classifierVersion,
      },
    });
  }

  // -------------------------------------------------------------------------
  // Okuma
  // -------------------------------------------------------------------------

  private view(row: {
    id: string;
    typeKey: string;
    subtype: string | null;
    status: string;
    pageFrom: number;
    pageTo: number;
    proposedTypeKey: string;
    proposedSubtype: string | null;
    proposedPageFrom: number;
    proposedPageTo: number;
    proposedConfidence: Prisma.Decimal | null;
    vehicleId: string | null;
    vehicleMatchStatus: string;
    driverId: string | null;
    assignedUserId: string | null;
    evidence: Prisma.JsonValue;
    candidates: Prisma.JsonValue;
    checks: Prisma.JsonValue;
    rejectionReason: string | null;
    domainReviewReason: string | null;
    routing: {
      destination: string;
      entityType: string;
      entityId: string;
      secondaryEntityType: string | null;
      secondaryEntityId: string | null;
    } | null;
  }): IntakeDocumentView {
    const confidence = row.proposedConfidence === null ? null : Number(row.proposedConfidence);
    return {
      id: row.id,
      typeKey: row.typeKey,
      subtype: row.subtype,
      status: row.status,
      pageFrom: row.pageFrom,
      pageTo: row.pageTo,
      confidence,
      vehicleId: row.vehicleId,
      vehicleMatchStatus: row.vehicleMatchStatus,
      driverId: row.driverId,
      assignedUserId: row.assignedUserId,
      proposed: {
        typeKey: row.proposedTypeKey,
        subtype: row.proposedSubtype,
        pageFrom: row.proposedPageFrom,
        pageTo: row.proposedPageTo,
        confidence,
      },
      // Insan ajandan FARKLI bir sey sectiyse arayuz bunu gosterebilmeli.
      corrected:
        row.typeKey !== row.proposedTypeKey ||
        row.pageFrom !== row.proposedPageFrom ||
        row.pageTo !== row.proposedPageTo,
      evidence: row.evidence,
      candidates: row.candidates,
      checks: (Array.isArray(row.checks) ? row.checks : []) as unknown as AutomationCheckResult[],
      routing: row.routing,
      rejectionReason: row.rejectionReason,
      domainReviewReason: row.domainReviewReason,
    };
  }

  private readonly documentSelect = {
    id: true,
    typeKey: true,
    subtype: true,
    status: true,
    pageFrom: true,
    pageTo: true,
    proposedTypeKey: true,
    proposedSubtype: true,
    proposedPageFrom: true,
    proposedPageTo: true,
    proposedConfidence: true,
    vehicleId: true,
    vehicleMatchStatus: true,
    driverId: true,
    assignedUserId: true,
    evidence: true,
    candidates: true,
    checks: true,
    rejectionReason: true,
    domainReviewReason: true,
    routing: {
      select: {
        destination: true,
        entityType: true,
        entityId: true,
        secondaryEntityType: true,
        secondaryEntityId: true,
      },
    },
  } as const;

  private async documentsOf(intakeId: string): Promise<IntakeDocumentView[]> {
    const rows = await this.prisma.intakeDocument.findMany({
      where: { intakeId },
      orderBy: [{ pageFrom: 'asc' }, { id: 'asc' }],
      select: this.documentSelect,
    });
    return rows.map((row) => this.view(row));
  }

  /** Gelen kutusu listesi. Filtreler: kaynak, durum, tur, tarih, arac, atanan. */
  async list(query: {
    source?: DocumentIntakeSource;
    status?: IntakeDocumentStatus;
    typeKey?: string;
    vehicleId?: string;
    assignedUserId?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ rows: unknown[]; page: number; pageSize: number; total: number; totalPages: number }> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(Math.max(query.pageSize ?? 25, 1), 100);

    const where: Prisma.IntakeDocumentWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.vehicleId) where.vehicleId = query.vehicleId;
    if (query.assignedUserId) where.assignedUserId = query.assignedUserId;
    if (query.typeKey) {
      // Registry disi bir tur FILTRE OLARAK DA kabul edilmez.
      if (!isKnownDocumentTypeKey(query.typeKey)) {
        throw new BadRequestException({ code: 'document_intake_unknown_type' });
      }
      where.typeKey = query.typeKey;
    }
    if (query.source) where.intake = { source: query.source };
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    const [total, rows] = await Promise.all([
      this.prisma.intakeDocument.count({ where }),
      this.prisma.intakeDocument.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          ...this.documentSelect,
          createdAt: true,
          intake: {
            select: { id: true, source: true, status: true, pageCount: true, createdAt: true },
          },
        },
      }),
    ]);

    return {
      rows: rows.map((row) => ({
        ...this.view(row),
        createdAt: row.createdAt.toISOString(),
        intake: {
          id: row.intake.id,
          source: row.intake.source,
          status: row.intake.status,
          pageCount: row.intake.pageCount,
          createdAt: row.intake.createdAt.toISOString(),
        },
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /** Tek mantiksal belge + "onaylandiginda ne olacak" ozeti. */
  async detail(documentId: string, role: string | null): Promise<Record<string, unknown>> {
    const row = await this.prisma.intakeDocument.findFirst({
      where: { id: documentId },
      select: {
        ...this.documentSelect,
        createdAt: true,
        decidedAt: true,
        intake: {
          select: {
            id: true,
            source: true,
            status: true,
            pageCount: true,
            createdAt: true,
            classifierVersion: true,
            // Belgenin KIMLIGI ve adi; DEPOLAMA YOLU YOK.
            artifact: { select: { id: true, originalName: true, mimeType: true, fileSize: true } },
          },
        },
      },
    });
    if (!row) {
      // Baska kiracinin belgesi de 404 doner: varligi SIZDIRILMAZ.
      throw new NotFoundException({ code: 'document_intake_not_found' });
    }

    return {
      ...this.view(row),
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
      intake: {
        id: row.intake.id,
        source: row.intake.source,
        status: row.intake.status,
        pageCount: row.intake.pageCount,
        classifierVersion: row.intake.classifierVersion,
        createdAt: row.intake.createdAt.toISOString(),
        document: {
          id: row.intake.artifact.id,
          originalName: row.intake.artifact.originalName,
          mimeType: row.intake.artifact.mimeType,
          fileSize: row.intake.artifact.fileSize,
          // YETKILI akis; ham depolama yolu istemciye ASLA verilmez.
          fileDownloadPath: `/ordivan/inbox/intakes/${row.intake.id}/file`,
        },
      },
      plan: this.planFor(row, role),
    };
  }

  private planFor(
    row: {
      typeKey: string;
      vehicleId: string | null;
      vehicleMatchStatus: string;
      driverId: string | null;
      checks: Prisma.JsonValue;
      routing: unknown | null;
    },
    role: string | null,
  ): RoutingPlan {
    return buildRoutingPlan({
      typeKey: row.typeKey,
      role,
      vehicleId: row.vehicleId,
      vehicleMatchStatus: row.vehicleMatchStatus as 'verified' | 'failed' | 'unknown',
      driverId: row.driverId,
      checks: (Array.isArray(row.checks) ? row.checks : []) as unknown as AutomationCheckResult[],
      alreadyRouted: row.routing !== null,
    });
  }

  /** Yetkili onizleme. Depolama yolu disari cikmaz. */
  async resolveFileForReview(
    intakeId: string,
  ): Promise<{ storedFileName: string; mimeType: string; fileName: string }> {
    const row = await this.prisma.documentIntake.findFirst({
      where: { id: intakeId },
      select: {
        artifact: { select: { storedFileName: true, mimeType: true, originalName: true } },
      },
    });
    if (!row) {
      throw new NotFoundException({ code: 'document_intake_not_found' });
    }
    return {
      // Yol bileseni ayiklaniyor: depolanan ad zaten rastgele ama bu satir
      // ileride bir sey degisirse path traversal'in onunu kesiyor.
      storedFileName: row.artifact.storedFileName.split('/').pop() ?? '',
      mimeType: row.artifact.mimeType,
      fileName: row.artifact.originalName,
    };
  }

  // -------------------------------------------------------------------------
  // Duzeltme
  // -------------------------------------------------------------------------

  /**
   * BOLME / BIRLESTIRME.
   *
   * ORIJINAL DEGISMEZ: dosya, hash ve sayfa sayisi burada okunur, YAZILMAZ.
   * Yeniden bolumleme mantiksal belgeleri degistirir; blob'a dokunmaz ve
   * KOPYALAMAZ.
   *
   * YONLENDIRILMIS belge yeniden bolunemez: canonical kayit uretilmis bir
   * belgenin sayfa araligini degistirmek, kaydin dayanagini altindan cekmek
   * olurdu.
   */
  async resegment(
    userId: string,
    intakeId: string,
    segments: Array<{ pageFrom: number; pageTo: number; typeKey?: string }>,
  ): Promise<IntakeDocumentView[]> {
    const intake = await this.prisma.documentIntake.findFirst({
      where: { id: intakeId },
      select: {
        id: true,
        pageCount: true,
        documents: { select: { id: true, status: true, routing: { select: { id: true } } } },
      },
    });
    if (!intake) {
      throw new NotFoundException({ code: 'document_intake_not_found' });
    }
    if (intake.documents.some((document) => document.routing !== null)) {
      throw new ConflictException({ code: 'document_intake_already_routed' });
    }
    if (segments.length > MAX_LOGICAL_DOCUMENTS) {
      throw new BadRequestException({ code: 'document_intake_too_many_segments' });
    }

    let ranges: PageRange[];
    try {
      ranges = validatePageRanges(segments, intake.pageCount);
    } catch (error) {
      if (error instanceof PageRangeError) {
        throw new BadRequestException({ code: error.code, detail: error.detail });
      }
      throw error;
    }

    // Turler segment sirasina gore; verilmeyen `unknown` olur — bolen kisi
    // turu de belirtmek ZORUNDA DEGIL.
    const sortedSegments = [...segments].sort((left, right) => left.pageFrom - right.pageFrom);
    for (const segment of sortedSegments) {
      if (segment.typeKey !== undefined && !isKnownDocumentTypeKey(segment.typeKey)) {
        throw new BadRequestException({ code: 'document_intake_unknown_type' });
      }
    }

    const previous = await this.prisma.intakeDocument.findMany({
      where: { intakeId },
      select: {
        proposedTypeKey: true,
        proposedSubtype: true,
        proposedPageFrom: true,
        proposedPageTo: true,
        proposedConfidence: true,
        evidence: true,
        candidates: true,
        checks: true,
        segmentationTrusted: true,
        vehicleId: true,
        vehicleMatchStatus: true,
        driverId: true,
      },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.intakeDocument.deleteMany({ where: { intakeId } });
      await tx.intakeDocument.createMany({
        data: ranges.map((range, index) => {
          // AJANIN ILK CIKTISI KORUNUYOR: kullanici sayfalari yeniden bolse de
          // "model ne demisti" sorusunun cevabi kaybolmamali. En cok ortusen
          // eski parcanin onerisi tasiniyor.
          const source =
            previous.find(
              (item) => item.proposedPageFrom <= range.pageTo && item.proposedPageTo >= range.pageFrom,
            ) ?? previous[0];
          const typeKey = sortedSegments[index]?.typeKey ?? source?.proposedTypeKey ?? 'unknown@v1';

          return {
            intakeId,
            proposedTypeKey: source?.proposedTypeKey ?? 'unknown@v1',
            proposedConfidence: source?.proposedConfidence ?? null,
            proposedPageFrom: source?.proposedPageFrom ?? range.pageFrom,
            proposedPageTo: source?.proposedPageTo ?? range.pageTo,
            proposedSubtype: source?.proposedSubtype ?? null,
            evidence: (source?.evidence ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            candidates: (source?.candidates ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            checks: (source?.checks ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            // Insan elle boldu: artik ajanin bolumlemesi degil.
            segmentationTrusted: false,
            typeKey,
            subtype: source?.proposedSubtype ?? null,
            pageFrom: range.pageFrom,
            pageTo: range.pageTo,
            status: IntakeDocumentStatus.needs_review,
            vehicleId: source?.vehicleId ?? null,
            vehicleMatchStatus:
              (source?.vehicleMatchStatus as IntakeVehicleMatchStatus) ??
              IntakeVehicleMatchStatus.unknown,
            driverId: source?.driverId ?? null,
          };
        }),
      });
    });

    await this.audit.logAction({
      actorUserId: userId,
      action: 'document_intake.resegmented',
      entityType: 'DocumentIntake',
      entityId: intakeId,
      summary: `Posteingang neu aufgeteilt (${ranges.length} Dokumente)`,
      metadata: { intakeId, segmentCount: ranges.length, pageCount: intake.pageCount },
    });

    return this.documentsOf(intakeId);
  }

  /**
   * Tur, alt tur, arac ve surucu duzeltmesi.
   *
   * ARAC KIRACI ICINDE COZULMEK ZORUNDA: istemcinin gonderdigi kimlik baska
   * bir filonun araci olamaz. Ayni sey surucu icin de gecerli.
   */
  async correct(
    userId: string,
    documentId: string,
    input: {
      typeKey?: string;
      subtype?: string | null;
      vehicleId?: string | null;
      driverId?: string | null;
      assignedUserId?: string | null;
    },
  ): Promise<IntakeDocumentView> {
    const row = await this.prisma.intakeDocument.findFirst({
      where: { id: documentId },
      select: { id: true, typeKey: true, routing: { select: { id: true } } },
    });
    if (!row) {
      throw new NotFoundException({ code: 'document_intake_not_found' });
    }
    if (row.routing) {
      throw new ConflictException({ code: 'document_intake_already_routed' });
    }

    const data: Prisma.IntakeDocumentUncheckedUpdateInput = {};

    if (input.typeKey !== undefined) {
      // Registry disi tur KABUL EDILMEZ — istemci yeni bir tur ACAMAZ.
      const definition = resolveDocumentType(input.typeKey);
      data.typeKey = definition.typeKey satisfies DocumentTypeKey;
      // Tur degisti: alt tur artik anlamli olmayabilir.
      if (definition.subtypes === null) {
        data.subtype = null;
      }
    }

    if (input.subtype !== undefined) {
      if (input.subtype !== null && !isKnownInspectionSubtype(input.subtype)) {
        throw new BadRequestException({ code: 'document_intake_unknown_subtype' });
      }
      data.subtype = input.subtype;
    }

    if (input.vehicleId !== undefined) {
      if (input.vehicleId === null) {
        data.vehicleId = null;
        data.vehicleMatchStatus = IntakeVehicleMatchStatus.unknown;
      } else {
        const vehicle = await this.prisma.vehicle.findFirst({
          where: { id: input.vehicleId, deletedAt: null },
          select: { id: true },
        });
        if (!vehicle) {
          throw new BadRequestException({ code: 'document_intake_vehicle_not_found' });
        }
        data.vehicleId = vehicle.id;
        // INSAN SECTI: eslestirme artik dogrulanmis sayilir.
        data.vehicleMatchStatus = IntakeVehicleMatchStatus.verified;
      }
    }

    if (input.driverId !== undefined) {
      if (input.driverId === null) {
        data.driverId = null;
      } else {
        const driver = await this.prisma.driver.findFirst({
          where: { id: input.driverId },
          select: { id: true },
        });
        if (!driver) {
          throw new BadRequestException({ code: 'document_intake_driver_not_found' });
        }
        data.driverId = driver.id;
      }
    }

    if (input.assignedUserId !== undefined) {
      if (input.assignedUserId === null) {
        data.assignedUserId = null;
      } else {
        const user = await this.prisma.user.findFirst({
          where: { id: input.assignedUserId },
          select: { id: true },
        });
        if (!user) {
          throw new BadRequestException({ code: 'document_intake_user_not_found' });
        }
        data.assignedUserId = user.id;
      }
    }

    // Duzeltme belgeyi yeniden incelemeye acar: `needs_domain_review`da
    // takilmis bir belge, eksigi giderilince tekrar karar verilebilir olmali.
    data.status = IntakeDocumentStatus.needs_review;
    data.domainReviewReason = null;

    await this.prisma.intakeDocument.updateMany({ where: { id: documentId }, data });

    await this.audit.logAction({
      actorUserId: userId,
      action: 'document_intake.corrected',
      entityType: 'IntakeDocument',
      entityId: documentId,
      summary: 'Posteingang-Dokument korrigiert',
      // NE DEGISTI, degerleriyle degil ALANLARIYLA.
      metadata: {
        documentId,
        changedFields: Object.keys(input).filter(
          (key) => (input as Record<string, unknown>)[key] !== undefined,
        ),
        typeKeyAfter: data.typeKey ?? row.typeKey,
      },
    });

    const updated = await this.prisma.intakeDocument.findFirst({
      where: { id: documentId },
      select: this.documentSelect,
    });
    return this.view(updated!);
  }

  /** Red — sebep ZORUNLU ve kullaniciya gosterilir. */
  async reject(userId: string, documentId: string, reason: string): Promise<IntakeDocumentView> {
    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      throw new BadRequestException({ code: 'document_intake_rejection_reason_required' });
    }

    const row = await this.prisma.intakeDocument.findFirst({
      where: { id: documentId },
      select: { id: true, routing: { select: { id: true } } },
    });
    if (!row) {
      throw new NotFoundException({ code: 'document_intake_not_found' });
    }
    if (row.routing) {
      throw new ConflictException({ code: 'document_intake_already_routed' });
    }

    const claimed = await this.prisma.intakeDocument.updateMany({
      // Kosullu: yonlendirilmis ya da zaten reddedilmis belge REDDEDILEMEZ.
      where: {
        id: documentId,
        status: { in: [IntakeDocumentStatus.needs_review, IntakeDocumentStatus.needs_domain_review] },
      },
      data: {
        status: IntakeDocumentStatus.rejected,
        rejectionReason: trimmed.slice(0, 500),
        decidedById: userId,
        decidedAt: new Date(),
      },
    });
    if (claimed.count === 0) {
      throw new ConflictException({ code: 'document_intake_not_reviewable' });
    }

    await this.audit.logAction({
      actorUserId: userId,
      action: 'document_intake.rejected',
      entityType: 'IntakeDocument',
      entityId: documentId,
      summary: 'Posteingang-Dokument abgelehnt',
      // RED SEBEBI METNI DENETIME GIRMEZ — serbest metin, uzunlugu yeter.
      metadata: { documentId, reasonLength: trimmed.length },
    });

    await this.settleIntakeOf(documentId);

    const updated = await this.prisma.intakeDocument.findFirst({
      where: { id: documentId },
      select: this.documentSelect,
    });
    return this.view(updated!);
  }

  /**
   * Butun mantiksal belgeler sonuclandiysa fiziksel yuklemeyi kapatir.
   *
   * Kosullu: acik belge kaldiysa durum DEGISMEZ.
   */
  async settleIntakeOf(documentId: string): Promise<void> {
    const row = await this.prisma.intakeDocument.findFirst({
      where: { id: documentId },
      select: { intakeId: true },
    });
    if (!row) return;

    const open = await this.prisma.intakeDocument.count({
      where: {
        intakeId: row.intakeId,
        status: {
          in: [
            IntakeDocumentStatus.classifying,
            IntakeDocumentStatus.needs_review,
            IntakeDocumentStatus.needs_domain_review,
          ],
        },
      },
    });
    if (open > 0) return;

    await this.prisma.documentIntake.updateMany({
      where: { id: row.intakeId },
      data: { status: DocumentIntakeStatus.settled },
    });
  }

  /** Yonlendirme adaptorlerinin ihtiyaci olan ham satir. */
  async loadForRouting(documentId: string) {
    return this.prisma.intakeDocument.findFirst({
      where: { id: documentId },
      select: {
        id: true,
        intakeId: true,
        typeKey: true,
        subtype: true,
        status: true,
        pageFrom: true,
        pageTo: true,
        vehicleId: true,
        vehicleMatchStatus: true,
        driverId: true,
        candidates: true,
        checks: true,
        routing: { select: { id: true } },
        intake: {
          select: {
            id: true,
            pageCount: true,
            artifact: {
              select: { id: true, originalName: true, mimeType: true, fileSize: true },
            },
          },
        },
      },
    });
  }

  candidatesOf(value: Prisma.JsonValue): DocumentCandidates {
    const empty: DocumentCandidates = { plateNumbers: [], vins: [], dates: [], amounts: [] };
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return empty;
    }
    const record = value as Record<string, unknown>;
    const strings = (input: unknown): string[] =>
      Array.isArray(input) ? input.filter((item): item is string => typeof item === 'string') : [];
    const numbers = (input: unknown): number[] =>
      Array.isArray(input) ? input.filter((item): item is number => typeof item === 'number') : [];
    return {
      plateNumbers: strings(record.plateNumbers),
      vins: strings(record.vins),
      dates: strings(record.dates),
      amounts: numbers(record.amounts),
    };
  }
}
