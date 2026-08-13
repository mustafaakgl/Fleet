import type { FuelingIntent, NearbyFuelStation } from '@/lib/types';

/**
 * Yakit duragi gorunumunun saf yardimcilari.
 *
 * Ayri dosya cunku ekran bilesenleri jsdom'da render edilmeden de sinanabilmeli
 * ve "hangi istasyon secili" karari TEK yerde durmali — liste, harita ve ozet
 * karti ayni cevabi vermek zorunda.
 */

/**
 * Listedeki istasyon, aktif yakit duragi mi?
 *
 * Karsilastirma SAGLAYICI + SAGLAYICI KIMLIGI uzerinden: istasyon adi
 * saglayicida degisebilir ve koordinat kayan noktali karsilastirmaya girmemeli.
 */
export function isActiveFuelStop(
  station: Pick<NearbyFuelStation, 'id' | 'provider'>,
  intent: FuelingIntent | null,
): boolean {
  if (!intent) return false;
  return (
    intent.station.providerStationId === station.id && intent.station.provider === station.provider
  );
}

/**
 * Secim baglami hala gecerli mi?
 *
 * Gecmisse arayuz ESKI FIYATI KULLANMAZ: secim dugmesi kapanir ve surucuden
 * yeniden arama istenir. Sunucu da ayni kontrolu yapiyor — bu yalnizca
 * kullaniciya bosuna bir hata gostermemek icin.
 */
export function isSelectionContextUsable(
  expiresAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!expiresAt) return false;
  const parsed = Date.parse(expiresAt);
  return Number.isFinite(parsed) && parsed > now;
}

/**
 * Aktif niyetin rota sapmasi gosterilebilir mi?
 *
 * Turdan bagimsiz secimde sapma YOKTUR ve "0 km" gostermek yanlis olurdu.
 */
export function hasIntentRouteImpact(intent: FuelingIntent): boolean {
  return intent.extraDistanceKm !== null || intent.extraDurationMin !== null;
}
