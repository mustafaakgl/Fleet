'use client';

import { useEffect, useLayoutEffect } from 'react';
import i18n from '@/src/i18n.client';
import {
  LANG_STORAGE_KEY,
  isSupportedLanguage,
  readLanguageCookie,
  type SupportedLanguage,
} from '@/src/language';

type I18nProviderProps = {
  children: React.ReactNode;
  initialLanguage: SupportedLanguage;
};

function syncLanguage(language: SupportedLanguage) {
  if (i18n.language !== language) {
    void i18n.changeLanguage(language);
  }
}

export function I18nProvider({ children, initialLanguage }: I18nProviderProps) {
  if (i18n.language !== initialLanguage) {
    void i18n.changeLanguage(initialLanguage);
  }

  useLayoutEffect(() => {
    syncLanguage(initialLanguage);

    if (readLanguageCookie()) return;

    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (isSupportedLanguage(stored) && stored !== i18n.language) {
      void i18n.changeLanguage(stored);
      return;
    }

    const browser = navigator.language?.slice(0, 2).toLowerCase() ?? 'de';
    if (isSupportedLanguage(browser) && browser !== i18n.language) {
      void i18n.changeLanguage(browser);
    }
  }, [initialLanguage]);

  useEffect(() => {
    document.documentElement.lang = i18n.language;

    const handler = (lng: string) => {
      document.documentElement.lang = lng;
    };

    i18n.on('languageChanged', handler);
    return () => {
      i18n.off('languageChanged', handler);
    };
  }, []);

  return <>{children}</>;
}
