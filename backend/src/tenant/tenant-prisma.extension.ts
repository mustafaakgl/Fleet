import { Prisma } from '@prisma/client';
import { TenantContext } from './tenant-context';
import { isTenantScopedModel } from './tenant-scoped-models';

const READ_OPS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
]);

const WRITE_FILTER_OPS = new Set(['update', 'updateMany', 'delete', 'deleteMany']);

const CREATE_OPS = new Set(['create', 'createMany', 'upsert']);

function mergeWhere(
  where: Record<string, unknown> | undefined,
  tenantId: string,
): Record<string, unknown> {
  if (!where) {
    return { tenantId };
  }
  return { AND: [where, { tenantId }] };
}

function mergeData(
  data: Record<string, unknown> | Record<string, unknown>[],
  tenantId: string,
): Record<string, unknown> | Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.map((row) => ({ ...row, tenantId }));
  }
  return { ...data, tenantId };
}

/**
 * Applies tenant scoping to Prisma operation args. Pure function — exported
 * for direct unit testing of the isolation logic.
 */
export function applyTenantScope(
  operation: string,
  args: Record<string, unknown>,
  tenantId: string,
): Record<string, unknown> {
  const nextArgs = { ...args };

  if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
    const where = (nextArgs.where ?? {}) as Record<string, unknown>;
    if (where.id) {
      // extendedWhereUnique: non-unique filter fields are allowed
      // alongside the unique key — enforce tenant scoping on id reads.
      nextArgs.where = { ...where, tenantId };
    } else {
      const compoundKey = Object.keys(where).find((key) => key.includes('_'));
      if (compoundKey && typeof where[compoundKey] === 'object' && where[compoundKey] !== null) {
        nextArgs.where = {
          [compoundKey]: {
            ...(where[compoundKey] as Record<string, unknown>),
            tenantId,
          },
        };
      } else {
        nextArgs.where = { ...where, tenantId };
      }
    }
  } else if (READ_OPS.has(operation) || WRITE_FILTER_OPS.has(operation)) {
    nextArgs.where = mergeWhere(nextArgs.where as Record<string, unknown> | undefined, tenantId);
  }

  if (CREATE_OPS.has(operation)) {
    if (nextArgs.data !== undefined) {
      nextArgs.data = mergeData(
        nextArgs.data as Record<string, unknown> | Record<string, unknown>[],
        tenantId,
      );
    }
    if (operation === 'upsert') {
      nextArgs.create = mergeData(nextArgs.create as Record<string, unknown>, tenantId);
      nextArgs.update = nextArgs.update ?? {};
      nextArgs.where = mergeWhere(nextArgs.where as Record<string, unknown> | undefined, tenantId);
    }
  }

  return nextArgs;
}

export function createTenantPrismaExtension() {
  return Prisma.defineExtension({
    name: 'tenantIsolation',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const tenantId = TenantContext.getTenantId();
          if (!tenantId || TenantContext.isBypassed() || !isTenantScopedModel(model)) {
            return query(args);
          }

          return query(
            applyTenantScope(operation, args as Record<string, unknown>, tenantId) as typeof args,
          );
        },
      },
    },
  });
}
