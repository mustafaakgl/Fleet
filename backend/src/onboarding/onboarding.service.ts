import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { TenantStatus, UserInvitationStatus, UserRole, UserStatus } from '@prisma/client';
import { changedFieldNames, safeAuditLog } from '../audit/audit-helper';
import { AuditService } from '../audit/audit.service';
import { getFrontendUrl } from '../config/env.validation';
import { BillingService } from '../billing/billing.service';
import { welcomeMail } from '../mail/mail-templates';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { SetupTenantDto } from './dto/setup-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

const SALT_ROUNDS = 10;

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function toClientTenant(row: {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  language: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    contact_email: row.contactEmail ?? undefined,
    contact_phone: row.contactPhone ?? undefined,
    address: row.address ?? undefined,
    language: row.language,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly billingService: BillingService,
    private readonly mailService: MailService,
  ) {}

  async getStatus() {
    const activeTenant = await this.prisma.tenant.findFirst({
      where: { status: TenantStatus.active },
      orderBy: { createdAt: 'asc' },
    });

    return {
      needs_setup: !activeTenant,
      tenant: activeTenant ? toClientTenant(activeTenant) : null,
    };
  }

  async setup(dto: SetupTenantDto, actorUserId?: string) {
    const existing = await this.prisma.tenant.findFirst({
      where: { status: TenantStatus.active },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException('Fleet is already provisioned');
    }

    return this.provisionTenant(dto, actorUserId);
  }

  async provisionTenant(dto: SetupTenantDto, actorUserId?: string) {
    const slug = slugify(dto.slug ?? dto.fleet_name);
    if (!slug) {
      throw new BadRequestException('Invalid fleet slug');
    }

    const slugTaken = await this.prisma.tenant.findUnique({ where: { slug } });
    if (slugTaken) {
      throw new BadRequestException('Fleet slug is already in use');
    }

    const normalizedEmail = dto.admin_email.trim().toLowerCase();
    const emailTaken = await this.prisma.unscoped.user.findFirst({
      where: { email: normalizedEmail },
    });
    if (emailTaken) {
      throw new BadRequestException('Admin email is already registered');
    }

    const passwordHash = await bcrypt.hash(dto.admin_password, SALT_ROUNDS);

    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.fleet_name.trim(),
          slug,
          status: TenantStatus.active,
          contactEmail: dto.contact_email?.trim().toLowerCase(),
          contactPhone: dto.contact_phone?.trim(),
          address: dto.address?.trim(),
        },
      });

      const admin = await tx.user.create({
        data: {
          tenantId: tenant.id,
          fullName: dto.admin_full_name.trim(),
          email: normalizedEmail,
          passwordHash,
          role: UserRole.admin,
          status: UserStatus.active,
          language: 'de',
        },
      });

      return { tenant, admin };
    });

    await this.billingService.ensureSubscriptionForTenant(
      result.tenant.id,
      normalizedEmail,
    );

    await safeAuditLog(this.auditService, {
      actorUserId: actorUserId ?? result.admin.id,
      action: 'tenant.provisioned',
      entityType: 'tenant',
      entityId: result.tenant.id,
      summary: 'Fleet tenant provisioned',
      metadata: { slug: result.tenant.slug },
    });

    const welcome = welcomeMail({
      fullName: result.admin.fullName,
      fleetName: result.tenant.name,
      loginUrl: `${getFrontendUrl()}/login`,
    });
    const mailResult = await this.mailService.sendMail({
      to: normalizedEmail,
      subject: welcome.subject,
      text: welcome.text,
      html: welcome.html,
    });

    return {
      tenant: toClientTenant(result.tenant),
      admin: {
        id: result.admin.id,
        email: result.admin.email,
        full_name: result.admin.fullName,
        role: result.admin.role,
      },
      welcome_mail_sent: mailResult.sent,
      mail_mode: mailResult.mode,
    };
  }

  async getProgress(tenantId: string) {
    const [
      tenant,
      userCount,
      driverCount,
      vehicleCount,
      companyCount,
      assignmentCount,
      pendingInvites,
    ] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId } }),
      this.prisma.user.count({ where: { tenantId, status: UserStatus.active } }),
      this.prisma.driver.count({ where: { tenantId } }),
      this.prisma.vehicle.count({ where: { tenantId } }),
      this.prisma.company.count({ where: { tenantId } }),
      this.prisma.assignment.count({ where: { tenantId } }),
      this.prisma.userInvitation.count({
        where: { tenantId, status: UserInvitationStatus.pending },
      }),
    ]);

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const steps = [
      {
        id: 'tenant_profile',
        complete: Boolean(
          tenant.name?.trim() &&
            tenant.contactEmail?.trim() &&
            tenant.contactPhone?.trim(),
        ),
        href: '/getting-started#tenant',
      },
      {
        id: 'invite_team',
        complete: userCount > 1 || pendingInvites > 0,
        href: '/assignments?panel=users',
      },
      {
        id: 'drivers',
        complete: driverCount > 0,
        href: '/import#drivers',
      },
      {
        id: 'vehicles',
        complete: vehicleCount > 0,
        href: '/import#vehicles',
      },
      {
        id: 'companies',
        complete: companyCount > 0,
        href: '/import#companies',
      },
      {
        id: 'first_assignment',
        complete: assignmentCount > 0,
        href: '/assignments/new',
      },
      {
        id: 'smtp_ready',
        complete: this.mailService.isEnabled(),
        href: '/getting-started#smtp',
      },
    ];

    const completed = steps.filter((s) => s.complete).length;

    return {
      tenant: toClientTenant(tenant),
      smtp_enabled: this.mailService.isEnabled(),
      counts: {
        users: userCount,
        drivers: driverCount,
        vehicles: vehicleCount,
        companies: companyCount,
        assignments: assignmentCount,
        pending_invitations: pendingInvites,
      },
      steps,
      progress_percent: Math.round((completed / steps.length) * 100),
      complete: completed === steps.length,
    };
  }

  async getTenantForAdmin(tenantId: string | null | undefined) {
    if (!tenantId) {
      throw new NotFoundException('No tenant assigned to this user');
    }
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return toClientTenant(tenant);
  }

  async updateTenant(tenantId: string, dto: UpdateTenantDto, actorUserId?: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        name: dto.fleet_name?.trim(),
        contactEmail: dto.contact_email?.trim().toLowerCase(),
        contactPhone: dto.contact_phone?.trim(),
        address: dto.address?.trim(),
        language: dto.language,
      },
    });

    const changed = changedFieldNames(dto as Record<string, unknown>);
    if (changed.length > 0) {
      await safeAuditLog(this.auditService, {
        actorUserId,
        action: 'tenant.updated',
        entityType: 'tenant',
        entityId: tenantId,
        summary: 'Fleet tenant updated',
        metadata: { changed_fields: changed },
      });
    }

    return toClientTenant(updated);
  }
}
