export const LANG_STORAGE_KEY = 'fleet_language';
export const SUPPORTED_LANGUAGES = ['de', 'en', 'tr'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export function isSupportedLanguage(value: string | null | undefined): value is SupportedLanguage {
  if (!value) return false;
  return SUPPORTED_LANGUAGES.includes(value as SupportedLanguage);
}

export function resolveLanguage(value: string | null | undefined): SupportedLanguage {
  return isSupportedLanguage(value) ? value : 'de';
}

export function readLanguageCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${LANG_STORAGE_KEY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

export function setLanguageCookie(lng: SupportedLanguage) {
  if (typeof document === 'undefined') return;
  document.cookie = `${LANG_STORAGE_KEY}=${encodeURIComponent(lng)};path=/;max-age=31536000;SameSite=Lax`;
}
