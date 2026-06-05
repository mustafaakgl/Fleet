import { AsyncLocalStorage } from 'node:async_hooks';

export type TenantStore = {
  tenantId?: string;
  bypass?: boolean;
};

const storage = new AsyncLocalStorage<TenantStore>();

export const TenantContext = {
  run<T>(tenantId: string | undefined, fn: () => T): T {
    return storage.run({ tenantId, bypass: false }, fn);
  },

  runUnscoped<T>(fn: () => T): T {
    return storage.run({ bypass: true }, fn);
  },

  getTenantId(): string | undefined {
    const store = storage.getStore();
    if (!store || store.bypass) {
      return undefined;
    }
    return store.tenantId;
  },

  isBypassed(): boolean {
    return storage.getStore()?.bypass === true;
  },
};
