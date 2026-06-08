import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AssignmentStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { DocumentsService } from '../documents/documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

export const CUSTOMER_PROOF_DOCUMENT_TYPE = 'delivery_proof';

const UPLOADABLE_STATUSES: AssignmentStatus[] = [
  AssignmentStatus.confirmed,
  AssignmentStatus.in_progress,
  AssignmentStatus.completed,
];

@Injectable()
export class CustomerProofsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentsService: DocumentsService,
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

  private async assertAssignmentAccess(assignmentId: string, companyIds: string[]) {
    const assignment = await this.prisma.assignment.findFirst({
      where: {
        id: assignmentId,
        companyId: { in: companyIds },
      },
      select: {
        id: true,
        status: true,
        companyId: true,
      },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    return assignment;
  }

  async listProofs(assignmentId: string, companyIds: string[], actorUserId: string) {
    await this.assertAssignmentAccess(assignmentId, companyIds);

    const documents = await this.prisma.document.findMany({
      where: {
        ownerType: 'assignment',
        ownerId: assignmentId,
        documentType: CUSTOMER_PROOF_DOCUMENT_TYPE,
      },
      orderBy: { createdAt: 'desc' },
    });

    await this.safeAuditLog({
      actorUserId,
      action: 'customer.proofs_listed',
      entityType: 'assignment',
      entityId: assignmentId,
      summary: 'Customer delivery proofs listed',
    });

    return documents.map((document) => this.mapProofDocument(document, assignmentId));
  }

  private mapProofDocument(document: Record<string, unknown>, assignmentId: string) {
    const client = this.documentsService.mapDocumentToClient(document) as Record<string, unknown>;
    if (client.download_url) {
      client.download_url = `/customer/assignments/${assignmentId}/proofs/${client.id}/download`;
    }
    if (!client.uploadedAt && client.createdAt) {
      client.uploadedAt =
        client.createdAt instanceof Date
          ? client.createdAt.toISOString()
          : String(client.createdAt);
    }
    return client;
  }

  async uploadProof(
    assignmentId: string,
    companyIds: string[],
    actorUserId: string,
    file: { originalname: string; filename: string },
    notes?: string,
  ) {
    const assignment = await this.assertAssignmentAccess(assignmentId, companyIds);

    if (!UPLOADABLE_STATUSES.includes(assignment.status)) {
      throw new BadRequestException(
        'Proofs can only be uploaded for confirmed, in-progress, or completed assignments',
      );
    }

    const fileUrl = this.storageService.buildStoredPath('documents', file.filename);
    const created = await this.documentsService.createUploadedDocument(
      {
        ownerType: 'assignment',
        ownerId: assignmentId,
        documentType: CUSTOMER_PROOF_DOCUMENT_TYPE,
        notes,
      },
      {
        originalName: file.originalname,
        storedFileName: file.filename,
        fileUrl,
      },
      actorUserId,
    );
    await this.documentsService.syncUploadedFile(fileUrl);

    await this.safeAuditLog({
      actorUserId,
      action: 'customer.proof_uploaded',
      entityType: 'document',
      entityId: created.id,
      summary: 'Customer delivery proof uploaded',
      metadata: {
        assignmentId,
        companyId: assignment.companyId,
        fileName: file.originalname,
      },
    });

    return this.mapProofDocument(created, assignmentId);
  }

  async downloadProof(
    assignmentId: string,
    documentId: string,
    companyIds: string[],
    actorUserId: string,
  ) {
    await this.assertAssignmentAccess(assignmentId, companyIds);

    const document = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        ownerType: 'assignment',
        ownerId: assignmentId,
        documentType: CUSTOMER_PROOF_DOCUMENT_TYPE,
      },
    });

    if (!document?.fileUrl) {
      throw new NotFoundException('Proof document not found');
    }

    const opened = await this.documentsService.resolveDocumentDownload(documentId, {
      userId: actorUserId,
      role: 'customer',
    });

    await this.safeAuditLog({
      actorUserId,
      action: 'customer.proof_downloaded',
      entityType: 'document',
      entityId: documentId,
      summary: 'Customer delivery proof downloaded',
      metadata: { assignmentId },
    });

    return opened;
  }

  async countPendingProofs(companyIds: string[]): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);

    const completedAssignments = await this.prisma.assignment.findMany({
      where: {
        companyId: { in: companyIds },
        status: AssignmentStatus.completed,
        workDate: { gte: cutoff },
      },
      select: { id: true },
    });

    if (completedAssignments.length === 0) {
      return 0;
    }

    const assignmentIds = completedAssignments.map((row) => row.id);
    const proofCounts = await this.prisma.document.groupBy({
      by: ['ownerId'],
      where: {
        ownerType: 'assignment',
        ownerId: { in: assignmentIds },
        documentType: CUSTOMER_PROOF_DOCUMENT_TYPE,
        fileUrl: { not: null },
      },
      _count: { _all: true },
    });

    const withProof = new Set(proofCounts.map((row) => row.ownerId));
    return assignmentIds.filter((id) => !withProof.has(id)).length;
  }
}
