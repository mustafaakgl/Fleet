import { PayrollDayType } from '@prisma/client';

/**
 * Takvim kodu → bordro gun tipi.
 *
 * Eslesme neden veritabaninda ve neden ONCE uiStatus'a bakiyor:
 *
 * CalendarStatus bordro icin fazla bulanik. `WE` hem hafta sonu hem
 * "unent.Fehlen" olarak kullaniliyor (biri ucretsiz tatil gunu, digeri
 * ucretten dusulen izinsiz devamsizlik — bordroda ZIT anlamlar). `AB` ise
 * BH/SA/Aus ve eslesmeyen butun talep tiplerinin cop kutusu. Ince kod
 * CalendarEvent.uiStatus'ta duruyor; frontend'in fromCalendarApiStatus'u da
 * zaten once ona bakiyor, bordro da ayni sirayi izliyor.
 */

export type DayTypeRule = { dayType: PayrollDayType; paid: boolean };

export type CalendarDayInput = {
  status: string;
  uiStatus?: string | null;
};

export type ResolvedDayType = {
  dayType: PayrollDayType;
  paid: boolean;
  /** Eslesmenin hangi kod uzerinden kuruldugu — denetimde "nereden geldi". */
  calendarCode: string;
  /** Ince kod mu yoksa enum'a mi dusuldu. */
  matchedOn: 'ui_status' | 'status';
};

/**
 * Yeni tenant icin varsayilan tohum. Kaynagi tahmin degil, kodun kendisi:
 * RequestType → CalendarStatus eslemesi leave-requests.service'te,
 * UI kodu → CalendarStatus eslemesi frontend/lib/calendar-status-map.ts'te.
 *
 * `AB` BILEREK YOK. Bes ayri seyin cop kutusu (BH, SA, Aus,
 * overtime_compensation, free_day, uniform_delivery, other) ve bunlarin bordro
 * anlami ayni degil. Eslenmemis birakiliyor ki ekranda uyari olarak ciksin;
 * ucretli ya da ucretsiz varsaymak iki yone de yanlis dusebilir.
 */
export const DEFAULT_DAY_TYPE_MAPPINGS: ReadonlyArray<{
  calendarCode: string;
  dayType: PayrollDayType;
  paid: boolean;
}> = [
  // Calisilan gunler
  { calendarCode: 'AT', dayType: PayrollDayType.work, paid: true }, // Arbeitstag
  { calendarCode: 'HO', dayType: PayrollDayType.work, paid: true }, // Home Office
  { calendarCode: 'SCH', dayType: PayrollDayType.work, paid: true }, // Schulung
  { calendarCode: 'GR', dayType: PayrollDayType.work, paid: true }, // Geschaftsreise
  { calendarCode: 'AZ', dayType: PayrollDayType.work, paid: true }, // Arzttermin
  // "kein Auftrag": surucu calismaya hazir, is yok. Annahmeverzug — ucretli.
  { calendarCode: 'MT', dayType: PayrollDayType.work, paid: true },

  // Izin
  { calendarCode: 'UT', dayType: PayrollDayType.vacation, paid: true }, // Urlaubstag
  { calendarCode: 'US', dayType: PayrollDayType.vacation, paid: true }, // Sonderurlaub (UI: SU)
  { calendarCode: 'SZ', dayType: PayrollDayType.vacation, paid: true }, // special_leave

  { calendarCode: 'KT', dayType: PayrollDayType.sick, paid: true }, // Krankheitstag
  { calendarCode: 'FT', dayType: PayrollDayType.holiday, paid: true }, // Feiertag

  { calendarCode: 'FR', dayType: PayrollDayType.off, paid: false }, // Frei (UI: PU, KA)
  { calendarCode: 'WE', dayType: PayrollDayType.off, paid: false }, // Wochenende

  // Ayni enum degerini (WE) tasiyan ama bordroda zitti olan durum. uiStatus
  // once okundugu icin bu satir hafta sonundan ayrilabiliyor.
  { calendarCode: 'unent.Fehlen', dayType: PayrollDayType.absence_unpaid, paid: false },
];

/**
 * Takvim satirindan gun tipini cozer.
 *
 * Once uiStatus, sonra status. Eslesme yoksa `null` doner — cagiran bunu
 * "eslenmemis kod" olarak gostermeli, sessizce bir varsayilana dusmemeli.
 */
export function resolveCalendarDayType(
  day: CalendarDayInput,
  rules: ReadonlyMap<string, DayTypeRule>,
): ResolvedDayType | null {
  const uiStatus = day.uiStatus?.trim();
  if (uiStatus) {
    const rule = rules.get(uiStatus);
    if (rule) {
      return { ...rule, calendarCode: uiStatus, matchedOn: 'ui_status' };
    }
  }

  const rule = rules.get(day.status);
  if (rule) {
    return { ...rule, calendarCode: day.status, matchedOn: 'status' };
  }

  return null;
}

/** Eslesme aranirken kullanilan kod sirasi — "eslenmemis" raporu da bunu izler. */
export function calendarCodesOf(day: CalendarDayInput): string[] {
  const uiStatus = day.uiStatus?.trim();
  return uiStatus && uiStatus !== day.status ? [uiStatus, day.status] : [day.status];
}
