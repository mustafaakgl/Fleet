import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { StorageService } from '../storage/storage.service';

type DocumentOwnerType =
  | 'driver'
  | 'vehicle'
  | 'company'
  | 'request'
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
    private readonly auditService: AuditService,
  ) {}

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
        fileUrl: file.fileUrl ?? this.storageService.buildPublicUrl('documents', file.storedFileName),
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

    const db = this.prisma as any;
    return db.document.findMany({
      where,
      include: {
        uploadedBy: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
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

  async getDocumentsByOwner(ownerType: string, ownerId: string) {
    const normalizedOwnerType = this.ensureOwnerType(ownerType);

    const db = this.prisma as any;
    return db.document.findMany({
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
    return db.document.update({
      where: { id },
      data: payload,
      include: {
        uploadedBy: true,
      },
    });
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

    return replacement.created;
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
            this.storageService.buildPublicUrl('documents', file.storedFileName),
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

    return replacement.created;
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

    return archived;
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
    return db.document.findMany({
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
