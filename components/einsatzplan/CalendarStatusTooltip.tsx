import { useMemo } from 'react';

export type TooltipStatusCode = 'UT' | 'KT' | 'FT' | 'AT' | 'HO' | 'SCH' | 'GR' | string;
export type TooltipSource = 'request' | 'assignment' | 'manual';

interface CalendarStatusTooltipProps {
  date: Date;
  status: TooltipStatusCode;
  source?: TooltipSource;
  sourceDate?: string;
}

const statusLabelMap: Record<string, string> = {
  UT: 'Urlaubstag',
  KT: 'Krankenstand',
  FT: 'Feiertag',
  AT: 'Arbeitstag',
  HO: 'Homeoffice',
  SCH: 'Schulung',
  GR: 'Geschaftsreise',
};

function formatGermanDate(value: Date) {
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(value);
}

function normalizeToGermanDate(raw?: string) {
  if (!raw) return '';
  const parsed = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed);
}

function buildReference(source?: TooltipSource, sourceDate?: string) {
  const formattedDate = normalizeToGermanDate(sourceDate);

  if (source === 'request') {
    return formattedDate ? `Antrag vom ${formattedDate}` : 'Antrag';
  }

  if (source === 'assignment') {
    return formattedDate ? `Einsatz vom ${formattedDate}` : 'Einsatz';
  }

  if (source === 'manual') {
    return 'Manuell eingetragen';
  }

  return 'Kein Referenzdatensatz';
}

export function CalendarStatusTooltip({ date, status, source, sourceDate }: CalendarStatusTooltipProps) {
  const fullStatusName = useMemo(() => statusLabelMap[status] ?? status, [status]);
  const dateLabel = useMemo(() => formatGermanDate(date), [date]);
  const referenceLine = useMemo(() => buildReference(source, sourceDate), [source, sourceDate]);

  return (
    <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-1 w-max min-w-[210px] -translate-x-1/2 rounded-md border border-slate-200 bg-white px-3 py-2 text-left shadow-lg">
      <p className="text-xs font-semibold text-slate-900">{dateLabel}</p>
      <p className="mt-1 text-xs text-slate-700">{fullStatusName}</p>
      <p className="mt-1 text-[11px] italic text-slate-500">{referenceLine}</p>
    </div>
  );
}
