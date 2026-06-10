export const DEFAULT_LOCALE = 'de' as const;

/** Target fleet languages (+ ru kept for existing driver accounts). */
export const SUPPORTED_LOCALES = [
  'de',
  'tr',
  'en',
  'pl',
  'ro',
  'bg',
  'ar',
  'uk',
  'fr',
  'it',
  'es',
  'nl',
  'ru',
] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const RTL_LOCALES: AppLocale[] = ['ar'];

export function isRtlLocale(locale: AppLocale): boolean {
  return RTL_LOCALES.includes(locale);
}

export function isSupportedLocale(value?: string | null): value is AppLocale {
  if (!value) return false;
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function normalizeLocale(value?: string | null): AppLocale {
  if (isSupportedLocale(value)) return value;
  return DEFAULT_LOCALE;
}

/** BCP-47 tags for Intl formatters (DB timestamps stay UTC). */
export const LOCALE_TAGS: Record<AppLocale, string> = {
  de: 'de-DE',
  tr: 'tr-TR',
  en: 'en-GB',
  pl: 'pl-PL',
  ro: 'ro-RO',
  bg: 'bg-BG',
  ar: 'ar-SA',
  uk: 'uk-UA',
  fr: 'fr-FR',
  it: 'it-IT',
  es: 'es-ES',
  nl: 'nl-NL',
  ru: 'ru-RU',
};

export const LANGUAGE_LABEL_KEYS: Record<AppLocale, string> = {
  de: 'languages.de',
  tr: 'languages.tr',
  en: 'languages.en',
  pl: 'languages.pl',
  ro: 'languages.ro',
  bg: 'languages.bg',
  ar: 'languages.ar',
  uk: 'languages.uk',
  fr: 'languages.fr',
  it: 'languages.it',
  es: 'languages.es',
  nl: 'languages.nl',
  ru: 'languages.ru',
};
