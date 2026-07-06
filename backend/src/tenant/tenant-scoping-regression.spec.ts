import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyTenantScope } from './tenant-prisma.extension';
import { isTenantScopedModel } from './tenant-scoped-models';

const TENANT_ID = 'tenant-a';

describe('tenant scoping regressions', () => {
  it('normalizes lower-case Prisma model names', () => {
    assert.equal(isTenantScopedModel('driver'), true);
    assert.equal(isTenantScopedModel('dddFile'), true);
    assert.equal(isTenantScopedModel('nonScopedModel'), false);
  });

  it('injects tenantId for count, aggregate and groupBy operations', () => {
    const countResult = applyTenantScope('count', {}, TENANT_ID);
    const aggregateResult = applyTenantScope('aggregate', {}, TENANT_ID);
    const groupByResult = applyTenantScope('groupBy', { by: ['status'] }, TENANT_ID);

    assert.deepEqual(countResult.where, { tenantId: TENANT_ID });
    assert.deepEqual(aggregateResult.where, { tenantId: TENANT_ID });
    assert.deepEqual(groupByResult.where, { tenantId: TENANT_ID });
  });

  it('does not inject tenantId into compound unique inputs that do not contain tenantId', () => {
    const result = applyTenantScope(
      'findUnique',
      {
        where: {
          driverId_vehicleId_workDate: {
            driverId: 'drv-1',
            vehicleId: 'veh-1',
            workDate: '2026-07-06',
          },
        },
      },
      TENANT_ID,
      'DepartureCheck',
    );

    assert.deepEqual(result.where, {
      driverId_vehicleId_workDate: {
        driverId: 'drv-1',
        vehicleId: 'veh-1',
        workDate: '2026-07-06',
      },
    });
  });
});