'use client';

import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export type LicenseComplianceBadge = 'green' | 'yellow' | 'red';

const STYLES: Record<LicenseComplianceBadge, string> = {
  green: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  yellow: 'bg-amber-100 text-amber-900 border-amber-200',
  red: 'bg-red-100 text-red-800 border-red-200',
};

export function LicenseComplianceBadgePill({
  badge,
  className,
}: {
  badge?: LicenseComplianceBadge | string | null;
  className?: string;
}) {
  const { t } = useTranslation();

  if (!badge || !(badge in STYLES)) {
    return <span className={cn('text-xs text-gray-400', className)}>—</span>;
  }

  const key = badge as LicenseComplianceBadge;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        STYLES[key],
        className,
      )}
      title={t('licenseCompliance.badge.title')}
    >
      {t(`licenseCompliance.badge.${key}`)}
    </span>
  );
}
