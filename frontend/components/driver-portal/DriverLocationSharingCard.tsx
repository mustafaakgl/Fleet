'use client';

import { Loader2, MapPinned, Radio } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDriverWebLocation } from '@/hooks/useDriverWebLocation';
import { cn } from '@/lib/utils';

function formatTimestamp(value: string | null | undefined, locale: string): string {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'medium' }).format(
      new Date(value),
    );
  } catch {
    return value;
  }
}

export function DriverLocationSharingCard() {
  const { t, i18n } = useTranslation();
  const {
    status,
    loading,
    busy,
    permissionDenied,
    unsupported,
    lastUploadAt,
    uploadError,
    pageVisible,
    trackingActive,
    grantConsent,
    startSharing,
    endSharing,
  } = useDriverWebLocation();

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-8 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('driverPortal.location.loading')}
        </CardContent>
      </Card>
    );
  }

  if (unsupported) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-slate-600">
          {t('driverPortal.location.unsupported')}
        </CardContent>
      </Card>
    );
  }

  const needsConsent = !status?.consentGranted || permissionDenied;
  const sharingActive = Boolean(status?.sharingActive);
  const canShareToday = Boolean(status?.hasTrackableAssignmentToday);

  const statusLabel = trackingActive
    ? t('driverPortal.location.active')
    : !pageVisible && sharingActive
      ? t('driverPortal.location.pausedHidden')
      : sharingActive
        ? t('driverPortal.location.waitingGps')
        : permissionDenied
          ? t('driverPortal.location.permissionDenied')
          : needsConsent
            ? t('driverPortal.location.consentNeeded')
            : t('driverPortal.location.stopped');

  const statusTone = trackingActive
    ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
    : permissionDenied
      ? 'text-red-700 bg-red-50 border-red-200'
      : sharingActive
        ? 'text-amber-700 bg-amber-50 border-amber-200'
        : 'text-slate-600 bg-slate-50 border-slate-200';

  return (
    <Card className="overflow-hidden border-[#1a4d7a]/15">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPinned className="h-5 w-5 text-[#1a4d7a]" />
          {t('driverPortal.location.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={cn('rounded-lg border px-3 py-2 text-sm font-medium', statusTone)}>
          <span className="inline-flex items-center gap-2">
            <Radio className="h-4 w-4" />
            {statusLabel}
          </span>
        </div>

        {!canShareToday ? (
          <p className="text-sm text-amber-800">{t('driverPortal.location.noAssignmentToday')}</p>
        ) : null}

        {!pageVisible && sharingActive ? (
          <p className="text-sm text-amber-800">{t('driverPortal.location.keepPageOpen')}</p>
        ) : null}

        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">{t('driverPortal.location.lastUpload')}</dt>
            <dd className="font-medium text-slate-900">
              {formatTimestamp(lastUploadAt ?? status?.lastUpload?.receivedAt, i18n.language)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">{t('driverPortal.location.sessionStarted')}</dt>
            <dd className="font-medium text-slate-900">
              {formatTimestamp(status?.sharingStartedAt, i18n.language)}
            </dd>
          </div>
        </dl>

        {uploadError ? <p className="text-sm text-red-600">{uploadError}</p> : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          {needsConsent ? (
            <Button
              type="button"
              className="bg-[#1a4d7a] hover:bg-[#163a5c]"
              disabled={busy || !canShareToday}
              onClick={() => void grantConsent()}
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('driverPortal.location.allowGps')}
            </Button>
          ) : null}

          {!needsConsent && !sharingActive ? (
            <Button
              type="button"
              className="bg-[#1a4d7a] hover:bg-[#163a5c]"
              disabled={busy || !canShareToday}
              onClick={() => void startSharing()}
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('driverPortal.location.startJourney')}
            </Button>
          ) : null}

          {sharingActive ? (
            <Button type="button" variant="outline" disabled={busy} onClick={() => void endSharing()}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('driverPortal.location.endJourney')}
            </Button>
          ) : null}
        </div>

        <p className="text-xs text-slate-500">{t('driverPortal.location.hint')}</p>
      </CardContent>
    </Card>
  );
}
