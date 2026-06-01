'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Abteilungskalender } from './Abteilungskalender';
import { Jahreskalender } from './Jahreskalender';
import { Antragsverwaltung } from './Antragsverwaltung';

type PlannerSubtab = 'jahreskalender' | 'abteilungskalender' | 'antragsverwaltung';
type AbsenceFocus = 'UT' | 'KT';

const subtabs: Array<{ id: PlannerSubtab; label: string }> = [
  { id: 'jahreskalender', label: 'Jahreskalender' },
  { id: 'abteilungskalender', label: 'Abteilungskalender' },
  { id: 'antragsverwaltung', label: 'Antragsverwaltung' },
];

export function UrlaubsplanerPanel({
  initialSubtab,
  initialAbsenceFocus,
}: {
  initialSubtab?: PlannerSubtab;
  initialAbsenceFocus?: AbsenceFocus;
}) {
  const { t } = useTranslation();
  const [activeSubtab, setActiveSubtab] = useState<PlannerSubtab>(initialSubtab ?? 'jahreskalender');

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900">{t('einsatzplan.vacationPlanner')}</h2>
        <p className="text-sm text-slate-600">Yearly and department leave planning with compact ERP-style calendar views.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {subtabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveSubtab(tab.id)}
            className={`rounded-md border px-3 py-2 text-sm font-medium ${
              activeSubtab === tab.id
                ? 'border-blue-700 bg-blue-700 text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeSubtab === 'jahreskalender' && <Jahreskalender />}
      {activeSubtab === 'abteilungskalender' && <Abteilungskalender statusFocus={initialAbsenceFocus} />}
      {activeSubtab === 'antragsverwaltung' && <Antragsverwaltung />}
    </div>
  );
}
