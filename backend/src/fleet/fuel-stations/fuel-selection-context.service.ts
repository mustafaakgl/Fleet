import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { FuelProductType } from '@prisma/client';
import { TenantContext } from '../../tenant/tenant-context';
import type { StationRouteMetrics } from './core/route-recommendation.util';
import { FuelStationCacheService } from './fuel-station-cache.service';
import type {
  FuelStationAddress,
  FuelStationAttribution,
  NormalizedFuelStation,
} from './fuel-station.types';

/**
 * Secim baglaminin omru.
 *
 * Kisa: istasyon fiyati gun icinde birkac kez degisir ve surucunun 40 dakika
 * once gordugu fiyati "secim aninda gecerli fiyat" diye kaydetmek yanlis veri
 * uretir. Uzun degil ama surucunun karar vermesine yetecek kadar: arama, liste
 * inceleme ve onay icin 10 dakika bol.
 */
export const SELECTION_CONTEXT_TTL_SECONDS = 600;

export interface SelectionContextOffering {
  productType: FuelProductType;
  pricePerUnit: number | null;
}

export interface SelectionContextStation {
  /** Saglayicinin istasyon kimligi — istekte gelen `stationId` bununla eslesir. */
  id: string;
  provider: string;
  name: string;
  brand: string | null;
  address: FuelStationAddress;
  latitude: number;
  longitude: number;
  /** Fiyatin ALINDIGI an; "fiyatin degistigi an" DEGIL (bkz. fuel-station.types). */
  retrievedAt: string;
  offerings: SelectionContextOffering[];
  /** Faz 4 metrikleri. Yalnizca hesaplanabildiyse dolu. */
  routeMetrics: {
    extraDistanceKm: number | null;
    extraDurationMin: number | null;
    driveTimeToStationMin: number | null;
    stationEta: string | null;
  } | null;
}

export interface FuelSelectionContext {
  id: string;
  /** TenantContext'ten; null ise istek disi bir baglamda uretilmis demektir. */
  tenantId: string | null;
  driverId: string;
  vehicleId: string;
  /** Aracin ACIKCA onaylanmis urunleri — uyumluluk kontrolu buradan yapilir. */
  compatibleProducts: FuelProductType[];
  attribution: FuelStationAttribution;
  routeMode: 'active_tour' | 'nearby_only';
  routeCalculatedAt: string | null;
  /** Rota baglamindan gelen tur bilgisi. Istemci GONDEREMEZ. */
  tourId: string | null;
  anchorTourStopId: string | null;
  stations: SelectionContextStation[];
  createdAt: string;
  expiresAt: string;
}

/**
 * Saglayici istasyonundan baglam kaydina.
 *
 * Yalnizca SECIM icin gereken alanlar tasiniyor: acilis saatleri, kabul edilen
 * kartlar ve kus ucusu mesafe gibi alanlar snapshot'a girmiyor — onbellekte
 * tasinmayan veri, sizmayan veridir.
 */
export function toSelectionContextStation(
  station: NormalizedFuelStation,
  routeMetrics?: StationRouteMetrics,
): SelectionContextStation {
  return {
    id: station.id,
    provider: station.provider,
    name: station.name,
    brand: station.brand,
    address: station.address,
    latitude: station.latitude,
    longitude: station.longitude,
    retrievedAt: station.retrievedAt,
    offerings: station.offerings.map((offering) => ({
      productType: offering.productType,
      pricePerUnit: offering.pricePerUnit,
    })),
    routeMetrics:
      routeMetrics && routeMetrics.calculationStatus === 'calculated'
        ? {
            extraDistanceKm: routeMetrics.extraDistanceKm,
            extraDurationMin: routeMetrics.extraDurationMin,
            driveTimeToStationMin: routeMetrics.driveTimeToStationMin,
            stationEta: routeMetrics.stationEta,
          }
        : null,
  };
}

export type SelectionContextLookup =
  | { ok: true; context: FuelSelectionContext }
  | { ok: false; reason: 'expired' };

/**
 * Arama sonucunun sunucu tarafindaki kisa omurlu kopyasi.
 *
 * NEDEN VAR: secim istegi istasyon adini, koordinatini ve fiyatini govdede
 * kabul etseydi surucu (ya da eline surucu oturumu gecen biri) istedigi fiyati
 * ve istedigi istasyonu kaydedebilirdi. Kayit sonradan yakit fisiyle
 * karsilastirilacagi icin bu, denetimin dayanagini komple cokertirdi. Bu yuzden
 * secim istegi yalnizca OPAK bir baglam kimligi + istasyon kimligi tasir;
 * snapshot'in TAMAMI buradan okunur.
 *
 * Kimlik randomUUID: tahmin edilemez ve icinde kiraci/surucu bilgisi tasimaz.
 * Ham onbellek anahtari istemciye ACILMAZ (`selection:` on eki burada eklenir).
 *
 * URETIM SINIRI — COK ORNEKLI KURULUM: REDIS_URL tanimli degilse
 * FuelStationCacheService surec ici Map'e duser. Yuk dengeleyici arkasinda iki
 * ornek calisiyorsa aramayi karsilayan ornekle secimi karsilayan ornek farkli
 * olabilir ve baglam "sure doldu" olarak gorunur. Sonuc GUVENLIDIR (uydurma
 * veri yerine yeniden arama istenir) ama can sikicidir: uretimde REDIS_URL
 * zorunludur — bkz. docs/PILOT-LAUNCH-CHECKLIST.md.
 */
@Injectable()
export class FuelSelectionContextService {
  private readonly logger = new Logger(FuelSelectionContextService.name);

  constructor(private readonly cache: FuelStationCacheService) {}

  private key(contextId: string): string {
    return `selection:${contextId}`;
  }

  async create(
    input: Omit<FuelSelectionContext, 'id' | 'tenantId' | 'createdAt' | 'expiresAt'>,
  ): Promise<FuelSelectionContext> {
    const now = new Date();
    const context: FuelSelectionContext = {
      ...input,
      id: randomUUID(),
      tenantId: TenantContext.getTenantId() ?? null,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + SELECTION_CONTEXT_TTL_SECONDS * 1000).toISOString(),
    };

    await this.cache.set(this.key(context.id), context, SELECTION_CONTEXT_TTL_SECONDS);
    return context;
  }

  /**
   * Mevcut baglami rota bilgisiyle zenginlestirir — AYNI kimlik altinda.
   *
   * Yeni bir baglam uretilmiyor: surucunun elinde tek bir kimlik olmali, aksi
   * halde yakinlik listesinden gelen eski kimlikle rota metrikli bir secim
   * yapilabilirdi. `expiresAt` KORUNUYOR: zenginlestirme omru uzatmaz, TTL
   * aramanin baslangicindan sayilir.
   */
  async augment(
    contextId: string,
    patch: Pick<
      FuelSelectionContext,
      'routeMode' | 'routeCalculatedAt' | 'tourId' | 'anchorTourStopId' | 'stations'
    >,
  ): Promise<void> {
    const existing = await this.cache.get<FuelSelectionContext>(this.key(contextId));
    if (!existing) {
      // Onbellek arizasi ya da yaris: istegi bozmuyoruz. Secim denendiginde
      // "sure doldu" alinir ve surucu yeniden arar — sahte veriyle devam
      // etmekten iyidir.
      this.logger.warn('Fuel selection context vanished before augmentation');
      return;
    }

    await this.cache.set(
      this.key(contextId),
      { ...existing, ...patch },
      SELECTION_CONTEXT_TTL_SECONDS,
    );
  }

  /**
   * Baglami cozer ve SAHIBINE ait oldugunu dogrular.
   *
   * Kiraci, surucu ya da arac uyusmuyorsa `expired` donuyor — ayri bir "bu
   * senin degil" kodu KASITLI olarak yok: farkli cevaplar, elinde gecerli bir
   * surucu oturumu olan birine "bu kimlik var ama baskasinin" bilgisini
   * sizdiran bir kehanet (oracle) olurdu. Kullanici acisindan da dogru sonuc
   * ayni: yeniden arama. Aracin vardiya ortasinda degismesi de bu yola duser
   * ve eski aracin uyumluluk filtresiyle secim yapilmasini engeller.
   */
  async resolve(
    contextId: string,
    owner: { driverId: string; vehicleId: string },
  ): Promise<SelectionContextLookup> {
    const context = await this.cache.get<FuelSelectionContext>(this.key(contextId));
    if (!context) {
      return { ok: false, reason: 'expired' };
    }

    const expiresAt = Date.parse(context.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      // Redis TTL'i zaten dusurur; bu kontrol surec ici Map'te saat kaymasina
      // ve Redis'in TTL'i geç uygulamasina karsi ikinci kapi.
      return { ok: false, reason: 'expired' };
    }

    const tenantId = TenantContext.getTenantId() ?? null;
    if (context.tenantId !== null && tenantId !== null && context.tenantId !== tenantId) {
      this.logger.warn('Fuel selection context rejected: tenant mismatch');
      return { ok: false, reason: 'expired' };
    }

    if (context.driverId !== owner.driverId || context.vehicleId !== owner.vehicleId) {
      this.logger.warn('Fuel selection context rejected: driver/vehicle mismatch');
      return { ok: false, reason: 'expired' };
    }

    return { ok: true, context };
  }
}
