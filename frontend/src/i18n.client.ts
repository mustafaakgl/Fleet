'use client';

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
import {
  LANG_STORAGE_KEY,
  isSupportedLanguage,
  readLanguageCookie,
  resolveLanguage,
  setLanguageCookie,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from './language';

function detectLanguage(): SupportedLanguage {
  if (typeof window === 'undefined') return 'de';
  return resolveLanguage(readLanguageCookie());
}

function persistLanguage(lng: SupportedLanguage) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LANG_STORAGE_KEY, lng);
  setLanguageCookie(lng);
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
    i18n.on('languageChanged', (lng) => {
      if (isSupportedLanguage(lng)) {
        persistLanguage(lng);
      }
    });
  }
}

export default i18n;
