import type { PickedLocation, TourDetail, TourStopPayload } from '@/lib/api';

/**
 * Tur kurma formunun saf mantigi.
 *
 * Bilesenden ayri tutuluyor: siralama ve payload kurma sahada "surucu yanlis
 * yere gitti" olarak ortaya cikan hata sinifi ve geriye donuk teshisi zor.
 * Burasi React'e bagimli degil, dogrudan test edilebilir.
 */

export interface TourBuilderStop {
  /** Yalnizca istemci tarafi kimlik; sunucuya gitmez */
  key: string;
  location: PickedLocation | null;
  serviceMinutes: number;
  windowStart: string;
  windowEnd: string;
  note: string;
}

export function emptyStop(key: string): TourBuilderStop {
  return { key, location: null, serviceMinutes: 0, windowStart: '', windowEnd: '', note: '' };
}

/** Durak listesinde bir ogeyi baska bir konuma tasir. */
export function moveStop(
  stops: TourBuilderStop[],
  from: number,
  to: number,
): TourBuilderStop[] {
  if (from === to) return stops;
  if (from < 0 || from >= stops.length) return stops;
  if (to < 0 || to >= stops.length) return stops;

  const next = [...stops];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function removeStop(stops: TourBuilderStop[], key: string): TourBuilderStop[] {
  return stops.filter((stop) => stop.key !== key);
}

export interface TourBuilderForm {
  driverId: string;
  company: string;
  vehicle: string;
  /** "YYYY-MM-DD" */
  startDate: string;
  /** "HH:MM" */
  startTime: string;
  start: TourBuilderStop;
  stops: TourBuilderStop[];
  returnToStart: boolean;
  name: string;
}

export type TourFormIssue =
  | 'start_missing'
  | 'no_stops'
  | 'stop_without_address'
  | 'invalid_window'
  | 'stop_not_reachable';

/**
 * Kamyonun giremedigi duraklar.
 *
 * "Dogrulanamadi"dan AYRI tutuluyor ve bu ayrim onemli: bu duraklar rotayi
 * gercekten cokertir, o yuzden hesaplamayi engellerler. Dogrulanamamis durak
 * ise yalnizca bilgi eksikligidir — motor kapaliysa ya da adres harita
 * kapsaminin disindaysa olusur ve kullaniciyi engellememeli.
 */
export function blockingStops(form: TourBuilderForm): TourBuilderStop[] {
  return [form.start, ...form.stops].filter(
    (stop) => stop.location?.truckAccess === 'unreachable',
  );
}

/** Erisimi kontrol edilememis duraklar — uyari degil, dipnot. */
export function unverifiedStops(form: TourBuilderForm): TourBuilderStop[] {
  return [form.start, ...form.stops].filter(
    (stop) =>
      stop.location != null &&
      (stop.location.truckAccess === 'unknown' || stop.location.truckAccess === 'check_failed'),
  );
}

/**
 * Sunucuya gitmeden once formu dogrular.
 *
 * Adres alaninin DOLU olmasi yetmez, secilmis olmasi gerekir: kullanici
 * yazip oneriye tiklamazsa `location` null kalir. Bunu gondermek sunucuda
 * koordinatsiz durak uretir; hatayi burada yakalamak dispatcher'a hangi
 * satiri duzeltecegini soyler.
 */
export function validateTourForm(form: TourBuilderForm): TourFormIssue[] {
  const issues: TourFormIssue[] = [];

  if (!form.start.location) {
    issues.push('start_missing');
  }
  if (form.stops.length === 0) {
    issues.push('no_stops');
  }
  if (form.stops.some((stop) => !stop.location)) {
    issues.push('stop_without_address');
  }
  if (
    [form.start, ...form.stops].some(
      (stop) => stop.windowStart && stop.windowEnd && stop.windowStart > stop.windowEnd,
    )
  ) {
    issues.push('invalid_window');
  }

  // Kamyonun giremedigi durak hesaplamayi ENGELLER. Sunucu da reddediyor ama
  // orada ogrenmek gec: kullanici dokuz duragi girip butona bastiktan sonra
  // hangi satirin sorunlu oldugunu aramak zorunda kalir.
  if (blockingStops(form).length > 0) {
    issues.push('stop_not_reachable');
  }

  return issues;
}

function toStopPayload(stop: TourBuilderStop): TourStopPayload {
  const payload: TourStopPayload = {};
  if (stop.location?.id) payload.location_id = stop.location.id;
  if (stop.note.trim()) payload.label = stop.note.trim();
  if (stop.serviceMinutes > 0) payload.service_minutes = stop.serviceMinutes;
  if (stop.windowStart) payload.window_start = stop.windowStart;
  if (stop.windowEnd) payload.window_end = stop.windowEnd;
  return payload;
}

/**
 * Tarih ve saati ISO ana cevirir.
 *
 * Yerel saat olarak yorumlanir: dispatcher "07:00" yazdiginda kendi
 * saatini kasteder, UTC'yi degil.
 */
export function toPlannedStartAt(startDate: string, startTime: string): string | undefined {
  if (!startDate || !startTime) return undefined;
  const parsed = new Date(`${startDate}T${startTime}`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export function buildCreatePayload(form: TourBuilderForm) {
  return {
    work_date: form.startDate,
    planned_start_at: toPlannedStartAt(form.startDate, form.startTime),
    name: form.name.trim() || undefined,
    vehicle_id: form.vehicle || undefined,
    driver_id: form.driverId || undefined,
    start: toStopPayload(form.start),
    stops: form.stops.map(toStopPayload),
    return_to_start: form.returnToStart,
  };
}

/** "4 sa 35 dk" bicimindeki sure — birim metinleri cagirandan gelir. */
export function formatDuration(
  minutes: number | null | undefined,
  units: { hour: string; minute: string },
): string | null {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return null;
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest} ${units.minute}`;
  if (rest === 0) return `${hours} ${units.hour}`;
  return `${hours} ${units.hour} ${rest} ${units.minute}`;
}

export interface TourSummaryParts {
  stopCount: number;
  distanceKm: number | null;
  durationMinutes: number | null;
}

/**
 * Gorev hucresindeki tek satirlik ozet:
 * "Cok duraklu rota · 9 durak · 186 km · 4 sa 35 dk"
 *
 * Hesaplanmamis alanlar ATLANIR, sifir gosterilmez: optimizasyon
 * calismadan "0 km" yazmak dispatcher'a rotanin bos oldugunu dusundurur.
 */
export function buildTourSummary(
  parts: TourSummaryParts,
  labels: { title: string; stops: string; hour: string; minute: string },
): string {
  const segments = [labels.title, `${parts.stopCount} ${labels.stops}`];

  if (parts.distanceKm !== null && Number.isFinite(parts.distanceKm)) {
    segments.push(`${Math.round(parts.distanceKm)} km`);
  }

  const duration = formatDuration(parts.durationMinutes, labels);
  if (duration) {
    segments.push(duration);
  }

  return segments.join(' · ');
}

/**
 * Optimizasyonun ne kazandirdigi. Taban yoksa null doner — "once/sonra"
 * karsilastirmasi tabansiz yapilamaz.
 */
export function tourSavings(tour: TourDetail): {
  beforeKm: number;
  afterKm: number;
  savedKm: number;
  percent: number;
} | null {
  const before = tour.baselineDistanceKm;
  const after = tour.plannedDistanceKm;
  if (before === null || after === null || before <= 0) return null;

  const saved = before - after;
  return { beforeKm: before, afterKm: after, savedKm: saved, percent: (saved / before) * 100 };
}

/** Ziyaret sirasindaki duraklar; depo baslangici her zaman basta kalir. */
export function orderedStops(tour: TourDetail) {
  return [...tour.stops].sort((left, right) => left.sequence - right.sequence);
}

/** Kamyona kapali duraklar — kullaniciya uyari olarak gosterilir. */
export function unreachableStops(tour: TourDetail) {
  return orderedStops(tour).filter((stop) => stop.truckAccess === 'unreachable');
}
