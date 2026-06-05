import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { TenantStatus, UserRole, UserStatus } from '@prisma/client';
import { changedFieldNames, safeAuditLog } from '../audit/audit-helper';
import { AuditService } from '../audit/audit.service';
import { BillingService } from '../billing/billing.service';
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

    const slug = slugify(dto.slug ?? dto.fleet_name);
    if (!slug) {
      throw new BadRequestException('Invalid fleet slug');
    }

    const slugTaken = await this.prisma.tenant.findUnique({ where: { slug } });
    if (slugTaken) {
      throw new BadRequestException('Fleet slug is already in use');
    }

    const normalizedEmail = dto.admin_email.trim().toLowerCase();
    const emailTaken = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
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

    return {
      tenant: toClientTenant(result.tenant),
      admin: {
        id: result.admin.id,
        email: result.admin.email,
        full_name: result.admin.fullName,
        role: result.admin.role,
      },
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
