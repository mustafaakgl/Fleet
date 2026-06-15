import { useMemo } from 'react';
import { useTranslation as useI18nextTranslation } from 'react-i18next';
import { formatAppCurrency, formatAppDate, formatAppDateTime } from './format';
import { normalizeLocale, type AppLocale } from './languages';

export function useTranslation() {
  const { t, i18n } = useI18nextTranslation('common');
  const locale = normalizeLocale(i18n.language);

  return useMemo(
    () => ({
      locale,
      t: (key: string, params?: Record<string, string | number>) => t(key, params),
      formatDate: (date?: Date) => formatAppDate(locale, date),
      formatDateTime: (value?: string | Date | null) => formatAppDateTime(locale, value),
      formatCurrency: (amount?: number | null) => formatAppCurrency(locale, amount),
    }),
    [i18n.language, locale, t],
  );
}

export function useLocale(): AppLocale {
  return useTranslation().locale;
}
