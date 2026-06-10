import i18n from '@/src/i18n.client';

const LOCALE_TAGS: Record<string, string> = {
  de: 'de-DE',
  en: 'en-GB',
  tr: 'tr-TR',
};

function activeTag(): string {
  const lng = i18n.language?.split('-')[0] ?? 'de';
  return LOCALE_TAGS[lng] ?? LOCALE_TAGS.de;
}

export function formatFleetCurrency(amount: number, currency = 'EUR') {
  return new Intl.NumberFormat(activeTag(), { style: 'currency', currency }).format(amount);
}

export function formatFleetDateTime(value?: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(activeTag(), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
}

export function formatFleetDurationMinutes(
  minutes: number | null,
  t: (key: string, opts?: Record<string, string | number>) => string,
) {
  if (minutes === null) return '—';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return t('workSessions.duration.minutes', { mins });
  return t('workSessions.duration.hoursMinutes', { hours, mins });
}
