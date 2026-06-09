'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { LiveTrackingItem } from '@/lib/types';
import { einsatzplanHref, liveTrackingHref } from '@/lib/office-deep-links';
import { LocationSourceBadge } from './LocationSourceBadge';
import {
  formatSpeed,
  formatTrackingTimestamp,
  statusBadgeVariant,
} from './tracking-utils';

interface LiveTrackingDetailProps {
  item: LiveTrackingItem | null;
}

export function LiveTrackingDetail({ item }: LiveTrackingDetailProps) {
  const { t } = useTranslation();

  if (!item) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
        {t('liveTracking.selectHint')}
      </div>
    );
  }

  const sessionEnded = item.status === 'offline';

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-slate-900">
            {item.plateNumber ?? t('liveTracking.noVehicle')}
          </p>
          <p className="text-sm text-slate-600">{item.driverName}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Badge variant={statusBadgeVariant(item.status)} className="capitalize">
            {item.status}
          </Badge>
          <LocationSourceBadge source={item.locationSource} />
        </div>
      </div>

      {sessionEnded ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {t('liveTracking.sessionClosed')}
        </p>
      ) : null}

      <dl className="grid grid-cols-1 gap-2 text-sm">
        <div>
          <dt className="text-slate-500">{t('dashboard.company')}</dt>
          <dd className="font-medium text-slate-900">{item.companyName ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Cargo</dt>
          <dd className="font-medium text-slate-900">{item.cargoName ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Speed</dt>
          <dd className="font-medium text-slate-900">{formatSpeed(item.speedKmh)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">{t('liveTracking.filter.source')}</dt>
          <dd>
            <LocationSourceBadge source={item.locationSource} />
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">{t('liveTracking.lastUpdate')}</dt>
          <dd className="font-medium text-slate-900">{formatTrackingTimestamp(item.receivedAt)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Recorded at</dt>
          <dd className="font-medium text-slate-900">{formatTrackingTimestamp(item.recordedAt)}</dd>
        </div>
        {item.accuracyM !== null && item.accuracyM !== undefined ? (
          <div>
            <dt className="text-slate-500">Accuracy</dt>
            <dd className="font-medium text-slate-900">{Math.round(item.accuracyM)} m</dd>
          </div>
        ) : null}
      </dl>

      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
        {item.assignmentId ? (
          <Button variant="outline" size="sm" asChild>
            <Link
              href={einsatzplanHref({
                panel: 'tagesplanung',
                view: 'daily-overview',
              })}
            >
              {t('liveTracking.openAssignment')}
            </Link>
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" asChild>
          <Link href={liveTrackingHref(item.driverId, item.assignmentId ?? undefined)}>
            {t('liveTracking.openOnMap')}
          </Link>
        </Button>
      </div>
    </div>
  );
}
