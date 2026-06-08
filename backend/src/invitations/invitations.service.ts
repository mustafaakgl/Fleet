import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { UserInvitationStatus, UserRole, UserStatus } from '@prisma/client';
import { safeAuditLog } from '../audit/audit-helper';
import { AuditService } from '../audit/audit.service';
import { getFrontendUrl } from '../config/env.validation';
import { BillingService } from '../billing/billing.service';
import { invitationMail } from '../mail/mail-templates';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvitationDto, INVITABLE_ROLES } from './dto/create-invitation.dto';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SALT_ROUNDS = 10;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function toClientInvitation(row: {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  language: string;
  status: UserInvitationStatus;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    email: row.email,
    full_name: row.fullName,
    role: row.role,
    language: row.language,
    status: row.status,
    expires_at: row.expiresAt.toISOString(),
    accepted_at: row.acceptedAt?.toISOString(),
    created_at: row.createdAt.toISOString(),
  };
}

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly mailService: MailService,
    private readonly billingService: BillingService,
  ) {}

  async list(tenantId: string) {
    const rows = await this.prisma.userInvitation.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return { data: rows.map(toClientInvitation) };
  }

  async create(
    tenantId: string | undefined,
    invitedById: string,
    dto: CreateInvitationDto,
  ) {
    if (!tenantId) {
      throw new BadRequestException('Tenant context required to send invitations');
    }
    if (!INVITABLE_ROLES.includes(dto.role)) {
      throw new BadRequestException('Role cannot be invited');
    }
    if (dto.role !== UserRole.driver) {
      await this.billingService.assertCanAddSeat(tenantId);
    }

    const normalizedEmail = dto.email.trim().toLowerCase();
    const existingUser = await this.prisma.user.findFirst({
      where: { email: normalizedEmail, tenantId },
      select: { id: true },
    });
    if (existingUser) {
      throw new BadRequestException('A user with this email already exists');
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

    await this.prisma.userInvitation.updateMany({
      where: {
        tenantId,
        email: normalizedEmail,
        status: UserInvitationStatus.pending,
      },
      data: { status: UserInvitationStatus.revoked },
    });

    const invitation = await this.prisma.userInvitation.create({
      data: {
        tenantId,
        email: normalizedEmail,
        fullName: dto.full_name.trim(),
        role: dto.role,
        language: dto.language ?? 'de',
        tokenHash,
        expiresAt,
        invitedById,
      },
    });

    const inviteUrl = `${getFrontendUrl()}/accept-invite?token=${rawToken}`;

    const template = invitationMail({
      fullName: dto.full_name.trim(),
      inviteUrl,
      expiresAt: expiresAt.toISOString(),
    });
    const mailResult = await this.mailService.sendMail({
      to: normalizedEmail,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });

    await safeAuditLog(this.auditService, {
      actorUserId: invitedById,
      action: 'user.invitation_sent',
      entityType: 'user_invitation',
      entityId: invitation.id,
      summary: 'User invitation created',
      metadata: {
        role: dto.role,
        mail_mode: mailResult.mode,
        mail_sent: mailResult.sent,
      },
    });

    return {
      invitation: toClientInvitation(invitation),
      invite_url: inviteUrl,
      expires_at: expiresAt.toISOString(),
      mail_sent: mailResult.sent,
      mail_mode: mailResult.mode,
    };
  }

  async validateToken(token: string) {
    const tokenHash = hashToken(token.trim());
    const row = await this.prisma.unscoped.userInvitation.findFirst({
      where: {
        tokenHash,
        status: UserInvitationStatus.pending,
        expiresAt: { gt: new Date() },
      },
    });

    if (!row) {
      return { valid: false as const };
    }

    return {
      valid: true as const,
      email: row.email,
      full_name: row.fullName,
      role: row.role,
      expires_at: row.expiresAt.toISOString(),
    };
  }

  async accept(token: string, password: string) {
    const tokenHash = hashToken(token.trim());
    const row = await this.prisma.unscoped.userInvitation.findFirst({
      where: {
        tokenHash,
        status: UserInvitationStatus.pending,
        expiresAt: { gt: new Date() },
      },
    });

    if (!row) {
      throw new BadRequestException('Invalid or expired invitation token');
    }

    if (row.role !== UserRole.driver) {
      await this.billingService.assertCanAddSeat(row.tenantId);
    }

    const existingUser = await this.prisma.unscoped.user.findFirst({
      where: { email: row.email, tenantId: row.tenantId },
      select: { id: true },
    });
    if (existingUser) {
      throw new BadRequestException('A user with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          tenantId: row.tenantId,
          fullName: row.fullName,
          email: row.email,
          passwordHash,
          role: row.role,
          status: UserStatus.active,
          language: row.language,
        },
      });

      await tx.userInvitation.update({
        where: { id: row.id },
        data: {
          status: UserInvitationStatus.accepted,
          acceptedAt: new Date(),
        },
      });

      if (row.role === UserRole.driver) {
        const driver = await tx.driver.findFirst({
          where: {
            tenantId: row.tenantId,
            email: row.email,
            userId: null,
          },
          select: { id: true },
        });
        if (driver) {
          await tx.driver.update({
            where: { id: driver.id },
            data: { userId: created.id },
          });
        }
      }

      return created;
    });

    await safeAuditLog(this.auditService, {
      actorUserId: user.id,
      action: 'user.invitation_accepted',
      entityType: 'user',
      entityId: user.id,
      summary: 'User accepted invitation',
      metadata: { invitation_id: row.id },
    });

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.fullName,
        role: user.role,
      },
    };
  }

  async revoke(tenantId: string | undefined, invitationId: string, actorUserId: string) {
    if (!tenantId) {
      throw new BadRequestException('Tenant context required');
    }

    const row = await this.prisma.userInvitation.findFirst({
      where: { id: invitationId, tenantId },
    });
    if (!row) {
      throw new NotFoundException('Invitation not found');
    }
    if (row.status !== UserInvitationStatus.pending) {
      throw new BadRequestException('Only pending invitations can be revoked');
    }

    const updated = await this.prisma.userInvitation.update({
      where: { id: invitationId },
      data: { status: UserInvitationStatus.revoked },
    });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'user.invitation_revoked',
      entityType: 'user_invitation',
      entityId: invitationId,
      summary: 'User invitation revoked',
    });

    return toClientInvitation(updated);
  }
}
