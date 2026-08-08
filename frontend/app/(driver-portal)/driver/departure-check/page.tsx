'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DriverFileInput } from '@/components/driver-portal/DriverFileInput';
import { DriverPageBack } from '@/components/driver-portal/DriverPageBack';
import { DriverPortalShell } from '@/components/driver-portal/DriverPortalShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { driverPortalApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import type {
  DefectSeverity,
  DepartureCheckItemInput,
  DepartureCheckItemStatus,
  DriverDepartureCheckStatus,
} from '@/lib/types';

/**
 * Abfahrtskontrolle — the daily vehicle check the driver owes before setting off.
 *
 * A defect never blocks departure: it is recorded, routed to the office and the
 * driver drives on. What can block is the vehicle already carrying an open
 * critical defect, and that rule lives in the backend (`blocks_departure_check`),
 * so this screen only reports it.
 */

const SEVERITIES: DefectSeverity[] = ['gering', 'mittel', 'kritisch'];

interface ItemState {
  result: DepartureCheckItemStatus | null;
  description: string;
  severity: DefectSeverity;
  photos: File[];
}

const emptyItem = (): ItemState => ({
  result: null,
  description: '',
  severity: 'mittel',
  photos: [],
});

export default function DriverDepartureCheckPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [status, setStatus] = useState<DriverDepartureCheckStatus | null>(null);
  const [items, setItems] = useState<Record<string, ItemState>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    driverPortalApi
      .departureCheckStatus()
      .then((result) => {
        if (!active) return;
        setStatus(result);
        setItems(
          Object.fromEntries((result.template?.items ?? []).map((item) => [item.item_key, emptyItem()])),
        );
      })
      .catch(() => {
        if (active) setError(t('driverPortal.departureCheck.loadFailed'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [t]);

  const templateItems = useMemo(
    () => [...(status?.template?.items ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    [status],
  );

  const update = useCallback((key: string, patch: Partial<ItemState>) => {
    setItems((prev) => ({ ...prev, [key]: { ...(prev[key] ?? emptyItem()), ...patch } }));
  }, []);

  const unanswered = templateItems.filter((item) => !items[item.item_key]?.result);
  const missingPhoto = templateItems.filter((item) => {
    const state = items[item.item_key];
    return item.requires_photo_on_defect && state?.result === 'defekt' && state.photos.length === 0;
  });
  const missingDescription = templateItems.filter((item) => {
    const state = items[item.item_key];
    return state?.result === 'defekt' && !state.description.trim();
  });

  const handleSubmit = useCallback(async () => {
    if (!status?.assignment) return;
    setBusy(true);
    setError(null);
    try {
      const payloadItems: DepartureCheckItemInput[] = templateItems.map((item) => {
        const state = items[item.item_key];
        return {
          item_key: item.item_key,
          result: state?.result ?? 'na',
          ...(state?.result === 'defekt'
            ? { defect_description: state.description.trim(), defect_severity: state.severity }
            : {}),
        };
      });

      const photos = Object.fromEntries(
        templateItems
          .map((item) => [item.item_key, items[item.item_key]?.photos ?? []] as const)
          .filter(([, files]) => files.length > 0),
      );

      await driverPortalApi.submitDepartureCheck(
        {
          vehicle_id: status.assignment.vehicle_id,
          assignment_id: status.assignment.id,
          items: payloadItems,
        },
        photos,
      );
      router.replace('/driver');
    } catch {
      setError(t('driverPortal.departureCheck.submitFailed'));
      setBusy(false);
    }
  }, [items, router, status, t, templateItems]);

  const body = () => {
    if (loading) {
      return (
        <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('driverPortal.assignments.loading')}
        </div>
      );
    }

    if (!status?.required) {
      return <p className="py-6 text-sm text-slate-600">{t('driverPortal.departureCheck.notRequired')}</p>;
    }

    if (status.completed_today) {
      return (
        <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="h-4 w-4" />
            {t('driverPortal.departureCheck.alreadyDoneTitle')}
          </p>
          <p>{t('driverPortal.departureCheck.alreadyDoneBody')}</p>
        </div>
      );
    }

    // Not the driver's newly found defect — the vehicle already carries an open
    // critical one, and the backend refuses the check until the office clears it.
    if (!status.can_submit && status.vehicle_compliance?.blocks_departure_check) {
      return (
        <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" />
            {t('driverPortal.departureCheck.blockedTitle')}
          </p>
          <p>{t('driverPortal.departureCheck.blockedBody')}</p>
          <ul className="list-disc space-y-1 pl-5">
            {status.vehicle_compliance.open_critical_defects.map((defect) => (
              <li key={defect.id}>{defect.title}</li>
            ))}
          </ul>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-600">{t('driverPortal.departureCheck.intro')}</p>

        {templateItems.map((item) => {
          const state = items[item.item_key] ?? emptyItem();
          return (
            <div key={item.item_key} className="rounded-lg border border-slate-200 p-3">
              <p className="font-medium text-slate-900">{item.label}</p>
              {item.description ? (
                <p className="mt-0.5 text-xs text-slate-600">{item.description}</p>
              ) : null}

              <div className="mt-3 grid grid-cols-3 gap-2">
                {(['ok', 'defekt', 'na'] as const).map((result) => (
                  <button
                    key={result}
                    type="button"
                    onClick={() => update(item.item_key, { result })}
                    className={cn(
                      'min-h-11 rounded-md border text-sm font-medium transition',
                      state.result === result
                        ? result === 'ok'
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : result === 'defekt'
                            ? 'border-red-600 bg-red-600 text-white'
                            : 'border-slate-500 bg-slate-500 text-white'
                        : 'border-slate-300 bg-white text-slate-700',
                    )}
                  >
                    {t(`driverPortal.departureCheck.result.${result}`)}
                  </button>
                ))}
              </div>

              {state.result === 'defekt' ? (
                <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
                  <div className="space-y-1.5">
                    <Label>{t('driverPortal.departureCheck.defectDescription')} *</Label>
                    <Input
                      value={state.description}
                      onChange={(e) => update(item.item_key, { description: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('driverPortal.departureCheck.defectSeverity')}</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {SEVERITIES.map((severity) => (
                        <button
                          key={severity}
                          type="button"
                          onClick={() => update(item.item_key, { severity })}
                          className={cn(
                            'min-h-11 rounded-md border text-sm font-medium transition',
                            state.severity === severity
                              ? 'border-amber-600 bg-amber-600 text-white'
                              : 'border-slate-300 bg-white text-slate-700',
                          )}
                        >
                          {t(`driverPortal.departureCheck.severity.${severity}`)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <DriverFileInput
                    label={t('driverPortal.departureCheck.photos')}
                    hint={
                      item.requires_photo_on_defect
                        ? t('driverPortal.departureCheck.photoRequired')
                        : undefined
                    }
                    accept="image/*"
                    files={state.photos}
                    onChange={(files) => update(item.item_key, { photos: files })}
                  />
                </div>
              ) : null}
            </div>
          );
        })}

        {/* A defect never stops the tour; only an unfinished form does. */}
        {unanswered.length > 0 ? (
          <p className="text-sm text-slate-600">
            {t('driverPortal.departureCheck.remaining', { count: unanswered.length })}
          </p>
        ) : null}
        {missingDescription.length > 0 ? (
          <p className="text-sm text-red-700">{t('driverPortal.departureCheck.needDescription')}</p>
        ) : null}
        {missingPhoto.length > 0 ? (
          <p className="text-sm text-red-700">{t('driverPortal.departureCheck.needPhoto')}</p>
        ) : null}
        {error ? <p className="text-sm text-red-700">{error}</p> : null}

        <Button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={
            busy || unanswered.length > 0 || missingPhoto.length > 0 || missingDescription.length > 0
          }
          className="h-12 w-full bg-blue-900 text-base font-semibold text-white hover:bg-blue-800"
        >
          {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
          {t('driverPortal.departureCheck.submit')}
        </Button>
      </div>
    );
  };

  return (
    <DriverPortalShell>
      <DriverPageBack label={t('driverPortal.backToToday')} />
      <Card>
        <CardHeader>
          <CardTitle>{t('driverPortal.departureCheck.title')}</CardTitle>
          {status?.assignment ? (
            <p className="text-sm text-slate-600">
              {status.assignment.vehicle_plate} · {status.assignment.company_name}
            </p>
          ) : null}
        </CardHeader>
        <CardContent>{body()}</CardContent>
      </Card>
    </DriverPortalShell>
  );
}
