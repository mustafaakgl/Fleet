import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyTenantScope } from './tenant-prisma.extension';
import { TenantContext } from './tenant-context';

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

describe('applyTenantScope — read operations', () => {
  it('adds tenantId filter to findMany without where', () => {
    const result = applyTenantScope('findMany', {}, TENANT_A);
    assert.deepEqual(result.where, { tenantId: TENANT_A });
  });

  it('wraps existing where in AND with tenantId for findMany', () => {
    const result = applyTenantScope('findMany', { where: { status: 'active' } }, TENANT_A);
    assert.deepEqual(result.where, {
      AND: [{ status: 'active' }, { tenantId: TENANT_A }],
    });
  });

  it('cannot be overridden by a caller-specified foreign tenantId', () => {
    const result = applyTenantScope('findMany', { where: { tenantId: TENANT_B } }, TENANT_A);
    // Both filters apply — the AND makes the query return nothing rather
    // than leaking tenant B data.
    assert.deepEqual(result.where, {
      AND: [{ tenantId: TENANT_B }, { tenantId: TENANT_A }],
    });
  });

  it('scopes findFirst', () => {
    const result = applyTenantScope('findFirst', { where: { email: 'x@y.z' } }, TENANT_A);
    assert.deepEqual(result.where, {
      AND: [{ email: 'x@y.z' }, { tenantId: TENANT_A }],
    });
  });

  it('scopes count', () => {
    const result = applyTenantScope('count', {}, TENANT_A);
    assert.deepEqual(result.where, { tenantId: TENANT_A });
  });

  it('scopes aggregate', () => {
    const result = applyTenantScope('aggregate', {}, TENANT_A);
    assert.deepEqual(result.where, { tenantId: TENANT_A });
  });

  it('scopes groupBy', () => {
    const result = applyTenantScope('groupBy', { by: ['status'] }, TENANT_A);
    assert.deepEqual(result.where, { tenantId: TENANT_A });
  });
});

describe('applyTenantScope — findUnique', () => {
  it('adds tenantId alongside id lookups (cross-tenant id reads return null)', () => {
    const result = applyTenantScope('findUnique', { where: { id: 'driver-1' } }, TENANT_A);
    assert.deepEqual(result.where, { id: 'driver-1', tenantId: TENANT_A });
  });

  it('adds tenantId alongside id for findUniqueOrThrow', () => {
    const result = applyTenantScope('findUniqueOrThrow', { where: { id: 'v-9' } }, TENANT_A);
    assert.deepEqual(result.where, { id: 'v-9', tenantId: TENANT_A });
  });

  it('injects tenantId into compound unique keys', () => {
    const result = applyTenantScope(
      'findUnique',
      { where: { tenantId_email: { email: 'a@b.c', tenantId: TENANT_B } } },
      TENANT_A,
    );
    assert.deepEqual(result.where, {
      tenantId_email: { email: 'a@b.c', tenantId: TENANT_A },
    });
  });

  it('adds tenantId to plain unique fields', () => {
    const result = applyTenantScope('findUnique', { where: { userId: 'u-1' } }, TENANT_A);
    assert.deepEqual(result.where, { userId: 'u-1', tenantId: TENANT_A });
  });
});

describe('applyTenantScope — write operations', () => {
  it('forces tenantId on create data', () => {
    const result = applyTenantScope(
      'create',
      { data: { firstName: 'Max', tenantId: TENANT_B } },
      TENANT_A,
    );
    assert.deepEqual(result.data, { firstName: 'Max', tenantId: TENANT_A });
  });

  it('forces tenantId on every row of createMany', () => {
    const result = applyTenantScope(
      'createMany',
      { data: [{ a: 1 }, { a: 2, tenantId: TENANT_B }] },
      TENANT_A,
    );
    assert.deepEqual(result.data, [
      { a: 1, tenantId: TENANT_A },
      { a: 2, tenantId: TENANT_A },
    ]);
  });

  it('scopes update by unique id with tenantId', () => {
    const result = applyTenantScope(
      'update',
      { where: { id: 'd-1' }, data: { status: 'inactive' } },
      TENANT_A,
    );
    assert.deepEqual(result.where, {
      id: 'd-1',
      tenantId: TENANT_A,
    });
  });

  it('scopes updateMany', () => {
    const result = applyTenantScope(
      'updateMany',
      { where: { status: 'active' }, data: { status: 'inactive' } },
      TENANT_A,
    );
    assert.deepEqual(result.where, {
      AND: [{ status: 'active' }, { tenantId: TENANT_A }],
    });
  });

  it('scopes delete by unique id with tenantId', () => {
    const result = applyTenantScope('delete', { where: { id: 'd-1' } }, TENANT_A);
    assert.deepEqual(result.where, {
      id: 'd-1',
      tenantId: TENANT_A,
    });
  });

  it('scopes deleteMany without where (prevents cross-tenant wipe)', () => {
    const result = applyTenantScope('deleteMany', {}, TENANT_A);
    assert.deepEqual(result.where, { tenantId: TENANT_A });
  });

  it('scopes upsert create, update and where', () => {
    const result = applyTenantScope(
      'upsert',
      {
        where: { id: 'r-1' },
        create: { name: 'row', tenantId: TENANT_B },
        update: { name: 'row2' },
      },
      TENANT_A,
    );
    assert.deepEqual(result.create, { name: 'row', tenantId: TENANT_A });
    assert.deepEqual(result.where, {
      id: 'r-1',
      tenantId: TENANT_A,
    });
  });
});

describe('TenantContext', () => {
  it('returns the tenant id inside run()', () => {
    TenantContext.run(TENANT_A, () => {
      assert.equal(TenantContext.getTenantId(), TENANT_A);
    });
  });

  it('returns undefined outside any context', () => {
    assert.equal(TenantContext.getTenantId(), undefined);
  });

  it('isolates nested contexts', () => {
    TenantContext.run(TENANT_A, () => {
      TenantContext.run(TENANT_B, () => {
        assert.equal(TenantContext.getTenantId(), TENANT_B);
      });
      assert.equal(TenantContext.getTenantId(), TENANT_A);
    });
  });

  it('runUnscoped bypasses tenant filtering and reports bypass', () => {
    TenantContext.run(TENANT_A, () => {
      TenantContext.runUnscoped(() => {
        assert.equal(TenantContext.getTenantId(), undefined);
        assert.equal(TenantContext.isBypassed(), true);
      });
    });
  });

  it('propagates context across async boundaries', async () => {
    await TenantContext.run(TENANT_A, async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      assert.equal(TenantContext.getTenantId(), TENANT_A);
    });
  });

  it('keeps concurrent async contexts separate', async () => {
    const results = await Promise.all([
      TenantContext.run(TENANT_A, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return TenantContext.getTenantId();
      }),
      TenantContext.run(TENANT_B, async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return TenantContext.getTenantId();
      }),
    ]);
    assert.deepEqual(results, [TENANT_A, TENANT_B]);
  });
});
