'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Abteilungskalender } from './Abteilungskalender';
import { Jahreskalender } from './Jahreskalender';
import { BRAND_TAB_ACTIVE_PLAIN } from '@/lib/brand-colors';
import { cn } from '@/lib/utils';
import { Antragsverwaltung } from './Antragsverwaltung';

type PlannerSubtab = 'jahreskalender' | 'abteilungskalender' | 'antragsverwaltung';
type AbsenceFocus = 'UT' | 'KT';

const subtabs: Array<{ id: PlannerSubtab; labelKey: string }> = [
  { id: 'jahreskalender', labelKey: 'vacationPlanner.yearly' },
  { id: 'abteilungskalender', labelKey: 'vacationPlanner.department' },
  { id: 'antragsverwaltung', labelKey: 'vacationPlanner.requests' },
];

export function UrlaubsplanerPanel({
  initialSubtab,
  initialAbsenceFocus,
}: {
  initialSubtab?: PlannerSubtab;
  initialAbsenceFocus?: AbsenceFocus;
}) {
  const { t } = useTranslation('einsatzplan');
  const [activeSubtab, setActiveSubtab] = useState<PlannerSubtab>(initialSubtab ?? 'jahreskalender');

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900">{t('einsatzplan.vacationPlanner')}</h2>
        <p className="text-sm text-slate-600">{t('vacationPlanner.subtitle')}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {subtabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveSubtab(tab.id)}
            className={cn(
              'rounded-md border px-3 py-2 text-sm font-medium',
              activeSubtab === tab.id
                ? BRAND_TAB_ACTIVE_PLAIN
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
            )}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {activeSubtab === 'jahreskalender' && <Jahreskalender />}
      {activeSubtab === 'abteilungskalender' && <Abteilungskalender statusFocus={initialAbsenceFocus} />}
      {activeSubtab === 'antragsverwaltung' && <Antragsverwaltung />}
    </div>
  );
}
