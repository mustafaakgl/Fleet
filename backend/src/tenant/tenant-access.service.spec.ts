import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { TenantStatus } from '@prisma/client';
import { TenantAccessService } from './tenant-access.service';

function createService(status: TenantStatus | null) {
  return new TenantAccessService({
    unscoped: {
      tenant: {
        findUnique: async () => (status ? { status } : null),
      },
    },
  } as never);
}

describe('TenantAccessService', () => {
  it('allows active tenants', async () => {
    const service = createService(TenantStatus.active);
    await assert.doesNotReject(() => service.assertTenantAllowsLogin('tenant-a'));
  });

  it('blocks suspended tenants', async () => {
    const service = createService(TenantStatus.suspended);
    await assert.rejects(
      () => service.assertTenantAllowsLogin('tenant-a'),
      ForbiddenException,
    );
  });

  it('blocks provisioning tenants', async () => {
    const service = createService(TenantStatus.provisioning);
    await assert.rejects(
      () => service.assertTenantAllowsLogin('tenant-a'),
      ForbiddenException,
    );
  });

  it('rejects unknown tenants', async () => {
    const service = createService(null);
    await assert.rejects(
      () => service.assertTenantAllowsLogin('missing'),
      UnauthorizedException,
    );
  });
});
