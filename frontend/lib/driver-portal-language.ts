import type { MessengerLanguage } from '@/lib/types';
import i18n from '@/src/i18n.client';
import { isSupportedLanguage, type SupportedLanguage } from '@/src/language';

/** Map driver profile language to a UI locale we currently ship. */
export function driverLanguageToUi(language?: string | null): SupportedLanguage {
  if (isSupportedLanguage(language)) {
    return language;
  }
  return 'de';
}

export async function applyDriverPortalLanguage(language?: string | null): Promise<SupportedLanguage> {
  const uiLanguage = driverLanguageToUi(language);
  if (i18n.language !== uiLanguage) {
    await i18n.changeLanguage(uiLanguage);
  }
  return uiLanguage;
}

export function isDriverPortalUiLanguage(language: MessengerLanguage): language is SupportedLanguage {
  return isSupportedLanguage(language);
}
