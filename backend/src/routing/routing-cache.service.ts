import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Valhalla yanitlari icin onbellek.
 *
 * Neden zorunlu: olculen matris latency'si soguk 20x20 icin 5.904 ms, sicak
 * 639 ms — 7-9 kat fark. Ayni depo/durak ciftleri gun icinde defalarca
 * sorulacagi icin onbelleksiz optimizasyon kullanilamaz hale gelir.
 *
 * REDIS_URL yoksa surec ici Map'e duser (QueueService'teki inline modun ayni
 * mantigi): tek surecte calisan gelistirme ortami icin yeterli, uretimde Redis.
 */
@Injectable()
export class RoutingCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(RoutingCacheService.name);
  private redis?: Redis;
  private readonly memory = new Map<string, { value: string; expiresAt: number }>();
  /** Surec ici onbellegin sinirsiz buyumesini engeller */
  private readonly memoryLimit = 5000;

  constructor() {
    const url = process.env.REDIS_URL?.trim();
    if (!url) {
      this.logger.log('REDIS_URL not set — routing cache falls back to in-process memory.');
      return;
    }
    this.redis = new Redis(url, {
      maxRetriesPerRequest: 2,
      lazyConnect: false,
      // Onbellek opsiyoneldir: baglanti kurulamazsa surec calismaya devam etmeli
      enableOfflineQueue: false,
    });
    this.redis.on('error', (error: Error) => {
      this.logger.warn(`Routing cache Redis error: ${error.message}`);
    });
  }

  private get ttlSeconds(): number {
    const raw = Number(process.env.ROUTING_CACHE_TTL_SECONDS);
    // Yol agi haftalar mertebesinde degisir; 7 gun guvenli bir varsayilan.
    return Number.isFinite(raw) && raw > 0 ? raw : 7 * 24 * 60 * 60;
  }

  async get<T>(key: string): Promise<T | null> {
    const namespaced = `routing:${key}`;

    if (this.redis) {
      try {
        const raw = await this.redis.get(namespaced);
        return raw ? (JSON.parse(raw) as T) : null;
      } catch (error) {
        // Onbellek arizasi cagriyi bozmamali — sadece isabetsizlik olarak gecer
        this.logger.warn(
          `Routing cache read failed: ${error instanceof Error ? error.message : 'unknown'}`,
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
   * @param ttlSecondsOverride Varsayilan TTL'i (7 gun) gecersiz kilar.
   *
   * Neden gerekli: yol agi geometrisi haftalarca sabit, ama SURUCUYE ozel
   * turetilmis sonuclar (ornegin aktif tura gore istasyon sapmasi) turun
   * degismesiyle gecersizlesir. Bunlari 7 gun tutmak, degistirilmis bir turun
   * eski sapmasini gostermek olurdu. Ayri bir onbellek sinifi yerine ayni
   * altyapiya kisa TTL veriliyor.
   */
  async set(key: string, value: unknown, ttlSecondsOverride?: number): Promise<void> {
    const namespaced = `routing:${key}`;
    const serialized = JSON.stringify(value);
    const ttl =
      ttlSecondsOverride !== undefined && Number.isFinite(ttlSecondsOverride) && ttlSecondsOverride > 0
        ? Math.floor(ttlSecondsOverride)
        : this.ttlSeconds;

    if (this.redis) {
      try {
        await this.redis.set(namespaced, serialized, 'EX', ttl);
      } catch (error) {
        this.logger.warn(
          `Routing cache write failed: ${error instanceof Error ? error.message : 'unknown'}`,
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
