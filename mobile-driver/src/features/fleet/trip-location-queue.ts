import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import type { EnqueueTripLocationInput, QueuedTripLocationPoint } from './constants';

const DB_NAME = 'fleet-trip-queue.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase | null> {
  if (Platform.OS === 'web') {
    return null;
  }

  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS trip_location_queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          trip_id TEXT NOT NULL,
          recorded_at TEXT NOT NULL,
          lat REAL NOT NULL,
          lng REAL NOT NULL,
          speed_kmh REAL,
          heading REAL,
          accuracy_m REAL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_trip_queue_trip_id ON trip_location_queue(trip_id, id);
      `);
      return db;
    })();
  }

  return dbPromise;
}

function mapRow(row: Record<string, unknown>): QueuedTripLocationPoint {
  return {
    id: Number(row.id),
    tripId: String(row.trip_id),
    recordedAt: String(row.recorded_at),
    lat: Number(row.lat),
    lng: Number(row.lng),
    speedKmh: row.speed_kmh === null || row.speed_kmh === undefined ? null : Number(row.speed_kmh),
    heading: row.heading === null || row.heading === undefined ? null : Number(row.heading),
    accuracyM: row.accuracy_m === null || row.accuracy_m === undefined ? null : Number(row.accuracy_m),
  };
}

export async function enqueueTripLocationPoint(point: EnqueueTripLocationInput): Promise<void> {
  const db = await getDb();
  if (!db) {
    return;
  }

  await db.runAsync(
    `INSERT INTO trip_location_queue
      (trip_id, recorded_at, lat, lng, speed_kmh, heading, accuracy_m, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    point.tripId,
    point.recordedAt,
    point.lat,
    point.lng,
    point.speedKmh,
    point.heading,
    point.accuracyM,
    new Date().toISOString(),
  );
}

export async function countQueuedPoints(tripId: string): Promise<number> {
  const db = await getDb();
  if (!db) {
    return 0;
  }

  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM trip_location_queue WHERE trip_id = ?',
    tripId,
  );
  return row?.count ?? 0;
}

export async function peekQueuedPoints(tripId: string, limit: number): Promise<QueuedTripLocationPoint[]> {
  const db = await getDb();
  if (!db) {
    return [];
  }

  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT id, trip_id, recorded_at, lat, lng, speed_kmh, heading, accuracy_m
     FROM trip_location_queue
     WHERE trip_id = ?
     ORDER BY id ASC
     LIMIT ?`,
    tripId,
    limit,
  );

  return rows.map(mapRow);
}

export async function deleteQueuedPoints(ids: number[]): Promise<void> {
  const db = await getDb();
  if (!db || ids.length === 0) {
    return;
  }

  const placeholders = ids.map(() => '?').join(', ');
  await db.runAsync(`DELETE FROM trip_location_queue WHERE id IN (${placeholders})`, ...ids);
}

export async function clearTripQueue(tripId: string): Promise<void> {
  const db = await getDb();
  if (!db) {
    return;
  }

  await db.runAsync('DELETE FROM trip_location_queue WHERE trip_id = ?', tripId);
}
