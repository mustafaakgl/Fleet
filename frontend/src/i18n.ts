import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import deCommon from './locales/de/common.json';
import deEinsatzplan from './locales/de/einsatzplan.json';
import deLanding from './locales/de/landing.json';
import enCommon from './locales/en/common.json';
import enEinsatzplan from './locales/en/einsatzplan.json';
import enLanding from './locales/en/landing.json';
import trCommon from './locales/tr/common.json';
import trEinsatzplan from './locales/tr/einsatzplan.json';
import trLanding from './locales/tr/landing.json';

export const LANG_STORAGE_KEY = 'fleet_language';
export const SUPPORTED_LANGUAGES = ['de', 'en', 'tr'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

function isSupportedLanguage(value: string | null): value is SupportedLanguage {
  if (!value) return false;
  return SUPPORTED_LANGUAGES.includes(value as SupportedLanguage);
}

function detectLanguage(): SupportedLanguage {
  if (typeof window === 'undefined') return 'de';

  const stored = localStorage.getItem(LANG_STORAGE_KEY);
  if (isSupportedLanguage(stored)) {
    return stored;
  }

  const browser = navigator.language?.slice(0, 2).toLowerCase() ?? 'de';
  if (isSupportedLanguage(browser)) {
    return browser;
  }

  return 'de';
}

if (!i18n.isInitialized) {
  i18n
    .use(initReactI18next)
    .init({
      resources: {
        de: { common: deCommon, landing: deLanding, einsatzplan: deEinsatzplan },
        en: { common: enCommon, landing: enLanding, einsatzplan: enEinsatzplan },
        tr: { common: trCommon, landing: trLanding, einsatzplan: trEinsatzplan },
      },
      lng: detectLanguage(),
      fallbackLng: 'de',
      supportedLngs: SUPPORTED_LANGUAGES,
      defaultNS: 'common',
      ns: ['common', 'landing', 'einsatzplan'],
      interpolation: {
        escapeValue: false,
      },
    });

  if (typeof window !== 'undefined') {
    localStorage.setItem(LANG_STORAGE_KEY, i18n.language);

    i18n.on('languageChanged', (lng) => {
      if (isSupportedLanguage(lng)) {
        localStorage.setItem(LANG_STORAGE_KEY, lng);
      }
    });
  }
}

export default i18n;
