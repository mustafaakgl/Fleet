'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

type DriverPortalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function DriverPortalError({ error, reset }: DriverPortalErrorProps) {
  const { t } = useTranslation();

  useEffect(() => {
    console.error('[driver-portal] route error', error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="rounded-full bg-red-50 p-3">
        <AlertTriangle className="h-7 w-7 text-red-600" />
      </div>
      <h2 className="text-xl font-semibold text-slate-900">{t('common.error')}</h2>
      <p className="text-sm text-slate-600">{t('common.pageErrorBody')}</p>
      <Button type="button" onClick={reset}>
        {t('common.retry')}
      </Button>
    </div>
  );
}
