import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { safeAuditLog } from '../audit/audit-helper';
import { AuditService } from '../audit/audit.service';
import { DocumentsService } from '../documents/documents.service';
import { DriverNotifyService } from '../notifications/driver-notify.service';
import { OperationalNotifyService } from '../notifications/operational-notify.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  DOCUMENT_UPLOAD_ABSOLUTE_DIR,
  LocalStorageService,
} from '../storage/local-storage.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { CreateEquipmentIssuanceDto } from './dto/create-equipment-issuance.dto';
import { DriverSignEquipmentIssuanceDto } from './dto/driver-sign-equipment-issuance.dto';
import { ApproveEquipmentIssuanceDto } from './dto/approve-equipment-issuance.dto';
import { CancelEquipmentIssuanceDto } from './dto/cancel-equipment-issuance.dto';
import {
  ensureApprovable,
  ensureMutable,
  ensureSignable,
  type EquipmentIssuanceStatus,
} from './equipment-issuance-state.util';

type RequestMeta = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

type UploadedScanFile = {
  originalname: string;
  filename: string;
  mimetype: string;
};

type EquipmentIssuanceItem = {
  name: string;
  quantity: number;
  notes?: string;
};

type EquipmentIssuanceRecordShape = {
  id: string;
  driverId: string;
  issuedById: string;
  title: string;
  items: Prisma.JsonValue;
  formDocumentPath: string;
  status: EquipmentIssuanceStatus;
  issuedAt: Date;
  signedAt: Date | null;
  signatureMethod: string | null;
  signatureImagePath: string | null;
  finalDocumentId: string | null;
  approvedById: string | null;
  approvedAt: Date | null;
  cancelledAt: Date | null;
  clientMeta: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  driver?: {
    id: string;
    firstName: string;
    lastName: string;
    userId: string | null;
  };
  issuedBy?: { id: string; fullName: string; email: string };
  approvedBy?: { id: string; fullName: string; email: string } | null;
  finalDocument?: {
    id: string;
    fileName: string;
    fileUrl: string | null;
    documentType: string;
    createdAt: Date;
  } | null;
};

@Injectable()
export class EquipmentIssuancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly documentsService: DocumentsService,
    private readonly driverNotifyService: DriverNotifyService,
    private readonly operationalNotifyService: OperationalNotifyService,
    private readonly storageService: LocalStorageService,
    private readonly objectStorage: ObjectStorageService,
  ) {}

  private mapDocument(document: {
    id: string;
    fileName: string;
    fileUrl: string | null;
    documentType: string;
    createdAt: Date;
  } | null) {
    if (!document) {
      return null;
    }

    return {
      id: document.id,
      fileName: document.fileName,
      fileUrl: document.fileUrl,
      documentType: document.documentType,
      createdAt: document.createdAt.toISOString(),
      download_url: document.fileUrl
        ? this.storageService.buildDocumentDownloadPath(document.id)
        : null,
    };
  }

  private mapIssuance(
    issuance: EquipmentIssuanceRecordShape,
  ) {
    return {
      id: issuance.id,
      driverId: issuance.driverId,
      issuedById: issuance.issuedById,
      title: issuance.title,
      items: issuance.items,
      formDocumentPath: issuance.formDocumentPath,
      formDownloadUrl: `/driver/equipment-issuances/${issuance.id}/form`,
      status: issuance.status,
      issuedAt: issuance.issuedAt.toISOString(),
      signedAt: issuance.signedAt?.toISOString() ?? null,
      signatureMethod: issuance.signatureMethod,
      signatureImagePath: issuance.signatureImagePath,
      finalDocumentId: issuance.finalDocumentId,
      approvedById: issuance.approvedById,
      approvedAt: issuance.approvedAt?.toISOString() ?? null,
      cancelledAt: issuance.cancelledAt?.toISOString() ?? null,
      clientMeta: issuance.clientMeta,
      createdAt: issuance.createdAt.toISOString(),
      updatedAt: issuance.updatedAt.toISOString(),
      driver: issuance.driver
        ? {
            id: issuance.driver.id,
            firstName: issuance.driver.firstName,
            lastName: issuance.driver.lastName,
            userId: issuance.driver.userId,
          }
        : undefined,
      issuedBy: issuance.issuedBy,
      approvedBy: issuance.approvedBy,
      finalDocument: this.mapDocument(issuance.finalDocument ?? null),
    };
  }

  private parseItems(itemsJson?: string): EquipmentIssuanceItem[] {
    if (!itemsJson?.trim()) {
      return [];
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(itemsJson);
    } catch {
      throw new BadRequestException('itemsJson must be valid JSON');
    }

    if (!Array.isArray(parsed)) {
      throw new BadRequestException('itemsJson must be an array');
    }

    return parsed.map((item, index) => {
      if (!item || typeof item !== 'object') {
        throw new BadRequestException(`Invalid item at index ${index}`);
      }

      const name = typeof (item as { name?: unknown }).name === 'string'
        ? (item as { name: string }).name.trim()
        : '';
      const quantityRaw = (item as { quantity?: unknown }).quantity;
      const notesRaw = (item as { notes?: unknown }).notes;
      const quantity = typeof quantityRaw === 'number' && Number.isInteger(quantityRaw) && quantityRaw > 0
        ? quantityRaw
        : 1;
      if (!name) {
        throw new BadRequestException(`Item name is required at index ${index}`);
      }
      return {
        name,
        quantity,
        notes: typeof notesRaw === 'string' && notesRaw.trim() ? notesRaw.trim() : undefined,
      };
    });
  }

  private decodeSignaturePng(dataUrl: string): Buffer {
    const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
    if (!match) {
      throw new BadRequestException('Signature must be a PNG data URL');
    }

    return Buffer.from(match[1], 'base64');
  }

  private persistDocumentFile(extension: string, body: Buffer): { fileName: string; storedPath: string } {
    const storedFileName = `${Date.now()}-${randomUUID()}${extension}`;
    const absolutePath = join(DOCUMENT_UPLOAD_ABSOLUTE_DIR, storedFileName);
    writeFileSync(absolutePath, body);
    return {
      fileName: storedFileName,
      storedPath: this.storageService.buildStoredPath('documents', storedFileName),
    };
  }

  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  private async buildFinalPdfBuffer(params: {
    issuanceId: string;
    title: string;
    driverName: string;
    formDocumentPath: string;
    issuedAt: Date;
    signedAt: Date;
    items: EquipmentIssuanceItem[];
    signaturePng: Buffer;
  }): Promise<Buffer> {
    const source = await this.objectStorage.openStoredFile(params.formDocumentPath);
    if (!source) {
      throw new NotFoundException('Office form PDF not found');
    }
    const sourceBuffer = await this.streamToBuffer(source.stream);
    const merged = await PDFDocument.create();
    const sourcePdf = await PDFDocument.load(sourceBuffer);
    const copiedPages = await merged.copyPages(sourcePdf, sourcePdf.getPageIndices());
    copiedPages.forEach((page) => merged.addPage(page));

    const page = merged.addPage([595, 842]);
    const font = await merged.embedFont(StandardFonts.Helvetica);
    const bold = await merged.embedFont(StandardFonts.HelveticaBold);
    const signatureImage = await merged.embedPng(params.signaturePng);
    page.drawText('Aushändigungsbestätigung', {
      x: 50,
      y: 780,
      size: 20,
      font: bold,
      color: rgb(0.1, 0.2, 0.35),
    });
    page.drawText(`Titel: ${params.title}`, { x: 50, y: 748, size: 12, font });
    page.drawText(`Tutanak No: ${params.issuanceId}`, { x: 50, y: 728, size: 12, font });
    page.drawText(`Sürücü: ${params.driverName}`, { x: 50, y: 708, size: 12, font });
    page.drawText(`Imza Tarihi: ${params.signedAt.toISOString()}`, { x: 50, y: 688, size: 12, font });
    page.drawText(`Issued At: ${params.issuedAt.toISOString()}`, { x: 50, y: 668, size: 12, font });
    page.drawText('Özet Kalemler:', { x: 50, y: 638, size: 12, font: bold });
    const summaryItems = params.items.length > 0
      ? params.items
      : [{ name: 'Form eki yok', quantity: 1 }];
    summaryItems.slice(0, 12).forEach((item, index) => {
      page.drawText(`- ${item.name} x${item.quantity}${item.notes ? ` (${item.notes})` : ''}`, {
        x: 60,
        y: 616 - index * 18,
        size: 11,
        font,
      });
    });
    page.drawText('İmza:', { x: 50, y: 300, size: 12, font: bold });
    page.drawImage(signatureImage, {
      x: 50,
      y: 120,
      width: 220,
      height: 140,
    });
    return Buffer.from(await merged.save());
  }

  private async createFinalDocument(params: {
    issuanceId: string;
    driverId: string;
    uploadedById?: string;
    fileName: string;
    pdfBuffer: Buffer;
  }) {
    const file = this.persistDocumentFile('.pdf', params.pdfBuffer);
    await this.objectStorage.syncLocalFile(file.storedPath);

    return this.documentsService.createDocument(
      {
        ownerType: 'driver',
        ownerId: params.driverId,
        documentType: 'equipment_issuance_final',
        fileName: params.fileName,
        fileUrl: file.storedPath,
        notes: `equipment_issuance:${params.issuanceId}`,
      },
      params.uploadedById,
    );
  }

  private async getDriverByUserId(userId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
      select: { id: true, firstName: true, lastName: true, userId: true },
    });
    if (!driver) {
      throw new ForbiddenException('Driver account not linked');
    }
    return driver;
  }

  private async getIssuanceRecord(id: string) {
    const issuance = await this.prisma.equipmentIssuance.findUnique({
      where: { id },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true, userId: true } },
        issuedBy: { select: { id: true, fullName: true, email: true } },
        approvedBy: { select: { id: true, fullName: true, email: true } },
        finalDocument: { select: { id: true, fileName: true, fileUrl: true, documentType: true, createdAt: true } },
      },
    });

    if (!issuance) {
      throw new NotFoundException('Equipment issuance not found');
    }

    return issuance;
  }

  async list(filters: { driverId?: string; status?: EquipmentIssuanceStatus }) {
    const rows = await this.prisma.equipmentIssuance.findMany({
      where: {
        driverId: filters.driverId,
        status: filters.status,
      },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true, userId: true } },
        issuedBy: { select: { id: true, fullName: true, email: true } },
        approvedBy: { select: { id: true, fullName: true, email: true } },
        finalDocument: { select: { id: true, fileName: true, fileUrl: true, documentType: true, createdAt: true } },
      },
      orderBy: [{ status: 'asc' }, { issuedAt: 'desc' }],
    });

    return rows.map((row) => this.mapIssuance(row));
  }

  async listForDriver(userId: string) {
    const driver = await this.getDriverByUserId(userId);
    return this.list({ driverId: driver.id });
  }

  async getByIdForDriver(userId: string, issuanceId: string) {
    const driver = await this.getDriverByUserId(userId);
    const issuance = await this.getIssuanceRecord(issuanceId);
    if (issuance.driverId !== driver.id) {
      throw new ForbiddenException('You can only access your own issuance');
    }
    return this.mapIssuance(issuance);
  }

  async getById(id: string) {
    return this.mapIssuance(await this.getIssuanceRecord(id));
  }

  async create(
    dto: CreateEquipmentIssuanceDto,
    file: UploadedScanFile,
    actorUserId: string,
    meta: RequestMeta,
  ) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: dto.driverId },
      select: { id: true, firstName: true, lastName: true, userId: true },
    });
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    if (!file || file.mimetype !== 'application/pdf') {
      throw new BadRequestException('A form PDF is required');
    }

    const parsedItems = this.parseItems(dto.itemsJson);

    const created = await this.prisma.equipmentIssuance.create({
      data: {
        driverId: driver.id,
        issuedById: actorUserId,
        title: dto.title.trim(),
        items: parsedItems,
        formDocumentPath: this.storageService.buildStoredPath('documents', file.filename),
        issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : new Date(),
        clientMeta: {
          created: {
            ipAddress: meta.ipAddress ?? null,
            userAgent: meta.userAgent ?? null,
          },
        },
      },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true, userId: true } },
        issuedBy: { select: { id: true, fullName: true, email: true } },
        approvedBy: { select: { id: true, fullName: true, email: true } },
        finalDocument: { select: { id: true, fileName: true, fileUrl: true, documentType: true, createdAt: true } },
      },
    });

    await this.objectStorage.syncLocalFile(created.formDocumentPath);

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'equipment_issuance.created',
      entityType: 'equipment_issuance',
      entityId: created.id,
      summary: 'Equipment issuance created',
      metadata: {
        driverId: driver.id,
        title: created.title,
        itemCount: parsedItems.length,
      },
    });

    if (driver.userId) {
      await this.driverNotifyService.notifyUser({
        userId: driver.userId,
        key: 'equipment_issuance_created',
        params: {
          count: String(parsedItems.length),
        },
        type: 'system',
        priority: 'high',
        relatedEntityType: 'equipment_issuance',
        relatedEntityId: created.id,
      });
    }

    return this.mapIssuance(created);
  }

  async signByDriver(userId: string, issuanceId: string, dto: DriverSignEquipmentIssuanceDto, meta: RequestMeta) {
    const driver = await this.getDriverByUserId(userId);
    const issuance = await this.getIssuanceRecord(issuanceId);
    if (issuance.driverId !== driver.id) {
      throw new ForbiddenException('You can only sign your own issuance');
    }

    ensureSignable(issuance.status);

    const signaturePng = this.decodeSignaturePng(dto.signatureDataUrl);
    const signatureFile = this.persistDocumentFile('.png', signaturePng);
    await this.objectStorage.syncLocalFile(signatureFile.storedPath);

    const signedAt = new Date();
    const finalPdfBuffer = await this.buildFinalPdfBuffer({
      issuanceId: issuance.id,
      title: issuance.title,
      driverName: `${issuance.driver.firstName} ${issuance.driver.lastName}`.trim(),
      formDocumentPath: issuance.formDocumentPath,
      issuedAt: issuance.issuedAt,
      signedAt,
      items: issuance.items as EquipmentIssuanceItem[],
      signaturePng,
    });
    const finalDocument = await this.createFinalDocument({
      issuanceId: issuance.id,
      driverId: issuance.driverId,
      uploadedById: userId,
      fileName: `${issuance.title}-${issuance.id}.pdf`,
      pdfBuffer: finalPdfBuffer,
    });

    const updated = await this.prisma.equipmentIssuance.update({
      where: { id: issuance.id },
      data: {
        status: 'signed',
        signedAt,
        signatureMethod: 'driver_canvas_png',
        signatureImagePath: signatureFile.storedPath,
        finalDocumentId: finalDocument.id,
        clientMeta: {
          ...(issuance.clientMeta && typeof issuance.clientMeta === 'object' ? issuance.clientMeta : {}),
          signed: {
            ipAddress: meta.ipAddress ?? null,
            userAgent: meta.userAgent ?? null,
          },
        },
      },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true, userId: true } },
        issuedBy: { select: { id: true, fullName: true, email: true } },
        approvedBy: { select: { id: true, fullName: true, email: true } },
        finalDocument: { select: { id: true, fileName: true, fileUrl: true, documentType: true, createdAt: true } },
      },
    });

    await safeAuditLog(this.auditService, {
      actorUserId: userId,
      action: 'equipment_issuance.signed',
      entityType: 'equipment_issuance',
      entityId: updated.id,
      summary: 'Equipment issuance signed by driver',
      metadata: {
        ipAddress: meta.ipAddress ?? null,
        userAgent: meta.userAgent ?? null,
      },
    });

    await this.operationalNotifyService.notifyOperationalUsers({
      key: 'equipment_issuance_pending_approval',
      params: {
        driverName: `${issuance.driver.firstName} ${issuance.driver.lastName}`.trim(),
        count: String((issuance.items as EquipmentIssuanceItem[]).length),
      },
      type: 'document',
      priority: 'high',
      relatedEntityType: 'equipment_issuance',
      relatedEntityId: issuance.id,
    });

    return this.mapIssuance(updated);
  }

  async manualUpload(
    issuanceId: string,
    file: UploadedScanFile,
    actorUserId: string,
    meta: RequestMeta,
  ) {
    const issuance = await this.getIssuanceRecord(issuanceId);
    ensureMutable(issuance.status);
    if (issuance.status !== 'pending_signature') {
      throw new BadRequestException('Manual upload is only allowed before approval');
    }

    const storedPath = this.storageService.buildStoredPath('documents', file.filename);
    await this.objectStorage.syncLocalFile(storedPath);
    const finalDocument = await this.documentsService.createUploadedDocument(
      {
        ownerType: 'driver',
        ownerId: issuance.driverId,
        documentType: 'equipment_issuance_final',
        notes: `equipment_issuance:${issuance.id}`,
      },
      {
        originalName: file.originalname,
        storedFileName: file.filename,
        fileUrl: storedPath,
      },
      actorUserId,
    );

    const updated = await this.prisma.equipmentIssuance.update({
      where: { id: issuance.id },
      data: {
        status: 'manual_uploaded',
        finalDocumentId: finalDocument.id,
        signatureMethod: 'manual_upload',
        clientMeta: {
          ...(issuance.clientMeta && typeof issuance.clientMeta === 'object' ? issuance.clientMeta : {}),
          manualUpload: {
            ipAddress: meta.ipAddress ?? null,
            userAgent: meta.userAgent ?? null,
          },
        },
      },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true, userId: true } },
        issuedBy: { select: { id: true, fullName: true, email: true } },
        approvedBy: { select: { id: true, fullName: true, email: true } },
        finalDocument: { select: { id: true, fileName: true, fileUrl: true, documentType: true, createdAt: true } },
      },
    });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'equipment_issuance.manual_uploaded',
      entityType: 'equipment_issuance',
      entityId: updated.id,
      summary: 'Equipment issuance scan uploaded',
    });

    await this.operationalNotifyService.notifyOperationalUsers({
      key: 'equipment_issuance_pending_approval',
      params: {
        driverName: `${issuance.driver.firstName} ${issuance.driver.lastName}`.trim(),
        count: String((issuance.items as EquipmentIssuanceItem[]).length),
      },
      type: 'document',
      priority: 'high',
      relatedEntityType: 'equipment_issuance',
      relatedEntityId: issuance.id,
      excludeUserId: actorUserId,
    });

    return this.mapIssuance(updated);
  }

  async approve(
    issuanceId: string,
    dto: ApproveEquipmentIssuanceDto,
    actorUserId: string,
    meta: RequestMeta,
  ) {
    const issuance = await this.getIssuanceRecord(issuanceId);
    ensureApprovable(issuance.status);

    const updated = await this.prisma.equipmentIssuance.update({
      where: { id: issuance.id },
      data: {
        status: 'approved',
        approvedById: actorUserId,
        approvedAt: new Date(),
        clientMeta: {
          ...(issuance.clientMeta && typeof issuance.clientMeta === 'object' ? issuance.clientMeta : {}),
          approved: {
            note: dto.note?.trim() || null,
            ipAddress: meta.ipAddress ?? null,
            userAgent: meta.userAgent ?? null,
          },
        },
      },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true, userId: true } },
        issuedBy: { select: { id: true, fullName: true, email: true } },
        approvedBy: { select: { id: true, fullName: true, email: true } },
        finalDocument: { select: { id: true, fileName: true, fileUrl: true, documentType: true, createdAt: true } },
      },
    });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'equipment_issuance.approved',
      entityType: 'equipment_issuance',
      entityId: updated.id,
      summary: 'Equipment issuance approved by office',
    });

    if (issuance.driver.userId) {
      await this.driverNotifyService.notifyUser({
        userId: issuance.driver.userId,
        key: 'equipment_issuance_approved',
        type: 'system',
        priority: 'medium',
        relatedEntityType: 'equipment_issuance',
        relatedEntityId: issuance.id,
      });
    }

    return this.mapIssuance(updated);
  }

  async cancel(
    issuanceId: string,
    dto: CancelEquipmentIssuanceDto,
    actorUserId: string,
    meta: RequestMeta,
  ) {
    const issuance = await this.getIssuanceRecord(issuanceId);
    ensureMutable(issuance.status);

    const updated = await this.prisma.equipmentIssuance.update({
      where: { id: issuance.id },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        clientMeta: {
          ...(issuance.clientMeta && typeof issuance.clientMeta === 'object' ? issuance.clientMeta : {}),
          cancelled: {
            reason: dto.reason?.trim() || null,
            ipAddress: meta.ipAddress ?? null,
            userAgent: meta.userAgent ?? null,
          },
        },
      },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true, userId: true } },
        issuedBy: { select: { id: true, fullName: true, email: true } },
        approvedBy: { select: { id: true, fullName: true, email: true } },
        finalDocument: { select: { id: true, fileName: true, fileUrl: true, documentType: true, createdAt: true } },
      },
    });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'equipment_issuance.cancelled',
      entityType: 'equipment_issuance',
      entityId: updated.id,
      summary: 'Equipment issuance cancelled',
      metadata: {
        reason: dto.reason?.trim() || null,
      },
    });

    return this.mapIssuance(updated);
  }

  async downloadForm(id: string): Promise<{ stream: Readable; fileName: string; mimeType: string }> {
    const issuance = await this.getIssuanceRecord(id);
    const opened = await this.objectStorage.openStoredFile(issuance.formDocumentPath);
    if (!opened) {
      throw new NotFoundException('Form PDF not found');
    }
    return {
      stream: opened.stream,
      fileName: `${issuance.title}.pdf`,
      mimeType: opened.contentType ?? 'application/pdf',
    };
  }

  async downloadFormForDriver(
    userId: string,
    issuanceId: string,
  ): Promise<{ stream: Readable; fileName: string; mimeType: string }> {
    const driver = await this.getDriverByUserId(userId);
    const issuance = await this.getIssuanceRecord(issuanceId);
    if (issuance.driverId !== driver.id) {
      throw new ForbiddenException('You can only access your own issuance');
    }
    return this.downloadForm(issuanceId);
  }
}