'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { PayrollDriversPanel } from '@/components/payroll/PayrollDriversPanel';
import { PayrollPeriodPanel } from '@/components/payroll/PayrollPeriodPanel';
import { PayrollSettingsPanel } from '@/components/payroll/PayrollSettingsPanel';

type PayrollTab = 'period' | 'drivers' | 'settings';

const TABS: Array<{ id: PayrollTab; labelKey: string }> = [
  { id: 'period', labelKey: 'payroll.tab.period' },
  { id: 'drivers', labelKey: 'payroll.tab.drivers' },
  { id: 'settings', labelKey: 'payroll.tab.settings' },
];

/**
 * Bordro hazirligi (Lohnvorbereitung).
 *
 * DATEV Rechnungswesen tarafindaki /invoicing'den AYRI: orasi alacak, burasi
 * personel. Iki DATEV urunu ve iki farkli muhatap; ayni ekranda birlestirmek
 * yanlis dosyanin yanlis muhasebeye gitmesini kolaylastirirdi.
 */
export default function PayrollPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<PayrollTab>('period');

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{t('payroll.title')}</h1>
        <p className="mt-1 text-sm text-slate-600">{t('payroll.subtitle')}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((entry) => (
          <Button
            key={entry.id}
            variant={tab === entry.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTab(entry.id)}
          >
            {t(entry.labelKey)}
          </Button>
        ))}
      </div>

      {tab === 'period' ? <PayrollPeriodPanel /> : null}
      {tab === 'drivers' ? <PayrollDriversPanel /> : null}
      {tab === 'settings' ? <PayrollSettingsPanel /> : null}
    </div>
  );
}
