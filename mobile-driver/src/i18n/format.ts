import { LOCALE_TAGS, normalizeLocale, type AppLocale } from './languages';

function tag(locale?: string | null): string {
  const normalized = normalizeLocale(locale);
  return LOCALE_TAGS[normalized] ?? LOCALE_TAGS.de;
}

export function formatAppDate(locale?: string | null, date = new Date()) {
  return date.toLocaleDateString(tag(locale), {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    timeZone: 'UTC',
  });
}

export function formatAppDateTime(locale?: string | null, value?: string | Date | null) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(tag(locale), {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  });
}

export function formatAppCurrency(
  locale?: string | null,
  amount?: number | null,
  currency = 'EUR',
) {
  if (amount == null) return '—';
  return new Intl.NumberFormat(tag(locale), { style: 'currency', currency }).format(amount);
}

export { type AppLocale } from './languages';
