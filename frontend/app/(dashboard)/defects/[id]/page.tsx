'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, AlertTriangle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DefectSeverityBadge, DefectStatusBadge } from '@/components/defects/DefectStatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { defectsApi, driversApi, getApiErrorMessage } from '@/lib/api';
import { defectPhotoApiPath, openAuthenticatedFile } from '@/lib/file-access';
import { getUser } from '@/lib/auth';
import { FLEET_PAGE, FLEET_PAGE_HEADER, FLEET_PAGE_TITLE } from '@/lib/fleet-table';
import type { Defect, DefectStatus, Driver } from '@/lib/types';
import { formatDate } from '@/lib/utils';

const NEXT_STATUS: Partial<Record<DefectStatus, DefectStatus[]>> = {
  offen: ['in_reparatur', 'behoben'],
  in_reparatur: ['behoben'],
  behoben: ['bestaetigt'],
};

export default function DefectDetailPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const [defect, setDefect] = useState<Defect | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [repairCompanies, setRepairCompanies] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextStatus, setNextStatus] = useState('');
  const [note, setNote] = useState('');
  const [repairCompany, setRepairCompany] = useState('');
  const [estimatedRepairDate, setEstimatedRepairDate] = useState('');
  const [confirmationDriverId, setConfirmationDriverId] = useState('');
  const isAdmin = getUser()?.role === 'admin';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const row = await defectsApi.getById(params.id);
      setDefect(row);
      setRepairCompany(row.repair_company ?? '');
      setConfirmationDriverId(row.confirmation_driver_id ?? row.reported_by.id);
      setNextStatus('');
    } catch (e) {
      setDefect(null);
      setError(getApiErrorMessage(e, t('defects.loadError')));
    } finally {
      setLoading(false);
    }
  }, [params.id, t]);

  useEffect(() => {
    void load();
    void driversApi.list({ limit: 500, status: 'active' }).then((page) => setDrivers(page.data));
    void defectsApi.repairCompanies().then(setRepairCompanies).catch(() => setRepairCompanies([]));
  }, [load]);

  const allowedStatuses = useMemo(() => {
    if (!defect) return [] as DefectStatus[];
    return NEXT_STATUS[defect.status] ?? [];
  }, [defect]);

  async function handleStatusUpdate() {
    if (!nextStatus) return;
    setActing(true);
    setError(null);
    try {
      await defectsApi.updateStatus(params.id, {
        status: nextStatus,
        note: note.trim() || undefined,
        repair_company: nextStatus === 'in_reparatur' ? repairCompany.trim() : undefined,
        estimated_repair_date: estimatedRepairDate || undefined,
        confirmation_driver_id:
          nextStatus === 'behoben' ? confirmationDriverId || undefined : undefined,
      });
      setNote('');
      setNextStatus('');
      await load();
    } catch (e) {
      setError(getApiErrorMessage(e, t('defects.statusError')));
    } finally {
      setActing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-700" />
      </div>
    );
  }

  if (!defect) {
    return (
      <div className={FLEET_PAGE}>
        <p className="text-rose-600">{error ?? t('defects.notFound')}</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/defects">{t('defects.backToList')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className={FLEET_PAGE}>
      <div className={FLEET_PAGE_HEADER}>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/defects">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <AlertTriangle className="h-7 w-7 text-amber-600" />
          <div>
            <h1 className={FLEET_PAGE_TITLE}>{defect.title}</h1>
            <div className="mt-1 flex flex-wrap gap-2">
              <DefectSeverityBadge severity={defect.severity} label={t(`defects.severity.${defect.severity}`)} />
              <DefectStatusBadge status={defect.status} label={t(`defects.status.${defect.status}`)} />
            </div>
          </div>
        </div>
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('defects.detail.overview')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <div className="text-slate-500">{t('defects.colVehicle')}</div>
                <div className="font-medium">{defect.vehicle.plate_number}</div>
              </div>
              <div>
                <div className="text-slate-500">{t('defects.detail.reporter')}</div>
                <div className="font-medium">{defect.reported_by.name}</div>
              </div>
              <div>
                <div className="text-slate-500">{t('defects.detail.source')}</div>
                <div className="font-medium">{t(`defects.source.${defect.source}`)}</div>
              </div>
              <div>
                <div className="text-slate-500">{t('defects.colDate')}</div>
                <div className="font-medium">{formatDate(defect.created_at)}</div>
              </div>
              {defect.repair_company ? (
                <div>
                  <div className="text-slate-500">{t('defects.detail.repairCompany')}</div>
                  <div className="font-medium">{defect.repair_company}</div>
                </div>
              ) : null}
              {defect.confirmation_driver ? (
                <div>
                  <div className="text-slate-500">{t('defects.detail.confirmDriver')}</div>
                  <div className="font-medium">{defect.confirmation_driver.name}</div>
                </div>
              ) : null}
              <div className="sm:col-span-2">
                <div className="text-slate-500">{t('defects.detail.description')}</div>
                <div>{defect.description}</div>
              </div>
            </CardContent>
          </Card>

          {defect.photo_urls && defect.photo_urls.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('defects.detail.photos')}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {defect.photo_urls.map((_, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    size="sm"
                    disabled={!isAdmin}
                    onClick={() => {
                      if (isAdmin) void openAuthenticatedFile(defectPhotoApiPath(defect.id, index));
                    }}
                  >
                    {t('defects.detail.photo', { index: index + 1 })}
                  </Button>
                ))}
                {!isAdmin ? (
                  <p className="text-xs text-slate-500">{t('defects.detail.photosAdminOnly')}</p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>{t('defects.detail.history')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {defect.status_logs.map((log) => (
                <div key={log.id} className="rounded-md border border-slate-100 px-3 py-2">
                  <div className="font-medium">
                    {log.from_status ? t(`defects.status.${log.from_status}`) : '—'} →{' '}
                    {t(`defects.status.${log.to_status}`)}
                  </div>
                  <div className="text-slate-500">{formatDate(log.created_at)}</div>
                  {log.note ? <div className="text-slate-600">{log.note}</div> : null}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {allowedStatuses.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{t('defects.actions')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label>{t('defects.updateStatus')}</Label>
                <select
                  value={nextStatus}
                  onChange={(e) => setNextStatus(e.target.value)}
                  className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
                >
                  <option value="">{t('defects.selectStatus')}</option>
                  {allowedStatuses.map((status) => (
                    <option key={status} value={status}>
                      {t(`defects.status.${status}`)}
                    </option>
                  ))}
                </select>
              </div>
              {nextStatus === 'in_reparatur' ? (
                <>
                  <div className="space-y-2">
                    <Label>{t('defects.detail.repairCompany')}</Label>
                    <Input
                      list="repair-companies"
                      value={repairCompany}
                      onChange={(e) => setRepairCompany(e.target.value)}
                    />
                    <datalist id="repair-companies">
                      {repairCompanies.map((company) => (
                        <option key={company} value={company} />
                      ))}
                    </datalist>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('defects.detail.estimatedRepair')}</Label>
                    <Input
                      type="date"
                      value={estimatedRepairDate}
                      onChange={(e) => setEstimatedRepairDate(e.target.value)}
                    />
                  </div>
                </>
              ) : null}
              {nextStatus === 'behoben' ? (
                <div className="space-y-2">
                  <Label>{t('defects.detail.confirmDriver')}</Label>
                  <select
                    value={confirmationDriverId}
                    onChange={(e) => setConfirmationDriverId(e.target.value)}
                    className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
                  >
                    {drivers.map((driver) => (
                      <option key={driver.id} value={driver.id}>
                        {driver.first_name} {driver.last_name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <Input
                placeholder={t('defects.statusNote')}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <Button className="w-full" disabled={acting || !nextStatus} onClick={() => void handleStatusUpdate()}>
                {t('defects.applyStatus')}
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
