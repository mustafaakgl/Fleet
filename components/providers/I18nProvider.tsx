'use client';

import '@/src/i18n';
import { useEffect } from 'react';
import i18n from '@/src/i18n';

export function I18nProvider({ children }: { children: React.ReactNode }) {
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
