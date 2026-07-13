export type DriverOfflineQueueKind =
  | 'handover-photo'
  | 'request-attachment'
  | 'transport-attachment'
  | 'accident-attachment'
  | 'location-point';

export type DriverOfflineQueueItem =
  | {
      id: string;
      kind: 'handover-photo';
      createdAt: string;
      handoverId: string;
      slot: string;
      fileName: string;
      fileType: string;
      file: Blob;
      metadata: {
        takenAt: string;
        gpsLat?: number;
        gpsLng?: number;
        deviceInfo?: string;
      };
    }
  | {
      id: string;
      kind: 'request-attachment';
      createdAt: string;
      requestId: string;
      fileName: string;
      fileType: string;
      file: Blob;
    }
  | {
      id: string;
      kind: 'transport-attachment';
      createdAt: string;
      transportRequestId: string;
      fileName: string;
      fileType: string;
      file: Blob;
    }
  | {
      id: string;
      kind: 'accident-attachment';
      createdAt: string;
      accidentId: string;
      documentType?: string;
      fileName: string;
      fileType: string;
      file: Blob;
    }
  | {
      id: string;
      kind: 'location-point';
      createdAt: string;
      payload: {
        latitude: number;
        longitude: number;
        accuracyM?: number;
        speedMps?: number;
        headingDeg?: number;
        recordedAt: string;
      };
    };

export type DriverOfflineQueueSnapshot = {
  items: DriverOfflineQueueItem[];
  pendingCount: number;
  syncing: boolean;
};

export interface DriverOfflineQueueStore {
  getAll(): Promise<DriverOfflineQueueItem[]>;
  get(id: string): Promise<DriverOfflineQueueItem | undefined>;
  put(item: DriverOfflineQueueItem): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface DriverOfflineQueueSender {
  send(item: DriverOfflineQueueItem): Promise<void>;
}

export function sortQueueItems(items: DriverOfflineQueueItem[]): DriverOfflineQueueItem[] {
  return [...items].sort((left, right) => {
    const createdAtDiff = Date.parse(left.createdAt) - Date.parse(right.createdAt);
    if (createdAtDiff !== 0) return createdAtDiff;
    return left.id.localeCompare(right.id);
  });
}

export function buildQueueSnapshot(items: DriverOfflineQueueItem[], syncing = false): DriverOfflineQueueSnapshot {
  return {
    items: sortQueueItems(items),
    pendingCount: items.length,
    syncing,
  };
}

export async function writeQueueItem(
  store: DriverOfflineQueueStore,
  item: DriverOfflineQueueItem,
): Promise<DriverOfflineQueueSnapshot> {
  await store.put(item);
  return buildQueueSnapshot(await store.getAll());
}

export async function getQueueSnapshot(
  store: DriverOfflineQueueStore,
  syncing = false,
): Promise<DriverOfflineQueueSnapshot> {
  return buildQueueSnapshot(await store.getAll(), syncing);
}

export async function flushQueue(
  store: DriverOfflineQueueStore,
  sender: DriverOfflineQueueSender,
): Promise<DriverOfflineQueueSnapshot> {
  const items = sortQueueItems(await store.getAll());

  for (const item of items) {
    await sender.send(item);
    await store.delete(item.id);
  }

  return buildQueueSnapshot(await store.getAll(), false);
}

export function isQueueableOfflineError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as {
    response?: unknown;
    code?: string;
    message?: string;
  };
  if (candidate.response) return false;
  if (candidate.code === 'ECONNABORTED') return true;
  return typeof candidate.message === 'string' && /network|offline|timeout/i.test(candidate.message);
}
