/** Server-safe language helpers. For i18n instance use `@/src/i18n.client` in client components only. */
export {
  LANG_STORAGE_KEY,
  isSupportedLanguage,
  readLanguageCookie,
  resolveLanguage,
  setLanguageCookie,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from './language';
