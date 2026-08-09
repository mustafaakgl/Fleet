'use client';

import { driverPortalApi } from '@/lib/api';
import {
  buildQueueSnapshot,
  isQueueableOfflineError,
  sortQueueItems,
  type DriverOfflineQueueItem,
  type DriverOfflineQueueSender,
  type DriverOfflineQueueSnapshot,
} from './driver-offline-queue-core';

const DB_NAME = 'fleet-driver-offline-queue';
const DB_VERSION = 1;
const STORE_NAME = 'items';

type QueueChangeListener = () => void;

let syncing = false;
let autoSyncStarted = false;
let flushPromise: Promise<DriverOfflineQueueSnapshot> | null = null;
const listeners = new Set<QueueChangeListener>();

function emitQueueChange() {
  for (const listener of listeners) {
    listener();
  }
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function openQueueDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available'));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB'));
  });
}

async function withStore<T>(mode: IDBTransactionMode, task: (store: IDBObjectStore) => Promise<T> | T): Promise<T> {
  const db = await openQueueDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      let taskFinished = false;
      let taskResult: T;
      let taskFailed: unknown = null;

      const tryResolve = () => {
        if (taskFinished && !taskFailed) {
          resolve(taskResult);
        }
      };

      transaction.onabort = () => {
        reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
      };
      transaction.onerror = () => {
        reject(transaction.error ?? new Error('IndexedDB transaction failed'));
      };
      transaction.oncomplete = () => {
        tryResolve();
      };

      Promise.resolve(task(store))
        .then((value) => {
          taskFinished = true;
          taskResult = value;
          tryResolve();
        })
        .catch((error) => {
          taskFailed = error;
          reject(error);
        });
    });
  } finally {
    db.close();
  }
}

async function loadAllItems(): Promise<DriverOfflineQueueItem[]> {
  return withStore('readonly', async (store) => {
    const items = (await requestToPromise(store.getAll())) as DriverOfflineQueueItem[];
    return sortQueueItems(items);
  });
}

async function writeItem(item: DriverOfflineQueueItem): Promise<void> {
  await withStore('readwrite', async (store) => {
    await requestToPromise(store.put(item));
  });
}

async function deleteItem(id: string): Promise<void> {
  await withStore('readwrite', async (store) => {
    await requestToPromise(store.delete(id));
  });
}

function canAutoFlush(): boolean {
  if (typeof window === 'undefined') return false;
  return window.navigator.onLine && document.visibilityState === 'visible';
}

async function sendQueuedItem(item: DriverOfflineQueueItem): Promise<void> {
  switch (item.kind) {
    case 'handover-photo':
      await driverPortalApi.uploadHandoverPhoto(
        item.handoverId,
        item.slot as never,
        new File([item.file], item.fileName, { type: item.fileType }),
        {
          takenAt: item.metadata.takenAt,
          gpsLat: item.metadata.gpsLat,
          gpsLng: item.metadata.gpsLng,
          deviceInfo: item.metadata.deviceInfo,
          clientRequestId: item.id,
        },
      );
      return;
    case 'request-attachment':
      await driverPortalApi.uploadRequestAttachment(
        item.requestId,
        new File([item.file], item.fileName, { type: item.fileType }),
        { clientRequestId: item.id },
      );
      return;
    case 'transport-attachment':
      await driverPortalApi.uploadTransportAttachment(
        item.transportRequestId,
        new File([item.file], item.fileName, { type: item.fileType }),
        { clientRequestId: item.id },
      );
      return;
    case 'accident-attachment':
      await driverPortalApi.uploadAccidentAttachment(
        item.accidentId,
        new File([item.file], item.fileName, { type: item.fileType }),
        item.documentType,
        { clientRequestId: item.id },
      );
      return;
    case 'location-point':
      await driverPortalApi.submitLocation({
        ...item.payload,
        clientRequestId: item.id,
      });
      return;
    case 'tour-stop-mark':
      // Kuyruk kaydinin id'si client_event_id olarak gidiyor: ayni olay
      // yeniden gonderilirse sunucu ikinci kez uygulamiyor.
      await driverPortalApi.markTourStop(item.stopId, {
        status: item.status,
        client_event_id: item.id,
        occurred_at: item.occurredAt,
        latitude: item.latitude,
        longitude: item.longitude,
      });
      return;
    case 'work-time-event':
      await driverPortalApi.markWorkTimeBreak(item.eventType, {
        client_event_id: item.id,
        occurred_at: item.occurredAt,
        source: 'driver_web',
        latitude: item.latitude,
        longitude: item.longitude,
      });
      return;
  }
}

async function flushWithSender(sender: DriverOfflineQueueSender): Promise<DriverOfflineQueueSnapshot> {
  const items = await loadAllItems();
  for (const item of items) {
    try {
      await sender.send(item);
      await deleteItem(item.id);
    } catch (error) {
      if (isQueueableOfflineError(error)) {
        break;
      }
      break;
    }
  }

  return buildQueueSnapshot(await loadAllItems(), syncing);
}

async function flushDriverOfflineQueueInternal(): Promise<DriverOfflineQueueSnapshot> {
  if (flushPromise) {
    return flushPromise;
  }

  flushPromise = (async () => {
    if (!canAutoFlush()) {
      return buildQueueSnapshot(await loadAllItems(), false);
    }

    syncing = true;
    emitQueueChange();
    try {
      return await flushWithSender({
        async send(item) {
          await sendQueuedItem(item);
        },
      });
    } finally {
      syncing = false;
      emitQueueChange();
      flushPromise = null;
    }
  })();

  return flushPromise;
}

function queueAndMaybeFlush(item: DriverOfflineQueueItem): Promise<string> {
  return writeItem(item).then(async () => {
    emitQueueChange();
    if (canAutoFlush()) {
      void flushDriverOfflineQueueInternal();
    }
    return item.id;
  });
}

export async function getDriverOfflineQueueSnapshot(): Promise<DriverOfflineQueueSnapshot> {
  return buildQueueSnapshot(await loadAllItems(), syncing);
}

export function subscribeDriverOfflineQueue(listener: QueueChangeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function ensureDriverOfflineQueueAutoSync(): void {
  if (autoSyncStarted || typeof window === 'undefined') {
    return;
  }
  autoSyncStarted = true;

  const syncSoon = () => {
    if (canAutoFlush()) {
      void flushDriverOfflineQueueInternal();
    }
  };

  window.addEventListener('online', syncSoon);
  window.addEventListener('focus', syncSoon);
  document.addEventListener('visibilitychange', syncSoon);
}

export async function flushDriverOfflineQueue(): Promise<DriverOfflineQueueSnapshot> {
  return flushDriverOfflineQueueInternal();
}

export async function enqueueHandoverPhotoQueueItem(params: {
  handoverId: string;
  slot: string;
  file: Blob;
  fileName: string;
  metadata: {
    takenAt: string;
    gpsLat?: number;
    gpsLng?: number;
    deviceInfo?: string;
  };
  clientRequestId?: string;
}): Promise<string> {
  const id = params.clientRequestId ?? crypto.randomUUID();
  return queueAndMaybeFlush({
    id,
    kind: 'handover-photo',
    createdAt: new Date().toISOString(),
    handoverId: params.handoverId,
    slot: params.slot,
    file: params.file,
    fileName: params.fileName,
    fileType: params.file.type || 'image/jpeg',
    metadata: params.metadata,
  });
}

export async function enqueueRequestAttachmentQueueItem(params: {
  requestId: string;
  file: Blob;
  fileName: string;
  clientRequestId?: string;
}): Promise<string> {
  const id = params.clientRequestId ?? crypto.randomUUID();
  return queueAndMaybeFlush({
    id,
    kind: 'request-attachment',
    createdAt: new Date().toISOString(),
    requestId: params.requestId,
    file: params.file,
    fileName: params.fileName,
    fileType: params.file.type || 'application/octet-stream',
  });
}

export async function enqueueTransportAttachmentQueueItem(params: {
  transportRequestId: string;
  file: Blob;
  fileName: string;
  clientRequestId?: string;
}): Promise<string> {
  const id = params.clientRequestId ?? crypto.randomUUID();
  return queueAndMaybeFlush({
    id,
    kind: 'transport-attachment',
    createdAt: new Date().toISOString(),
    transportRequestId: params.transportRequestId,
    file: params.file,
    fileName: params.fileName,
    fileType: params.file.type || 'application/octet-stream',
  });
}

export async function enqueueAccidentAttachmentQueueItem(params: {
  accidentId: string;
  file: Blob;
  fileName: string;
  documentType?: string;
  clientRequestId?: string;
}): Promise<string> {
  const id = params.clientRequestId ?? crypto.randomUUID();
  return queueAndMaybeFlush({
    id,
    kind: 'accident-attachment',
    createdAt: new Date().toISOString(),
    accidentId: params.accidentId,
    documentType: params.documentType,
    file: params.file,
    fileName: params.fileName,
    fileType: params.file.type || 'application/octet-stream',
  });
}

export async function enqueueLocationPointQueueItem(params: {
  payload: {
    latitude: number;
    longitude: number;
    accuracyM?: number;
    speedMps?: number;
    headingDeg?: number;
    recordedAt: string;
  };
  clientRequestId?: string;
}): Promise<string> {
  const id = params.clientRequestId ?? crypto.randomUUID();
  return queueAndMaybeFlush({
    id,
    kind: 'location-point',
    createdAt: new Date().toISOString(),
    payload: params.payload,
  });
}

export async function enqueueTourStopMarkQueueItem(params: {
  stopId: string;
  status: 'arrived' | 'completed' | 'skipped';
  occurredAt: string;
  latitude?: number;
  longitude?: number;
}): Promise<string> {
  const id = crypto.randomUUID();
  return queueAndMaybeFlush({
    id,
    kind: 'tour-stop-mark',
    createdAt: new Date().toISOString(),
    stopId: params.stopId,
    status: params.status,
    occurredAt: params.occurredAt,
    latitude: params.latitude,
    longitude: params.longitude,
  });
}

/**
 * Mola dokunusunu kuyruga alir. Cevrimici ise aninda gider; degilse baglanti
 * gelince ayni `id` ile gonderilir ve sunucu ikinci kez yazmaz.
 */
export async function enqueueWorkTimeEventQueueItem(params: {
  eventType: 'break_start' | 'break_end';
  occurredAt: string;
  latitude?: number;
  longitude?: number;
}): Promise<string> {
  const id = crypto.randomUUID();
  return queueAndMaybeFlush({
    id,
    kind: 'work-time-event',
    createdAt: new Date().toISOString(),
    eventType: params.eventType,
    occurredAt: params.occurredAt,
    latitude: params.latitude,
    longitude: params.longitude,
  });
}

export function queueHasHandoverPhotoSnapshot(
  snapshot: DriverOfflineQueueSnapshot,
  handoverId: string,
  slot: string,
): boolean {
  return snapshot.items.some((item) => item.kind === 'handover-photo' && item.handoverId === handoverId && item.slot === slot);
}
