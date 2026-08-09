import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildQueueSnapshot,
  flushQueue,
  isQueueableOfflineError,
  sortQueueItems,
  type DriverOfflineQueueItem,
  type DriverOfflineQueueStore,
  writeQueueItem,
} from './driver-offline-queue-core.ts';

function createMemoryStore(initialItems: DriverOfflineQueueItem[] = []): DriverOfflineQueueStore {
  const map = new Map(initialItems.map((item) => [item.id, item] as const));
  return {
    async getAll() {
      return Array.from(map.values());
    },
    async get(id: string) {
      return map.get(id);
    },
    async put(item: DriverOfflineQueueItem) {
      map.set(item.id, item);
    },
    async delete(id: string) {
      map.delete(id);
    },
  };
}

function makeLocationItem(id: string, createdAt: string): DriverOfflineQueueItem {
  return {
    id,
    kind: 'location-point',
    createdAt,
    payload: {
      latitude: 48.1,
      longitude: 11.5,
      recordedAt: createdAt,
    },
  };
}

function makeWorkTimeItem(id: string, createdAt: string): DriverOfflineQueueItem {
  return {
    id,
    kind: 'work-time-event',
    createdAt,
    eventType: 'break_start',
    // Dokunus ani gonderim aninden ONCE: surucu tunelde molaya cikip yarim
    // saat sonra sinyal bulabiliyor.
    occurredAt: '2026-08-10T10:14:00.000Z',
  };
}

describe('driver-offline-queue-core', () => {
  it('sorts queued jobs by age, then id', () => {
    const items = sortQueueItems([
      makeLocationItem('b', '2026-07-13T10:00:02.000Z'),
      makeLocationItem('a', '2026-07-13T10:00:01.000Z'),
      makeLocationItem('c', '2026-07-13T10:00:01.000Z'),
    ]);

    assert.deepEqual(items.map((item) => item.id), ['a', 'c', 'b']);
  });

  it('writes an item once and keeps the latest payload for the same id', async () => {
    const store = createMemoryStore();
    await writeQueueItem(store, makeLocationItem('job-1', '2026-07-13T10:00:01.000Z'));
    await writeQueueItem(store, makeLocationItem('job-1', '2026-07-13T10:00:05.000Z'));

    const snapshot = await buildQueueSnapshot(await store.getAll());
    assert.equal(snapshot.pendingCount, 1);
    assert.equal(snapshot.items[0].createdAt, '2026-07-13T10:00:05.000Z');
  });

  it('flushes queued jobs in order and clears them after success', async () => {
    const store = createMemoryStore([
      makeLocationItem('job-2', '2026-07-13T10:00:02.000Z'),
      makeLocationItem('job-1', '2026-07-13T10:00:01.000Z'),
    ]);
    const sent: string[] = [];

    const snapshot = await flushQueue(store, {
      async send(item) {
        sent.push(item.id);
      },
    });

    assert.deepEqual(sent, ['job-1', 'job-2']);
    assert.equal(snapshot.pendingCount, 0);
  });

  it('stops flushing after the first failure so the job can retry later', async () => {
    const store = createMemoryStore([
      makeLocationItem('job-1', '2026-07-13T10:00:01.000Z'),
      makeLocationItem('job-2', '2026-07-13T10:00:02.000Z'),
    ]);
    const sent: string[] = [];

    await assert.rejects(
      flushQueue(store, {
        async send(item) {
          sent.push(item.id);
          if (item.id === 'job-1') {
            throw new Error('offline');
          }
        },
      }),
    );

    assert.deepEqual(sent, ['job-1']);
    assert.deepEqual((await store.getAll()).map((item) => item.id), ['job-1', 'job-2']);
  });

  it('recognizes offline and timeout failures as queueable', () => {
    assert.equal(isQueueableOfflineError({ code: 'ECONNABORTED' }), true);
    assert.equal(isQueueableOfflineError(new Error('Network Error')), true);
    assert.equal(isQueueableOfflineError({ response: {} }), false);
  });

  it('mola dokunusunu kuyrukta tasir ve gonderince siler', async () => {
    const store = createMemoryStore([makeWorkTimeItem('break-1', '2026-08-10T10:44:00.000Z')]);
    const sent: DriverOfflineQueueItem[] = [];

    const snapshot = await flushQueue(store, {
      async send(item) {
        sent.push(item);
      },
    });

    assert.equal(sent.length, 1);
    assert.equal(sent[0].kind, 'work-time-event');
    // Kuyruk kimligi sunucuya client_event_id olarak gidiyor; degismeden
    // gitmesi ayni molanin iki kez yazilmamasinin tek garantisi.
    assert.equal(sent[0].id, 'break-1');
    assert.equal(snapshot.pendingCount, 0);
  });
});
