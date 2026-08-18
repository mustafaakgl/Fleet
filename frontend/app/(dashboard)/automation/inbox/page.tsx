'use client';

import { FileStack } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DocumentInboxScreen } from '@/components/ordivan/DocumentInboxScreen';
import { FLEET_PAGE, FLEET_PAGE_HEADER, FLEET_PAGE_TITLE } from '@/lib/fleet-table';

export default function DocumentInboxPage() {
  const { t } = useTranslation();

  return (
    <div className={FLEET_PAGE}>
      <div className={`${FLEET_PAGE_HEADER} flex items-center gap-3`}>
        <FileStack className="h-8 w-8 text-blue-700" />
        <h1 className={FLEET_PAGE_TITLE}>{t('documentInbox.title')}</h1>
      </div>
      <DocumentInboxScreen />
    </div>
  );
}
