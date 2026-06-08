import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { existsSync } from 'node:fs';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { OPERATIONAL_ROLES, type UserRole } from '../common/utils/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { mimeTypeFromFileName } from '../storage/file-path.util';
import { ObjectStorageService } from '../storage/object-storage.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { StorageService } from '../storage/storage.service';
import type { Readable } from 'node:stream';

type DocumentOwnerType =
  | 'driver'
  | 'vehicle'
  | 'company'
  | 'request'
  | 'transport_request'
  | 'accident'
  | 'cargo_damage'
  | 'vehicle_handover'
  | 'assignment'
  | 'service_record';

type DocumentStatus = 'valid' | 'expiring_soon' | 'expired' | 'missing' | 'archived';

const DOCUMENT_OWNER_TYPES: DocumentOwnerType[] = [
  'driver',
  'vehicle',
  'company',
  'request',
  'transport_request',
  'accident',
  'cargo_damage',
  'vehicle_handover',
  'assignment',
  'service_record',
];

const DOCUMENT_STATUSES: DocumentStatus[] = ['valid', 'expiring_soon', 'expired', 'missing', 'archived'];

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly objectStorage: ObjectStorageService,
    private readonly auditService: AuditService,
  ) {}

  mapDocumentToClient(document: Record<string, unknown>) {
    const id = String(document.id);
    const hasFile = Boolean(document.fileUrl);
    const { fileUrl: _fileUrl, ...rest } = document;

    return {
      ...rest,
      download_url: hasFile ? this.storageService.buildDocumentDownloadPath(id) : null,
    };
  }

  private mapDocumentsToClient(documents: Record<string, unknown>[]) {
    return documents.map((document) => this.mapDocumentToClient(document));
  }

  async assertCanDownloadDocument(
    document: {
      ownerType: string;
      ownerId: string;
      fileUrl: string | null;
      documentType?: string;
    },
    actor: { userId: string; role: string },
  ): Promise<void> {
    if (!document.fileUrl) {
      throw new NotFoundException('Document has no file');
    }

    if (OPERATIONAL_ROLES.includes(actor.role as UserRole)) {
      return;
    }

    if (actor.role === 'customer') {
      if (document.ownerType === 'assignment' && document.documentType === 'delivery_proof') {
        const membership = await this.prisma.companyUser.findFirst({
          where: {
            userId: actor.userId,
            company: {
              assignments: {
                some: { id: document.ownerId },
              },
            },
          },
          select: { id: true },
        });
        if (membership) {
          return;
        }
      }
      throw new ForbiddenException('You do not have access to this document');
    }

    if (actor.role !== 'driver') {
      throw new ForbiddenException('You do not have access to this document');
    }

    const driver = await this.prisma.driver.findUnique({
      where: { userId: actor.userId },
      select: { id: true },
    });
    if (!driver) {
      throw new ForbiddenException('You do not have access to this document');
    }

    if (document.ownerType === 'driver' && document.ownerId === driver.id) {
      return;
    }

    if (document.ownerType === 'vehicle_handover') {
      const handover = await this.prisma.vehicleHandover.findUnique({
        where: { id: document.ownerId },
        select: { driverId: true },
      });
      if (handover?.driverId === driver.id) {
        return;
      }
    }

    if (document.ownerType === 'request') {
      const request = await this.prisma.request.findUnique({
        where: { id: document.ownerId },
        select: { driverId: true },
      });
      if (request?.driverId === driver.id) {
        return;
      }
    }

    if (document.ownerType === 'transport_request') {
      const transportRequest = await this.prisma.transportRequest.findUnique({
        where: { id: document.ownerId },
        select: { driverId: true },
      });
      if (transportRequest?.driverId === driver.id) {
        return;
      }
    }

    if (document.ownerType === 'accident') {
      const accident = await this.prisma.accident.findUnique({
        where: { id: document.ownerId },
        select: { driverId: true },
      });
      if (accident?.driverId === driver.id) {
        return;
      }
    }

    throw new ForbiddenException('You do not have access to this document');
  }

  async recordDocumentDownload(documentId: string, actorUserId?: string) {
    await this.safeAuditLog({
      actorUserId,
      action: 'document.download',
      entityType: 'document',
      entityId: documentId,
      summary: 'Document file downloaded',
    });
  }

  async resolveDocumentDownload(
    id: string,
    actor: { userId: string; role: string },
  ): Promise<{ stream: Readable; fileName: string; mimeType: string }> {
    const document = await this.getDocumentById(id);
    await this.assertCanDownloadDocument(document, actor);

    if (!document.fileUrl) {
      throw new NotFoundException('Document file not found');
    }

    const opened = await this.objectStorage.openStoredFile(document.fileUrl);
    if (!opened) {
      throw new NotFoundException('Document file not found');
    }

    return {
      stream: opened.stream,
      fileName: document.fileName,
      mimeType: opened.contentType ?? mimeTypeFromFileName(document.fileName),
    };
  }

  async syncUploadedFile(fileUrl: string | null | undefined): Promise<void> {
    if (!fileUrl) return;
    await this.objectStorage.syncLocalFile(fileUrl);
  }

  private async safeAuditLog(params: {
    actorUserId?: string;
    action: string;
    entityType: string;
    entityId?: string;
    summary?: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    try {
      await this.auditService.logAction(params);
    } catch (error) {
      console.warn('Audit log failed:', error);
    }
  }

  private parseDateInput(value?: string | null): Date | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Invalid date value');
    }

    return parsed;
  }

  private ensureOwnerType(value: string): DocumentOwnerType {
    if (!DOCUMENT_OWNER_TYPES.includes(value as DocumentOwnerType)) {
      throw new BadRequestException('Invalid ownerType');
    }

    return value as DocumentOwnerType;
  }

  private ensureStatus(value: string): DocumentStatus {
    if (!DOCUMENT_STATUSES.includes(value as DocumentStatus)) {
      throw new BadRequestException('Invalid document status');
    }

    return value as DocumentStatus;
  }

  getDocumentStatus(expiryDate?: Date | null): DocumentStatus {
    if (!expiryDate) {
      return 'valid';
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiry = new Date(expiryDate);
    expiry.setHours(0, 0, 0, 0);

    if (expiry < today) {
      return 'expired';
    }

    const warningDate = new Date(today);
    warningDate.setDate(warningDate.getDate() + 90);

    if (expiry <= warningDate) {
      return 'expiring_soon';
    }

    return 'valid';
  }

  async createDocument(dto: CreateDocumentDto, uploadedById?: string) {
    if (uploadedById) {
      const user = await this.prisma.user.findUnique({ where: { id: uploadedById }, select: { id: true } });
      if (!user) {
        throw new NotFoundException('Uploaded by user not found');
      }
    }

    if (!dto.ownerType || !dto.ownerId || !dto.documentType || !dto.fileName) {
      throw new BadRequestException('ownerType, ownerId, documentType and fileName are required');
    }

    const ownerType = this.ensureOwnerType(dto.ownerType);
    const expiryDate = this.parseDateInput(dto.expiryDate);
    const status = this.getDocumentStatus(expiryDate);

    const db = this.prisma as any;
    const created = await db.document.create({
      data: {
        ownerType,
        ownerId: dto.ownerId,
        documentType: dto.documentType,
        fileName: dto.fileName,
        fileUrl: dto.fileUrl ?? null,
        expiryDate,
        status,
        notes: dto.notes ?? null,
        uploadedById: uploadedById ?? null,
      },
      include: {
        uploadedBy: true,
      },
    });

    await this.safeAuditLog({
      actorUserId: uploadedById,
      action: 'document.created',
      entityType: 'document',
      entityId: created.id,
      summary: 'Document created',
      metadata: {
        ownerType: created.ownerType,
        ownerId: created.ownerId,
        documentType: created.documentType,
        status: created.status,
      },
    });

    return created;
  }

  async createUploadedDocument(
    dto: {
      ownerType: string;
      ownerId: string;
      documentType: string;
      expiryDate?: string;
      notes?: string;
    },
    file: {
      originalName: string;
      storedFileName: string;
      fileUrl?: string;
    },
    uploadedById?: string,
  ) {
    if (!file.storedFileName || !file.originalName) {
      throw new BadRequestException('file is required');
    }

    const created = await this.createDocument(
      {
        ownerType: dto.ownerType as CreateDocumentDto['ownerType'],
        ownerId: dto.ownerId,
        documentType: dto.documentType,
        expiryDate: dto.expiryDate,
        notes: dto.notes,
        fileName: file.originalName,
        fileUrl: file.fileUrl ?? this.storageService.buildStoredPath('documents', file.storedFileName),
      },
      uploadedById,
    );

    await this.safeAuditLog({
      actorUserId: uploadedById,
      action: 'document.uploaded',
      entityType: 'document',
      entityId: created.id,
      summary: 'Document uploaded',
      metadata: {
        ownerType: created.ownerType,
        ownerId: created.ownerId,
        documentType: created.documentType,
      },
    });

    return created;
  }

  async listDocuments(filters: {
    ownerType?: string;
    ownerId?: string;
    status?: string;
    documentType?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const where: Record<string, unknown> = {};

    if (filters.ownerType) {
      where.ownerType = this.ensureOwnerType(filters.ownerType);
    }

    if (filters.ownerId) {
      where.ownerId = filters.ownerId;
    }

    if (filters.status) {
      where.status = this.ensureStatus(filters.status);
    }

    if (filters.documentType) {
      where.documentType = filters.documentType;
    }

    if (filters.search) {
      where.OR = [
        { fileName: { contains: filters.search, mode: 'insensitive' } },
        { documentType: { contains: filters.search, mode: 'insensitive' } },
        { notes: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const usePagination =
      Number.isFinite(filters.page) || Number.isFinite(filters.limit);
    const page = usePagination ? Math.max(1, filters.page ?? 1) : 1;
    const limit = usePagination
      ? Math.min(500, Math.max(1, filters.limit ?? 100))
      : undefined;

    const db = this.prisma as any;
    const [total, rows] = await Promise.all([
      usePagination ? db.document.count({ where }) : Promise.resolve(0),
      db.document.findMany({
        where,
        include: {
          uploadedBy: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        ...(usePagination ? { skip: (page - 1) * (limit ?? 100), take: limit } : {}),
      }),
    ]);

    const data = this.mapDocumentsToClient(rows);
    if (!usePagination) {
      return data;
    }

    return {
      data,
      total,
      page,
      limit: limit ?? 100,
      pages: Math.ceil(total / (limit ?? 100)),
    };
  }

  async getDocumentById(id: string) {
    const db = this.prisma as any;
    const document = await db.document.findUnique({
      where: { id },
      include: {
        uploadedBy: true,
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    return document;
  }

  async getDocumentByIdForClient(id: string) {
    const document = await this.getDocumentById(id);
    return this.mapDocumentToClient(document);
  }

  async getDocumentsByOwner(ownerType: string, ownerId: string) {
    const normalizedOwnerType = this.ensureOwnerType(ownerType);

    const db = this.prisma as any;
    const rows = await db.document.findMany({
      where: {
        ownerType: normalizedOwnerType,
        ownerId,
      },
      include: {
        uploadedBy: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    return this.mapDocumentsToClient(rows);
  }

  async updateDocument(id: string, dto: UpdateDocumentDto) {
    await this.getDocumentById(id);

    const payload: Record<string, unknown> = {};

    if (dto.documentType !== undefined) {
      payload.documentType = dto.documentType;
    }

    if (dto.fileName !== undefined) {
      payload.fileName = dto.fileName;
    }

    if (dto.fileUrl !== undefined) {
      payload.fileUrl = dto.fileUrl;
    }

    if (dto.notes !== undefined) {
      payload.notes = dto.notes;
    }

    const expiryDate = this.parseDateInput(dto.expiryDate);
    if (dto.expiryDate !== undefined) {
      payload.expiryDate = expiryDate;
    }

    if (dto.status !== undefined) {
      payload.status = this.ensureStatus(dto.status);
    } else if (dto.expiryDate !== undefined) {
      payload.status = this.getDocumentStatus(expiryDate);
    }

    const db = this.prisma as any;
    const updated = await db.document.update({
      where: { id },
      data: payload,
      include: {
        uploadedBy: true,
      },
    });
    return this.mapDocumentToClient(updated);
  }

  async replaceDocument(id: string, dto: UpdateDocumentDto, uploadedById?: string) {
    const replacement = await this.prisma.$transaction(async (tx) => {
      const db = tx as any;
      const oldDocument = await db.document.findUnique({
        where: { id },
      });

      if (!oldDocument) {
        throw new NotFoundException('Document not found');
      }

      if (uploadedById) {
        const user = await db.user.findUnique({ where: { id: uploadedById }, select: { id: true } });
        if (!user) {
          throw new NotFoundException('Uploaded by user not found');
        }
      }

      const archived = await db.document.update({
        where: { id: oldDocument.id },
        data: {
          status: 'archived',
        },
      });

      const expiryDate = this.parseDateInput(dto.expiryDate);
      const status = dto.status ? this.ensureStatus(dto.status) : this.getDocumentStatus(expiryDate);

      const created = await db.document.create({
        data: {
          ownerType: oldDocument.ownerType,
          ownerId: oldDocument.ownerId,
          documentType: dto.documentType ?? oldDocument.documentType,
          fileName: dto.fileName ?? oldDocument.fileName,
          fileUrl: dto.fileUrl ?? oldDocument.fileUrl,
          expiryDate,
          status,
          notes: dto.notes ?? oldDocument.notes,
          uploadedById: uploadedById ?? oldDocument.uploadedById,
        },
        include: {
          uploadedBy: true,
        },
      });

      return { archived, created };
    });

    await this.safeAuditLog({
      actorUserId: uploadedById,
      action: 'document.archived',
      entityType: 'document',
      entityId: replacement.archived.id,
      summary: 'Document archived during replacement',
      metadata: {
        ownerType: replacement.archived.ownerType,
        ownerId: replacement.archived.ownerId,
      },
    });
    await this.safeAuditLog({
      actorUserId: uploadedById,
      action: 'document.replaced',
      entityType: 'document',
      entityId: replacement.created.id,
      summary: 'Document replaced',
      metadata: {
        replacedDocumentId: id,
        ownerType: replacement.created.ownerType,
        ownerId: replacement.created.ownerId,
      },
    });

    return this.mapDocumentToClient(replacement.created);
  }

  async replaceDocumentWithUpload(
    id: string,
    dto: {
      documentType?: string;
      expiryDate?: string;
      notes?: string;
    },
    file: {
      originalName: string;
      storedFileName: string;
      fileUrl?: string;
    },
    uploadedById?: string,
  ) {
    const replacement = await this.prisma.$transaction(async (tx) => {
      const db = tx as any;
      const oldDocument = await db.document.findUnique({
        where: { id },
      });

      if (!oldDocument) {
        throw new NotFoundException('Document not found');
      }

      if (!file.storedFileName || !file.originalName) {
        throw new BadRequestException('file is required');
      }

      if (uploadedById) {
        const user = await db.user.findUnique({ where: { id: uploadedById }, select: { id: true } });
        if (!user) {
          throw new NotFoundException('Uploaded by user not found');
        }
      }

      const archived = await db.document.update({
        where: { id: oldDocument.id },
        data: {
          status: 'archived',
        },
      });

      const expiryDate =
        dto.expiryDate !== undefined
          ? this.parseDateInput(dto.expiryDate)
          : oldDocument.expiryDate;
      const status = this.getDocumentStatus(expiryDate);

      const created = await db.document.create({
        data: {
          ownerType: oldDocument.ownerType,
          ownerId: oldDocument.ownerId,
          documentType: dto.documentType ?? oldDocument.documentType,
          fileName: file.originalName,
          fileUrl:
            file.fileUrl ??
            this.storageService.buildStoredPath('documents', file.storedFileName),
          expiryDate,
          status,
          notes: dto.notes ?? oldDocument.notes,
          uploadedById: uploadedById ?? oldDocument.uploadedById,
        },
        include: {
          uploadedBy: true,
        },
      });

      return { archived, created };
    });

    await this.safeAuditLog({
      actorUserId: uploadedById,
      action: 'document.archived',
      entityType: 'document',
      entityId: replacement.archived.id,
      summary: 'Document archived during upload replacement',
      metadata: {
        ownerType: replacement.archived.ownerType,
        ownerId: replacement.archived.ownerId,
      },
    });
    await this.safeAuditLog({
      actorUserId: uploadedById,
      action: 'document.replaced',
      entityType: 'document',
      entityId: replacement.created.id,
      summary: 'Document replaced via upload',
      metadata: {
        replacedDocumentId: id,
        ownerType: replacement.created.ownerType,
        ownerId: replacement.created.ownerId,
      },
    });
    await this.safeAuditLog({
      actorUserId: uploadedById,
      action: 'document.uploaded',
      entityType: 'document',
      entityId: replacement.created.id,
      summary: 'Replacement document uploaded',
      metadata: {
        ownerType: replacement.created.ownerType,
        ownerId: replacement.created.ownerId,
      },
    });

    return this.mapDocumentToClient(replacement.created);
  }

  async deleteDocument(id: string, actorUserId?: string) {
    const db = this.prisma as any;
    const existing = await db.document.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Document not found');
    }

    const archived = await db.document.update({
      where: { id },
      data: {
        status: 'archived',
      },
    });

    await this.safeAuditLog({
      actorUserId,
      action: 'document.archived',
      entityType: 'document',
      entityId: archived.id,
      summary: 'Document archived',
      metadata: {
        ownerType: archived.ownerType,
        ownerId: archived.ownerId,
      },
    });

    return this.mapDocumentToClient(archived);
  }

  async getExpiringDocuments(days = 90) {
    if (!Number.isFinite(days) || days < 0) {
      throw new BadRequestException('days must be a non-negative number');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const threshold = new Date(today);
    threshold.setDate(threshold.getDate() + days);

    const db = this.prisma as any;
    const rows = await db.document.findMany({
      where: {
        OR: [
          {
            status: 'expired',
          },
          {
            expiryDate: {
              not: null,
              gte: today,
              lte: threshold,
            },
          },
        ],
      },
      include: {
        uploadedBy: true,
      },
      orderBy: {
        expiryDate: 'asc',
      },
    });
    return this.mapDocumentsToClient(rows);
  }

  async getMissingRequiredDocuments() {
    const REQUIRED_BY_OWNER: Record<string, string[]> = {
      driver: ['Driving License', 'Passport'],
      vehicle: ['TUV', 'SP', 'Registration', 'Insurance'],
    };

    const db = this.prisma as any;
    const drivers = await db.driver.findMany({
      where: { status: { not: 'terminated' } },
      select: { id: true, firstName: true, lastName: true },
    });
    const vehicles = await db.vehicle.findMany({
      where: { status: { not: 'inactive' } },
      select: { id: true, plateNumber: true },
    });
    const documents = await db.document.findMany({
      where: {
        OR: [
          { ownerType: 'driver' },
          { ownerType: 'vehicle' },
        ],
        status: { not: 'archived' },
      },
      select: { ownerType: true, ownerId: true, documentType: true },
    });

    const docSet = new Set<string>();
    for (const d of documents) {
      docSet.add(`${d.ownerType}:${d.ownerId}:${d.documentType}`);
    }

    type MissingRow = {
      owner_type: 'driver' | 'vehicle';
      owner_id: string;
      owner_name: string;
      document_type: string;
    };
    const missing: MissingRow[] = [];

    for (const drv of drivers) {
      for (const docType of REQUIRED_BY_OWNER.driver) {
        if (!docSet.has(`driver:${drv.id}:${docType}`)) {
          missing.push({
            owner_type: 'driver',
            owner_id: drv.id,
            owner_name: `${drv.firstName} ${drv.lastName}`,
            document_type: docType,
          });
        }
      }
    }
    for (const veh of vehicles) {
      for (const docType of REQUIRED_BY_OWNER.vehicle) {
        if (!docSet.has(`vehicle:${veh.id}:${docType}`)) {
          missing.push({
            owner_type: 'vehicle',
            owner_id: veh.id,
            owner_name: veh.plateNumber,
            document_type: docType,
          });
        }
      }
    }

    return missing;
  }
}
