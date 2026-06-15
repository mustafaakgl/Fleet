import { PropsWithChildren, useEffect, useMemo } from 'react';
import { I18nManager } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { driverApi } from '@/api/endpoints';
import { authStore } from '@/features/auth/store';
import { initI18n, setAppLanguage } from '@/i18n/i18n';
import { isRtlLocale, normalizeLocale } from '@/i18n/languages';

export function LanguageSyncProvider({ children }: PropsWithChildren) {
  const hydrated = authStore((s) => s.hydrated);
  const accessToken = authStore((s) => s.accessToken);
  const sessionLanguage = authStore((s) => s.session?.user.language);

  const { data: me } = useQuery({
    queryKey: ['driver-me'],
    queryFn: () => driverApi.me(),
    enabled: Boolean(accessToken),
    staleTime: 0,
  });

  const locale = useMemo(() => {
    if (!accessToken) {
      return null;
    }
    return normalizeLocale(me?.user.language ?? sessionLanguage);
  }, [accessToken, me?.user.language, sessionLanguage]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    initI18n(locale ?? undefined);
  }, [hydrated, locale]);

  useEffect(() => {
    if (!hydrated || !accessToken || !locale) {
      return;
    }
    void setAppLanguage(locale);
  }, [hydrated, accessToken, locale]);

  useEffect(() => {
    if (!hydrated || !accessToken || !locale) {
      return;
    }
    const rtl = isRtlLocale(locale);
    if (I18nManager.isRTL !== rtl) {
      I18nManager.allowRTL(rtl);
      I18nManager.forceRTL(rtl);
    }
  }, [hydrated, accessToken, locale]);

  return children;
}
