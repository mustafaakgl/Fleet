import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

export type CustomerAssignmentMessageDto = {
  id: string;
  assignmentId: string;
  body: string;
  senderUserId: string;
  senderName: string;
  senderRole: string;
  isFromCustomer: boolean;
  createdAt: string;
};

@Injectable()
export class CustomerMessagesService {
  constructor(
    private readonly prisma: PrismaService,
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

  private mapMessage(row: {
    id: string;
    assignmentId: string;
    body: string;
    senderUserId: string;
    createdAt: Date;
    sender: { fullName: string; role: string };
  }): CustomerAssignmentMessageDto {
    return {
      id: row.id,
      assignmentId: row.assignmentId,
      body: row.body,
      senderUserId: row.senderUserId,
      senderName: row.sender.role === 'customer' ? row.sender.fullName : 'Fleet Team',
      senderRole: row.sender.role,
      isFromCustomer: row.sender.role === 'customer',
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async assertAssignmentInCompanies(assignmentId: string, companyIds: string[]) {
    const assignment = await this.prisma.assignment.findFirst({
      where: {
        id: assignmentId,
        companyId: { in: companyIds },
      },
      select: { id: true, companyId: true },
    });
    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }
    return assignment;
  }

  async listForCustomer(
    assignmentId: string,
    companyIds: string[],
    actorUserId: string,
  ): Promise<CustomerAssignmentMessageDto[]> {
    await this.assertAssignmentInCompanies(assignmentId, companyIds);

    const rows = await this.prisma.customerAssignmentMessage.findMany({
      where: { assignmentId },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: { select: { fullName: true, role: true } },
      },
    });

    await this.safeAuditLog({
      actorUserId,
      action: 'customer.messages_listed',
      entityType: 'assignment',
      entityId: assignmentId,
      summary: 'Customer assignment messages listed',
    });

    return rows.map((row) => this.mapMessage(row));
  }

  async sendFromCustomer(
    assignmentId: string,
    companyIds: string[],
    actorUserId: string,
    body: string,
  ): Promise<CustomerAssignmentMessageDto> {
    const trimmed = body.trim();
    if (trimmed.length < 1 || trimmed.length > 4000) {
      throw new BadRequestException('Message must be between 1 and 4000 characters');
    }

    const assignment = await this.assertAssignmentInCompanies(assignmentId, companyIds);

    const created = await this.prisma.customerAssignmentMessage.create({
      data: {
        assignmentId,
        senderUserId: actorUserId,
        body: trimmed,
      },
      include: {
        sender: { select: { fullName: true, role: true } },
      },
    });

    await this.safeAuditLog({
      actorUserId,
      action: 'customer.message_sent',
      entityType: 'assignment',
      entityId: assignmentId,
      summary: 'Customer assignment message sent',
      metadata: { companyId: assignment.companyId, messageId: created.id },
    });

    return this.mapMessage(created);
  }

  async listForFleet(assignmentId: string, actorUserId: string): Promise<CustomerAssignmentMessageDto[]> {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      select: { id: true },
    });
    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    const rows = await this.prisma.customerAssignmentMessage.findMany({
      where: { assignmentId },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: { select: { fullName: true, role: true } },
      },
    });

    await this.safeAuditLog({
      actorUserId,
      action: 'assignment.customer_messages_listed',
      entityType: 'assignment',
      entityId: assignmentId,
      summary: 'Fleet viewed customer assignment messages',
    });

    return rows.map((row) => this.mapMessage(row));
  }

  async sendFromFleet(
    assignmentId: string,
    actorUserId: string,
    body: string,
  ): Promise<CustomerAssignmentMessageDto> {
    const trimmed = body.trim();
    if (trimmed.length < 1 || trimmed.length > 4000) {
      throw new BadRequestException('Message must be between 1 and 4000 characters');
    }

    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      select: { id: true, companyId: true },
    });
    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    const created = await this.prisma.customerAssignmentMessage.create({
      data: {
        assignmentId,
        senderUserId: actorUserId,
        body: trimmed,
      },
      include: {
        sender: { select: { fullName: true, role: true } },
      },
    });

    await this.safeAuditLog({
      actorUserId,
      action: 'assignment.customer_message_sent',
      entityType: 'assignment',
      entityId: assignmentId,
      summary: 'Fleet replied on customer assignment thread',
      metadata: { companyId: assignment.companyId, messageId: created.id },
    });

    return this.mapMessage(created);
  }
}
