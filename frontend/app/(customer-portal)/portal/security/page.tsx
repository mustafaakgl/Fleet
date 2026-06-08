'use client';

import { useTranslation } from 'react-i18next';
import { CustomerPortalShell } from '@/components/customer-portal/CustomerPortalShell';
import { SecuritySettingsPanel } from '@/components/security/SecuritySettingsPanel';

export default function CustomerSecurityPage() {
  const { t } = useTranslation();

  return (
    <CustomerPortalShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{t('security.title')}</h1>
          <p className="mt-1 text-sm text-gray-600">{t('security.subtitle')}</p>
        </div>
        <SecuritySettingsPanel />
      </div>
    </CustomerPortalShell>
  );
}
