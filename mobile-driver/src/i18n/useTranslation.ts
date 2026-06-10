import { useEffect, useMemo } from 'react';
import { I18nManager } from 'react-native';
import { useTranslation as useI18nextTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { driverApi } from '@/api/endpoints';
import { authStore } from '@/features/auth/store';
import { formatAppCurrency, formatAppDate, formatAppDateTime } from './format';
import { initI18n, setAppLanguage } from './i18n';
import { isRtlLocale, normalizeLocale, type AppLocale } from './languages';

export function useTranslation() {
  const accessToken = authStore((s) => s.accessToken);
  const sessionLanguage = authStore((s) => s.session?.user.language);
  const { data: me } = useQuery({
    queryKey: ['driver-me'],
    queryFn: () => driverApi.me(),
    enabled: Boolean(accessToken),
    staleTime: 0,
  });

  const locale = useMemo(
    () => normalizeLocale(me?.user.language ?? sessionLanguage),
    [me?.user.language, sessionLanguage],
  );

  initI18n(locale);
  const { t, i18n } = useI18nextTranslation('common');

  useEffect(() => {
    if (i18n.language === locale) return;
    void setAppLanguage(locale);
  }, [i18n.language, locale]);

  useEffect(() => {
    const rtl = isRtlLocale(locale);
    if (I18nManager.isRTL !== rtl) {
      I18nManager.allowRTL(rtl);
      I18nManager.forceRTL(rtl);
    }
  }, [locale]);

  return useMemo(
    () => ({
      locale,
      t: (key: string, params?: Record<string, string | number>) => t(key, params),
      formatDate: (date?: Date) => formatAppDate(locale, date),
      formatDateTime: (value?: string | Date | null) => formatAppDateTime(locale, value),
      formatCurrency: (amount?: number | null) => formatAppCurrency(locale, amount),
    }),
    [locale, t],
  );
}

export function useLocale(): AppLocale {
  return useTranslation().locale;
}
