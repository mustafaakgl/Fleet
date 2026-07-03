'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RemainingDrivingRadial } from '@/components/tachograph/RemainingDrivingRadial';
import { coolantTempClass, voltageClass } from '@/lib/driver-score-intensity';
import type { LiveTrackingItem, TachographRemainingDriver, TelematicsVehicleHealthItem } from '@/lib/types';
import { cn } from '@/lib/utils';
import { einsatzplanHref, liveTrackingHref } from '@/lib/office-deep-links';
import { LocationSourceBadge } from './LocationSourceBadge';
import {
  estimateIdleFuelLabel,
  formatSpeed,
  formatTrackingTimestamp,
  isAlarmItem,
  motionBadgeClass,
} from './tracking-utils';

interface LiveTrackingDetailProps {
  item: LiveTrackingItem | null;
  remaining: TachographRemainingDriver | null;
  vehicleHealth: TelematicsVehicleHealthItem | null;
  followMode: boolean;
  onFollowModeChange: (value: boolean) => void;
}

export function LiveTrackingDetail({
  item,
  remaining,
  vehicleHealth,
  followMode,
  onFollowModeChange,
}: LiveTrackingDetailProps) {
  const { t } = useTranslation();

  if (!item) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
        {t('liveTracking.selectHint')}
      </div>
    );
  }

  const sessionEnded = item.status === 'offline';
  const idleMinutes = item.idleSinceMs ? Math.max(0, Math.floor((Date.now() - item.idleSinceMs) / 60_000)) : 0;

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{item.driverName}</p>
          <p className="text-base font-semibold text-slate-900">{item.plateNumber ?? t('liveTracking.noVehicle')}</p>
          <p className="text-xs text-slate-500">{formatTrackingTimestamp(item.receivedAt)}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Badge className={motionBadgeClass(item.motionState)}>{t(`liveTracking.motion.${item.motionState}`)}</Badge>
          {isAlarmItem(item) ? <Badge className="bg-red-100 text-red-700 border border-red-200">{t('liveTracking.motion.alarm')}</Badge> : null}
          <LocationSourceBadge source={item.locationSource} />
        </div>
      </div>

      <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
        <span className="text-slate-700">{t('liveTracking.followMode')}</span>
        <button
          type="button"
          onClick={() => onFollowModeChange(!followMode)}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-medium transition-colors',
            followMode ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700',
          )}
          data-testid="follow-mode-toggle"
        >
          {followMode ? t('common.on') : t('common.off')}
        </button>
      </div>

      {sessionEnded ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {t('liveTracking.sessionClosed')}
        </p>
      ) : null}

      {remaining ? (
        <div className="rounded-md border border-slate-200 bg-white p-2" data-testid="remaining-block">
          <RemainingDrivingRadial driver={remaining} t={t} estimated={remaining.isStale} />
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
          {t('liveTracking.unassignedDriver')}
        </div>
      )}

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-slate-500">{t('liveTracking.telemetry.speed')}</dt>
          <dd className="font-medium text-slate-900">{formatSpeed(item.speedKmh)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">{t('liveTracking.telemetry.fuel')}</dt>
          <dd className="font-medium text-slate-900">{vehicleHealth?.telemetry?.fuelLevelPct != null ? `${Math.round(vehicleHealth.telemetry.fuelLevelPct)}%` : '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">{t('liveTracking.telemetry.ignition')}</dt>
          <dd className="font-medium text-slate-900">{vehicleHealth?.telemetry ? (vehicleHealth.telemetry.ignition ? t('liveTracking.ignitionOn') : t('liveTracking.ignitionOff')) : '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">{t('liveTracking.telemetry.voltage')}</dt>
          <dd className={cn('font-medium', voltageClass(vehicleHealth?.telemetry?.voltage ?? null))}>
            {vehicleHealth?.telemetry?.voltage != null ? `${vehicleHealth.telemetry.voltage.toFixed(1)} V` : '—'}
          </dd>
        </div>
      </dl>

      {item.motionState === 'idle' && item.idleSinceMs ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          ⏱ {idleMinutes} dk {t('liveTracking.idlingFor')} ({estimateIdleFuelLabel(item.idleSinceMs)})
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
        {item.vehicleId ? (
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/telematics/vehicle-health?vehicleId=${item.vehicleId}`}>{t('liveTracking.openVehicleHealth')}</Link>
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/tachograph/compliance?driverId=${item.driverId}`}>{t('liveTracking.openCompliance')}</Link>
        </Button>
      </div>
    </div>
  );
}
