import type { AppLocale } from './translations';

const LOCALE_TAGS: Record<AppLocale, string> = {
  de: 'de-DE',
  en: 'en-GB',
  tr: 'tr-TR',
  pl: 'pl-PL',
  nl: 'nl-NL',
  it: 'it-IT',
  es: 'es-ES',
  ru: 'ru-RU',
};

export function formatAppDate(locale: AppLocale, date = new Date()) {
  return date.toLocaleDateString(LOCALE_TAGS[locale] ?? LOCALE_TAGS.de, {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
}
