'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ConnectionBanner, type ConnectionBannerStatus } from './ConnectionBanner';

type ConnectionEntry = {
  status: ConnectionBannerStatus;
  lastUpdatedAt: Date | null;
};

type ConnectionBannerContextValue = {
  register: (id: string, entry: ConnectionEntry) => void;
  unregister: (id: string) => void;
  aggregate: { status: ConnectionBannerStatus; lastUpdatedAt: Date | null };
};

const ConnectionBannerContext = createContext<ConnectionBannerContextValue | null>(null);

function entryEquals(a: ConnectionEntry, b: ConnectionEntry): boolean {
  return (
    a.status === b.status &&
    (a.lastUpdatedAt?.getTime() ?? null) === (b.lastUpdatedAt?.getTime() ?? null)
  );
}

export function ConnectionBannerProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Record<string, ConnectionEntry>>({});

  const register = useCallback((id: string, entry: ConnectionEntry) => {
    setEntries((current) => {
      const existing = current[id];
      if (existing && entryEquals(existing, entry)) {
        return current;
      }
      return { ...current, [id]: entry };
    });
  }, []);

  const unregister = useCallback((id: string) => {
    setEntries((current) => {
      if (!(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);

  const aggregate = useMemo(() => {
    const values = Object.values(entries);
    if (values.length === 0) {
      return { status: 'connected' as const, lastUpdatedAt: null as Date | null };
    }
    const status: ConnectionBannerStatus = values.some((entry) => entry.status === 'disconnected')
      ? 'disconnected'
      : values.some((entry) => entry.status === 'reconnecting')
        ? 'reconnecting'
        : 'connected';
    const lastUpdatedAt = values.reduce<Date | null>((latest, entry) => {
      if (!entry.lastUpdatedAt) return latest;
      if (!latest || entry.lastUpdatedAt > latest) return entry.lastUpdatedAt;
      return latest;
    }, null);
    return { status, lastUpdatedAt };
  }, [entries]);

  const value = useMemo(
    () => ({ register, unregister, aggregate }),
    [aggregate, register, unregister],
  );

  return <ConnectionBannerContext.Provider value={value}>{children}</ConnectionBannerContext.Provider>;
}

export function ConnectionBannerSlot() {
  const context = useContext(ConnectionBannerContext);
  if (!context) return null;
  return (
    <ConnectionBanner status={context.aggregate.status} lastUpdatedAt={context.aggregate.lastUpdatedAt} />
  );
}

export function useRegisterConnection(
  id: string,
  status: ConnectionBannerStatus,
  lastUpdatedAt: Date | null,
) {
  const register = useContext(ConnectionBannerContext)?.register;
  const unregister = useContext(ConnectionBannerContext)?.unregister;
  const lastUpdatedAtMs = lastUpdatedAt?.getTime() ?? null;

  useEffect(() => {
    if (!register || !unregister) return undefined;
    register(id, { status, lastUpdatedAt });
    return () => unregister(id);
  }, [id, lastUpdatedAtMs, register, status, unregister]);
}
