/** Maps UI calendar abbreviations to Prisma `CalendarStatus` values. */
export function toCalendarApiStatus(status: string): string {
  const map: Record<string, string> = {
    SU: 'US',
    PU: 'FR',
    BH: 'AB',
    KA: 'FR',
    SA: 'AB',
    Aus: 'AB',
    'k. Auftrag': 'MT',
    'unent.Fehlen': 'WE',
  };
  return map[status] ?? status;
}

/** Best-effort reverse map when loading persisted manual events. */
export function fromCalendarApiStatus(apiStatus: string): string {
  const map: Record<string, string> = {
    US: 'SU',
    FR: 'PU',
    AB: 'SA',
    WE: 'unent.Fehlen',
    MT: 'k. Auftrag',
  };
  return map[apiStatus] ?? apiStatus;
}
