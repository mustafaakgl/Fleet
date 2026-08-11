import type { DriverTourStop, DriverTourStopStatus } from '@/api/types';

/**
 * Bir duragin surucuye hangi eylemi sundugu.
 *
 * Sunucudaki gecis kurallarinin (decideStopTransition) arayuz karsiligi:
 * durum yalnizca ileri gider, `pending`e donus ayri bir "geri al" ucudur.
 * Burada tutulmasinin sebebi, ekranin durumu tahmin etmeye calismamasi —
 * yanlis dugme gosteren bir arayuz surucuye reddedilecek istek attirir.
 */
export type StopAction =
  // 'skipped' bilincli olarak DISARIDA: durak atlamak ayri bir karar ve ayri
  // bir onay ister; ileri gecis dugmesi olarak sunulmamali.
  | { kind: 'mark'; next: 'arrived' | 'completed'; labelKey: string }
  | { kind: 'reset'; labelKey: string }
  | { kind: 'none' };

export function nextStopAction(status: DriverTourStopStatus): StopAction {
  if (status === 'pending') {
    return { kind: 'mark', next: 'arrived', labelKey: 'tour.markArrived' };
  }
  if (status === 'arrived') {
    return { kind: 'mark', next: 'completed', labelKey: 'tour.markCompleted' };
  }
  // completed ve skipped uc durum: ileri gidilmez, yalnizca geri alinir.
  return { kind: 'reset', labelKey: 'tour.undo' };
}

/**
 * Turun sirasindaki AKTIF durak: tamamlanmamis ilk durak.
 *
 * Surucunun ekranda arama yapmamasi icin: dokuz duraklik listede "simdi
 * neredeyim" sorusunun cevabi vurgulanmali.
 */
export function activeStopId(stops: DriverTourStop[]): string | null {
  const ordered = [...stops].sort((left, right) => left.sequence - right.sequence);
  const active = ordered.find(
    (stop) => stop.status !== 'completed' && stop.status !== 'skipped',
  );
  return active?.id ?? null;
}

/** Tamamlanan durak sayisi — ilerleme gostergesi. */
export function completedStopCount(stops: DriverTourStop[]): number {
  return stops.filter((stop) => stop.status === 'completed' || stop.status === 'skipped').length;
}

/**
 * Cevrimdisi kuyruk ayni olayi tekrar gonderebildigi icin sunucu bir kimlik
 * bekliyor. Dokunusa ozgu uretilir; ayni dokunusun tekrar denenmesi ayni
 * kimligi tasir ve sunucu ikinci kez uygulamaz.
 *
 * Kripto gucunde rastgelelik gerekmiyor — bu bir guvenlik degeri degil,
 * tekrar koruma anahtari.
 */
export function newClientEventId(stopId: string, status: string, at: number): string {
  const noise = Math.floor(Math.random() * 1e6).toString(36);
  return `${stopId}:${status}:${at}:${noise}`.slice(0, 64);
}
