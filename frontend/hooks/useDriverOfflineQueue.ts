'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ensureDriverOfflineQueueAutoSync,
  flushDriverOfflineQueue,
  getDriverOfflineQueueSnapshot,
  queueHasHandoverPhotoSnapshot,
  subscribeDriverOfflineQueue,
} from '@/lib/driver-offline-queue';
import type { DriverOfflineQueueSnapshot } from '@/lib/driver-offline-queue-core';

const EMPTY_SNAPSHOT: DriverOfflineQueueSnapshot = {
  items: [],
  pendingCount: 0,
  syncing: false,
};

export function useDriverOfflineQueue() {
  const [snapshot, setSnapshot] = useState<DriverOfflineQueueSnapshot>(EMPTY_SNAPSHOT);
  const [online, setOnline] = useState(true);

  const refresh = useCallback(async () => {
    setSnapshot(await getDriverOfflineQueueSnapshot());
  }, []);

  useEffect(() => {
    ensureDriverOfflineQueueAutoSync();
    setOnline(typeof window !== 'undefined' ? window.navigator.onLine : true);
    void refresh();

    const unsubscribe = subscribeDriverOfflineQueue(() => {
      void refresh();
      if (typeof window !== 'undefined') {
        setOnline(window.navigator.onLine);
      }
    });

    const onOnline = () => {
      setOnline(true);
      void flushDriverOfflineQueue();
    };
    const onOffline = () => setOnline(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      unsubscribe();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [refresh]);

  const hasQueuedHandoverPhoto = useCallback(
    (handoverId: string, slot: string) => queueHasHandoverPhotoSnapshot(snapshot, handoverId, slot),
    [snapshot],
  );

  return {
    snapshot,
    online,
    offline: !online,
    pendingCount: snapshot.pendingCount,
    syncing: snapshot.syncing,
    refresh,
    hasQueuedHandoverPhoto,
  };
}
