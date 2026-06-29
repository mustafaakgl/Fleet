'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Info, Navigation } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { driverPortalApi } from '@/lib/api';
import { driverTodayIso } from '@/lib/driver-portal-utils';
import { cn } from '@/lib/utils';
import type { DriverHandover, DriverLocationStatus, DriverMorningCheckin } from '@/lib/types';

type BannerTone = 'info' | 'success' | 'warning' | 'action';

function toneClass(tone: BannerTone): string {
  if (tone === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (tone === 'warning') return 'border-amber-200 bg-amber-50 text-amber-900';
  if (tone === 'action') return 'border-brand-primary/20 bg-blue-50 text-brand-primary';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

export function DriverDayStatusBanner() {
  const { t } = useTranslation();
  const [checkin, setCheckin] = useState<DriverMorningCheckin | null>(null);
  const [status, setStatus] = useState<DriverLocationStatus | null>(null);
  const [pendingHandover, setPendingHandover] = useState<DriverHandover | null>(null);

  useEffect(() => {
    const today = driverTodayIso();
    Promise.all([
      driverPortalApi.listMorningCheckins(today),
      driverPortalApi.getLocationStatus(),
      driverPortalApi.listHandovers({ date: today, photoStatus: 'missing' }),
    ])
      .then(([checkins, locationStatus, handovers]) => {
        setCheckin(checkins[0] ?? null);
        setStatus(locationStatus);
        setPendingHandover(
          handovers.find((row) => row.photoRequired && row.status !== 'completed') ?? null,
        );
      })
      .catch(() => {
        setCheckin(null);
        setStatus(null);
      });
  }, []);

  const sharingActive = Boolean(status?.sharingActive);
  const trackingActive = Boolean(status?.trackingAllowed) && sharingActive;
  const checkinStatus = checkin?.status;

  let message = t('driverPortal.dayStatus.noCheckin');
  let tone: BannerTone = 'action';
  let href: string | null = '/driver/morning-checkin';
  let ctaLabel: string | null = t('driverPortal.dayStatus.ctaCheckin');

  if (checkin && pendingHandover?.assignmentId && pendingHandover.vehicleId) {
    message = t('driverPortal.dayStatus.handoverRequired');
    tone = 'action';
    href = `/driver/handover?assignmentId=${pendingHandover.assignmentId}&vehicleId=${pendingHandover.vehicleId}`;
    ctaLabel = t('driverPortal.dayStatus.ctaHandover');
  } else if (checkinStatus === 'waiting_for_review') {
    message = t('driverPortal.dayStatus.waitingReview');
    tone = 'warning';
    href = null;
    ctaLabel = null;
  } else if (checkinStatus === 'rejected') {
    message = t('driverPortal.dayStatus.rejected');
    tone = 'warning';
    href = '/driver/messages';
    ctaLabel = t('driverPortal.dayStatus.ctaContact');
  } else if (checkinStatus === 'added_to_einsatzplan' || checkinStatus === 'confirmed') {
    if (trackingActive) {
      message = t('driverPortal.dayStatus.trackingActive');
      tone = 'success';
      href = null;
      ctaLabel = null;
    } else if (sharingActive) {
      message = t('driverPortal.dayStatus.sharingWaitingGps');
      tone = 'info';
      href = null;
      ctaLabel = null;
    } else {
      message = t('driverPortal.dayStatus.approvedStartJourney');
      tone = 'action';
      href = null;
      ctaLabel = null;
    }
  } else if (checkin) {
    message = t('driverPortal.dayStatus.submitted');
    tone = 'info';
    href = null;
    ctaLabel = null;
  }

  const content = (
    <div className={cn('flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm', toneClass(tone))}>
      {trackingActive ? (
        <Navigation className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <div>
        <p className="font-medium">{message}</p>
        {ctaLabel ? <p className="mt-1 text-xs font-semibold text-brand-primary">{ctaLabel}</p> : null}
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}
