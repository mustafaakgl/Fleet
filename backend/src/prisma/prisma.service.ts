import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createTenantPrismaExtension } from '../tenant/tenant-prisma.extension';

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
