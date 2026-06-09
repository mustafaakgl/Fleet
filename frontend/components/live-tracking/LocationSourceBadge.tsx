'use client';

import { Radio, SatelliteDish } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LocationSourceType } from '@/lib/types';
import { cn } from '@/lib/utils';
import { sourceBadgeClass } from './tracking-utils';

interface LocationSourceBadgeProps {
  source: LocationSourceType | null | undefined;
  className?: string;
}

export function LocationSourceBadge({ source, className }: LocationSourceBadgeProps) {
  const { t } = useTranslation();

  if (!source) {
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
          sourceBadgeClass(null),
          className,
        )}
      >
        {t('liveTracking.source.unknown')}
      </span>
    );
  }

  const Icon = source === 'telematics' ? SatelliteDish : Radio;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        sourceBadgeClass(source),
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {t(`liveTracking.source.${source}`)}
    </span>
  );
}
