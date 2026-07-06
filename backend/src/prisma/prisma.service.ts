import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createTenantPrismaExtension } from '../tenant/tenant-prisma.extension';
import { applyTenantScope } from '../tenant/tenant-prisma.extension';
import { TenantContext } from '../tenant/tenant-context';
import { isTenantScopedModel } from '../tenant/tenant-scoped-models';

const DELEGATED_PRISMA_METHODS = new Set([
  '$connect',
  '$disconnect',
  '$transaction',
  '$queryRaw',
  '$queryRawUnsafe',
  '$executeRaw',
  '$executeRawUnsafe',
  '$extends',
]);

function toModelName(model: string): string {
  return model[0].toUpperCase() + model.slice(1);
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  readonly #scoped: ReturnType<PrismaClient['$extends']>;

  constructor() {
    super();
    this.#scoped = this.$extends(createTenantPrismaExtension());

    return new Proxy(this, {
      get: (target, prop, receiver) => {
        if (prop === 'unscoped') {
          return target;
        }

        if (prop === 'onModuleInit' || prop === 'onModuleDestroy') {
          const value = Reflect.get(target, prop, receiver);
          return typeof value === 'function' ? value.bind(target) : value;
        }

        if (typeof prop === 'string' && DELEGATED_PRISMA_METHODS.has(prop)) {
          const scopedValue = (target.#scoped as Record<string, unknown>)[prop];
          if (typeof scopedValue === 'function') {
            return scopedValue.bind(target.#scoped);
          }
          return scopedValue;
        }

        const scopedValue = (target.#scoped as Record<string, unknown>)[prop as string];
        if (scopedValue !== undefined) {
          if (typeof prop === 'string' && scopedValue && typeof scopedValue === 'object') {
            const modelName = toModelName(prop);
            if (isTenantScopedModel(modelName)) {
              return new Proxy(scopedValue as Record<string, unknown>, {
                get: (delegateTarget, delegateProp, delegateReceiver) => {
                  const delegateValue = Reflect.get(delegateTarget, delegateProp, delegateReceiver);
                  if (typeof delegateProp === 'string' && typeof delegateValue === 'function') {
                    return (...args: unknown[]) => {
                      const tenantId = TenantContext.getTenantId();
                      if (!tenantId || TenantContext.isBypassed()) {
                        return (delegateValue as (...callArgs: unknown[]) => unknown).apply(delegateTarget, args);
                      }

                      const rawArgs = (args[0] ?? {}) as Record<string, unknown>;
                      const scopedArgs = applyTenantScope(delegateProp, rawArgs, tenantId) as Record<string, unknown>;
                      return (delegateValue as (...callArgs: unknown[]) => unknown).call(
                        delegateTarget,
                        scopedArgs,
                        ...args.slice(1),
                      );
                    };
                  }

                  return delegateValue;
                },
              });
            }
          }

          return typeof scopedValue === 'function' ? scopedValue.bind(target.#scoped) : scopedValue;
        }

        return Reflect.get(target, prop, receiver);
      },
    }) as this;
  }

  /** Base Prisma client without tenant scoping (auth, onboarding, webhooks). */
  get unscoped(): PrismaClient {
    return this;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
