'use client';

import { useTranslation } from 'react-i18next';
import { SecuritySettingsPanel } from '@/components/security/SecuritySettingsPanel';

export default function SecurityPage() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-2xl space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">{t('security.title')}</h1>
        <p className="mt-1 text-sm text-gray-600">{t('security.subtitle')}</p>
      </div>
      <SecuritySettingsPanel />
    </div>
  );
}
