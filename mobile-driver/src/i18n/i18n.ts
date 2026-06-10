import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import ar from '../locales/ar/common.json';
import bg from '../locales/bg/common.json';
import de from '../locales/de/common.json';
import en from '../locales/en/common.json';
import es from '../locales/es/common.json';
import fr from '../locales/fr/common.json';
import it from '../locales/it/common.json';
import nl from '../locales/nl/common.json';
import pl from '../locales/pl/common.json';
import ro from '../locales/ro/common.json';
import ru from '../locales/ru/common.json';
import tr from '../locales/tr/common.json';
import uk from '../locales/uk/common.json';
import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  normalizeLocale,
  type AppLocale,
} from './languages';

const resources = {
  de: { common: de },
  en: { common: en },
  tr: { common: tr },
  pl: { common: pl },
  ro: { common: ro },
  bg: { common: bg },
  ar: { common: ar },
  uk: { common: uk },
  fr: { common: fr },
  it: { common: it },
  es: { common: es },
  nl: { common: nl },
  ru: { common: ru },
} as const;

function detectDeviceLocale(): AppLocale {
  const deviceLocales = Localization.getLocales();
  for (const locale of deviceLocales) {
    const code = locale.languageCode?.toLowerCase();
    if (code && isSupportedLocale(code)) {
      return code;
    }
  }
  return DEFAULT_LOCALE;
}

let initialized = false;

export function initI18n(initialLocale?: string | null): AppLocale {
  const lng = normalizeLocale(initialLocale ?? detectDeviceLocale());

  if (!initialized) {
    void i18n.use(initReactI18next).init({
      resources,
      lng,
      fallbackLng: DEFAULT_LOCALE,
      supportedLngs: [...Object.keys(resources)],
      defaultNS: 'common',
      ns: ['common'],
      interpolation: { escapeValue: false },
      compatibilityJSON: 'v4',
      returnNull: false,
    });
    initialized = true;
  } else if (i18n.language !== lng) {
    void i18n.changeLanguage(lng);
  }

  return lng;
}

export async function setAppLanguage(locale: AppLocale): Promise<void> {
  await i18n.changeLanguage(locale);
}

export default i18n;
