import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantStatus, UserStatus } from '@prisma/client';
import { safeAuditLog } from '../audit/audit-helper';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { OnboardingService } from '../onboarding/onboarding.service';
import { SetupTenantDto } from '../onboarding/dto/setup-tenant.dto';

@Injectable()
export class FleetOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly onboarding: OnboardingService,
    private readonly auditService: AuditService,
  ) {}

  async listTenants() {
    const tenants = await this.prisma.unscoped.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        subscription: {
          select: {
            plan: true,
            status: true,
            billingMode: true,
          },
        },
      },
    });

    const stats = await Promise.all(
      tenants.map(async (tenant) => {
        const [users, drivers, vehicles] = await Promise.all([
          this.prisma.unscoped.user.count({
            where: { tenantId: tenant.id, status: UserStatus.active },
          }),
          this.prisma.unscoped.driver.count({ where: { tenantId: tenant.id } }),
          this.prisma.unscoped.vehicle.count({ where: { tenantId: tenant.id } }),
        ]);
        return { tenantId: tenant.id, users, drivers, vehicles };
      }),
    );

    const statsById = new Map(stats.map((row) => [row.tenantId, row]));

    return tenants.map((tenant) => {
      const row = statsById.get(tenant.id);
      return {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        contact_email: tenant.contactEmail ?? undefined,
        created_at: tenant.createdAt.toISOString(),
        counts: {
          users: row?.users ?? 0,
          drivers: row?.drivers ?? 0,
          vehicles: row?.vehicles ?? 0,
        },
        subscription: tenant.subscription
          ? {
              plan: tenant.subscription.plan,
              status: tenant.subscription.status,
              billing_mode: tenant.subscription.billingMode,
            }
          : undefined,
      };
    });
  }

  async provisionTenant(dto: SetupTenantDto, actorUserId?: string) {
    return this.onboarding.provisionTenant(dto, actorUserId);
  }

  async updateTenantStatus(
    tenantId: string,
    status: TenantStatus,
    actorUserId?: string,
  ) {
    const tenant = await this.prisma.unscoped.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const updated = await this.prisma.unscoped.tenant.update({
      where: { id: tenantId },
      data: { status },
    });

    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'tenant.status_changed',
      entityType: 'tenant',
      entityId: tenantId,
      summary: `Tenant status changed to ${status}`,
      metadata: { previous_status: tenant.status, status },
    });

    return {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      status: updated.status,
    };
  }
}
