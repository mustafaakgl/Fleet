import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { TenantStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TenantAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertTenantAllowsLogin(tenantId: string): Promise<void> {
    const tenant = await this.prisma.unscoped.tenant.findUnique({
      where: { id: tenantId },
      select: { status: true },
    });

    if (!tenant) {
      throw new UnauthorizedException('Tenant not found');
    }

    if (tenant.status === TenantStatus.suspended) {
      throw new ForbiddenException('This account has been suspended. Contact support.');
    }

    if (tenant.status === TenantStatus.provisioning) {
      throw new ForbiddenException('This account is still being set up.');
    }

    if (tenant.status !== TenantStatus.active) {
      throw new ForbiddenException('This account is not available.');
    }
  }
}
