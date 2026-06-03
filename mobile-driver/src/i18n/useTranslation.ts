import { useMemo } from 'react';
import { authStore } from '@/features/auth/store';
import { useQuery } from '@tanstack/react-query';
import { driverApi } from '@/api/endpoints';
import { formatAppDate } from './format';
import { normalizeLocale, t, type AppLocale } from './translations';

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

  return useMemo(
    () => ({
      locale,
      t: (key: string, params?: Record<string, string | number>) => t(locale, key, params),
      formatDate: (date?: Date) => formatAppDate(locale, date),
    }),
    [locale],
  );
}

export function useLocale(): AppLocale {
  return useTranslation().locale;
}
