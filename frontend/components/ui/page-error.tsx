'use client';

import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isNetworkError } from '@/lib/api-errors';

type PageErrorProps = {
  error: unknown;
  titleKey?: string;
  onRetry?: () => void;
};

export function PageError({ error, titleKey = 'errors.loadFailed', onRetry }: PageErrorProps) {
  const { t } = useTranslation();
  const network = isNetworkError(error);
  const Icon = network ? WifiOff : AlertTriangle;

  const rawMessage =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : '';
  const subtitle = network
    ? t('errors.networkHint')
    : rawMessage.startsWith('errors.')
      ? t(rawMessage)
      : rawMessage || t('errors.generic');

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
      <div className="mb-3 rounded-full bg-white p-3 shadow-sm">
        <Icon className="h-7 w-7 text-amber-600" />
      </div>
      <p className="text-base font-semibold text-slate-900">{t(titleKey)}</p>
      <p className="mt-2 max-w-md text-sm text-slate-600">{subtitle}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <RefreshCw className="h-4 w-4" />
          {t('errors.retry')}
        </button>
      ) : null}
    </div>
  );
}
