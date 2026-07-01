'use client';

import { useTranslation } from 'react-i18next';
import { Wrench } from 'lucide-react';

type UnderConstructionProps = {
  /** i18n key for the page title (e.g. a nav label). */
  titleKey: string;
};

export function UnderConstruction({ titleKey }: UnderConstructionProps) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
        <Wrench className="h-7 w-7" />
      </div>
      <h1 className="text-xl font-semibold text-slate-800">{t(titleKey)}</h1>
      <p className="max-w-md text-sm text-slate-500">{t('common.underConstruction.desc')}</p>
      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
        {t('common.underConstruction.title')}
      </span>
    </div>
  );
}

export default UnderConstruction;
