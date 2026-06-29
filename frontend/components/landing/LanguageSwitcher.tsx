'use client';

import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/src/language';

const labels: Record<SupportedLanguage, string> = {
  de: 'DE',
  en: 'EN',
  tr: 'TR',
};

export function LanguageSwitcher() {
  const { i18n } = useTranslation('landing');

  return (
    <div className="flex items-center rounded-full border border-slate-200 bg-slate-50 p-0.5">
      {SUPPORTED_LANGUAGES.map((lng) => (
        <button
          key={lng}
          type="button"
          onClick={() => i18n.changeLanguage(lng)}
          className={`rounded-full px-2.5 py-1 text-xs font-bold transition ${
            i18n.language === lng
              ? 'bg-brand-primary text-white'
              : 'text-slate-600 hover:text-brand-primary'
          }`}
        >
          {labels[lng]}
        </button>
      ))}
    </div>
  );
}
