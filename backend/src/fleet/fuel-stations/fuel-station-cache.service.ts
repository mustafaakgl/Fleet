import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Istasyon aramalarinin onbellegi.
 *
 * RoutingCacheService ile AYNI desen (REDIS_URL varsa Redis, yoksa surec ici
 * Map) — ikinci bir onbellek altyapisi kurulmuyor, sadece namespace ve TTL
 * farkli.
 *
 * TTL kisa (varsayilan 5 dk) ve rota onbelleginden ayri tutuluyor: yol agi
 * haftalarca sabit kalir ama yakit fiyati gun icinde birkac kez degisir.
 * Fiyati saatlerce onbellekte tutmak, surucuyu artik gecerli olmayan bir
 * fiyata gore yonlendirmek olurdu.
 */
@Injectable()
export class FuelStationCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(FuelStationCacheService.name);
  private redis?: Redis;
  private readonly memory = new Map<string, { value: string; expiresAt: number }>();
  /** Surec ici onbellegin sinirsiz buyumesini engeller */
  private readonly memoryLimit = 1000;

  constructor() {
    const url = process.env.REDIS_URL?.trim();
    if (!url) {
      this.logger.log('REDIS_URL not set — fuel station cache falls back to in-process memory.');
      return;
    }
    this.redis = new Redis(url, {
      maxRetriesPerRequest: 2,
      lazyConnect: false,
      // Onbellek opsiyoneldir: baglanti kurulamazsa surec calismaya devam etmeli
      enableOfflineQueue: false,
    });
    this.redis.on('error', (error: Error) => {
      this.logger.warn(`Fuel station cache Redis error: ${error.message}`);
    });
  }

  get ttlSeconds(): number {
    const raw = Number(process.env.FUEL_STATION_CACHE_TTL_SECONDS);
    return Number.isFinite(raw) && raw > 0 ? raw : 300;
  }

  async get<T>(key: string): Promise<T | null> {
    const namespaced = `fuelstations:${key}`;

    if (this.redis) {
      try {
        const raw = await this.redis.get(namespaced);
        return raw ? (JSON.parse(raw) as T) : null;
      } catch (error) {
        // Onbellek arizasi cagriyi bozmamali — sadece isabetsizlik olarak gecer
        this.logger.warn(
          `Fuel station cache read failed: ${error instanceof Error ? error.message : 'unknown'}`,
        );
        return null;
      }
    }

    const entry = this.memory.get(namespaced);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt <= Date.now()) {
      this.memory.delete(namespaced);
      return null;
    }
    return JSON.parse(entry.value) as T;
  }

  /**
   * @param ttlSecondsOverride Varsayilan TTL'i (5 dk) gecersiz kilar.
   *   RoutingCacheService.set ile AYNI imza — secim baglami fiyat
   *   onbelleginden farkli bir omur istiyor ve ikinci bir onbellek servisi
   *   kurmak yerine mevcut olan parametrelestirildi.
   */
  async set(key: string, value: unknown, ttlSecondsOverride?: number): Promise<void> {
    const namespaced = `fuelstations:${key}`;
    const serialized = JSON.stringify(value);
    const ttl =
      ttlSecondsOverride !== undefined &&
      Number.isFinite(ttlSecondsOverride) &&
      ttlSecondsOverride > 0
        ? Math.floor(ttlSecondsOverride)
        : this.ttlSeconds;

    if (this.redis) {
      try {
        await this.redis.set(namespaced, serialized, 'EX', ttl);
      } catch (error) {
        this.logger.warn(
          `Fuel station cache write failed: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
      return;
    }

    if (this.memory.size >= this.memoryLimit) {
      // En eski girdiyi dusur (Map ekleme sirasini korur)
      const oldestKey = this.memory.keys().next().value;
      if (oldestKey !== undefined) {
        this.memory.delete(oldestKey);
      }
    }
    this.memory.set(namespaced, {
      value: serialized,
      expiresAt: Date.now() + ttl * 1000,
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit().catch(() => undefined);
    }
  }
}
