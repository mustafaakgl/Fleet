'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bell, FileText, Loader2, Scale } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { FineStatusBadge } from '@/components/fines/FineStatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { driversApi, finesApi, getApiErrorMessage } from '@/lib/api';
import { fineDocumentApiPath, openAuthenticatedFile } from '@/lib/file-access';
import { FLEET_PAGE, FLEET_PAGE_HEADER, FLEET_PAGE_TITLE } from '@/lib/fleet-table';
import type { Driver, Fine, FineStatus } from '@/lib/types';
import { formatFleetCurrency } from '@/lib/locale-format';
import { formatDate } from '@/lib/utils';

const NEXT_STATUS: Partial<Record<FineStatus, FineStatus[]>> = {
  neu: ['fahrer_zugeordnet', 'abgeschlossen'],
  fahrer_zugeordnet: ['fahrer_benachrichtigt', 'abgeschlossen'],
  fahrer_benachrichtigt: ['bezahlt', 'widerspruch', 'abgeschlossen'],
  bezahlt: ['abgeschlossen'],
  widerspruch: ['bezahlt', 'abgeschlossen'],
};

export default function FineDetailPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const fineId = params.id;

  const [fine, setFine] = useState<Fine | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignDriverId, setAssignDriverId] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [nextStatus, setNextStatus] = useState('');

  const statusLabel = useCallback(
    (status: FineStatus) => t(`fines.status.${status}`, status),
    [t],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const row = await finesApi.getById(fineId);
      setFine(row);
      setAssignDriverId(row.driver_id ?? '');
      setNextStatus('');
    } catch (e) {
      setFine(null);
      setError(getApiErrorMessage(e, t('fines.loadError', 'Bußgeld konnte nicht geladen werden.')));
    } finally {
      setLoading(false);
    }
  }, [fineId, t]);

  useEffect(() => {
    void load();
    void driversApi.list({ limit: 500, status: 'active' }).then((page) => setDrivers(page.data));
  }, [load]);

  const allowedStatuses = useMemo(() => {
    if (!fine) return [] as FineStatus[];
    return NEXT_STATUS[fine.status] ?? [];
  }, [fine]);

  async function handleAssign() {
    if (!assignDriverId) return;
    setActing(true);
    setError(null);
    try {
      await finesApi.assignDriver(fineId, { driver_id: assignDriverId });
      await load();
    } catch (e) {
      setError(getApiErrorMessage(e, t('fines.assignError', 'Zuordnung fehlgeschlagen.')));
    } finally {
      setActing(false);
    }
  }

  async function handleNotify() {
    setActing(true);
    setError(null);
    try {
      await finesApi.notifyDriver(fineId);
      await load();
    } catch (e) {
      setError(getApiErrorMessage(e, t('fines.notifyError', 'Benachrichtigung fehlgeschlagen.')));
    } finally {
      setActing(false);
    }
  }

  async function handleStatusUpdate() {
    if (!nextStatus) return;
    setActing(true);
    setError(null);
    try {
      await finesApi.updateStatus(fineId, {
        status: nextStatus,
        note: statusNote.trim() || undefined,
      });
      setStatusNote('');
      setNextStatus('');
      await load();
    } catch (e) {
      setError(getApiErrorMessage(e, t('fines.statusError', 'Status konnte nicht geändert werden.')));
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

  if (!fine) {
    return (
      <div className={FLEET_PAGE}>
        <p className="text-rose-600">{error ?? t('fines.notFound', 'Bußgeld nicht gefunden.')}</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/fines">{t('fines.backToList', 'Zurück zur Liste')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className={FLEET_PAGE}>
      <div className={`${FLEET_PAGE_HEADER} flex flex-wrap items-center justify-between gap-3`}>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/fines">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <Scale className="h-7 w-7 text-blue-700" />
          <div>
            <h1 className={FLEET_PAGE_TITLE}>
              {fine.vehicle.plate_number} — {fine.violation_type}
            </h1>
            <div className="mt-1">
              <FineStatusBadge status={fine.status} label={statusLabel(fine.status)} />
            </div>
          </div>
        </div>
        {fine.document_url ? (
          <Button
            variant="outline"
            onClick={() => {
              void openAuthenticatedFile(fineDocumentApiPath(fine.id));
            }}
          >
            <FileText className="mr-2 h-4 w-4" />
            {t('fines.openDocument', 'Bescheid öffnen')}
          </Button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('fines.detail.overview', 'Übersicht')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <div className="text-slate-500">{t('fines.colDate', 'Datum')}</div>
                <div className="font-medium">{formatDate(fine.violation_at)}</div>
              </div>
              <div>
                <div className="text-slate-500">{t('fines.form.location', 'Ort')}</div>
                <div className="font-medium">{fine.violation_location}</div>
              </div>
              <div>
                <div className="text-slate-500">{t('fines.form.category', 'Kategorie')}</div>
                <div className="font-medium">{t(`fines.category.${fine.violation_category}`, fine.violation_category)}</div>
              </div>
              <div>
                <div className="text-slate-500">{t('fines.colAmount', 'Betrag')}</div>
                <div className="font-medium">{formatFleetCurrency(fine.amount)}</div>
              </div>
              <div>
                <div className="text-slate-500">{t('fines.colDriver', 'Fahrer')}</div>
                <div className="font-medium">{fine.driver?.name ?? '—'}</div>
              </div>
              <div>
                <div className="text-slate-500">{t('fines.matchType', 'Zuordnung')}</div>
                <div className="font-medium">{t(`fines.match.${fine.match_type}`, fine.match_type)}</div>
              </div>
              {fine.payment_due_date ? (
                <div>
                  <div className="text-slate-500">{t('fines.form.paymentDue', 'Zahlungsfrist')}</div>
                  <div className="font-medium">
                    {formatDate(fine.payment_due_date)}
                    {fine.days_until_due != null
                      ? ` (${t('fines.dueInDays', '{{days}} Tage', { days: fine.days_until_due })})`
                      : ''}
                  </div>
                </div>
              ) : null}
              {fine.driver_notified_at ? (
                <div>
                  <div className="text-slate-500">{t('fines.driverNotified', 'Fahrer benachrichtigt')}</div>
                  <div className="font-medium">{formatDate(fine.driver_notified_at)}</div>
                </div>
              ) : null}
              {fine.driver_acknowledged_at ? (
                <div>
                  <div className="text-slate-500">{t('fines.driverAck', 'Fahrer bestätigt')}</div>
                  <div className="font-medium text-emerald-700">{formatDate(fine.driver_acknowledged_at)}</div>
                </div>
              ) : fine.pending_ack ? (
                <div className="text-amber-700">{t('fines.pendingAck', 'Bestätigung ausstehend')}</div>
              ) : null}
              {fine.notes ? (
                <div className="sm:col-span-2">
                  <div className="text-slate-500">{t('fines.form.notes', 'Notizen')}</div>
                  <div>{fine.notes}</div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('fines.detail.history', 'Statusverlauf')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {fine.status_logs.map((log) => (
                <div key={log.id} className="rounded-md border border-slate-100 px-3 py-2">
                  <div className="font-medium">
                    {log.from_status ? statusLabel(log.from_status) : '—'} → {statusLabel(log.to_status)}
                  </div>
                  <div className="text-slate-500">{formatDate(log.created_at)}</div>
                  {log.note ? <div className="text-slate-600">{log.note}</div> : null}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('fines.actions', 'Aktionen')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t('fines.assignDriver', 'Fahrer zuordnen')}</Label>
                <select
                  value={assignDriverId}
                  onChange={(e) => setAssignDriverId(e.target.value)}
                  className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
                >
                  <option value="">{t('fines.form.selectDriver', 'Fahrer wählen')}</option>
                  {drivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.first_name} {driver.last_name}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={acting || !assignDriverId}
                  onClick={() => {
                    void handleAssign();
                  }}
                >
                  {t('fines.assign', 'Zuordnen')}
                </Button>
              </div>

              <Button
                type="button"
                className="w-full"
                disabled={acting || !fine.driver_id || fine.status === 'fahrer_benachrichtigt'}
                onClick={() => {
                  void handleNotify();
                }}
              >
                <Bell className="mr-2 h-4 w-4" />
                {t('fines.notifyDriver', 'Fahrer benachrichtigen')}
              </Button>

              {allowedStatuses.length > 0 ? (
                <div className="space-y-2 border-t border-slate-100 pt-4">
                  <Label>{t('fines.updateStatus', 'Status ändern')}</Label>
                  <select
                    value={nextStatus}
                    onChange={(e) => setNextStatus(e.target.value)}
                    className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
                  >
                    <option value="">{t('fines.selectStatus', 'Status wählen')}</option>
                    {allowedStatuses.map((status) => (
                      <option key={status} value={status}>
                        {statusLabel(status)}
                      </option>
                    ))}
                  </select>
                  <Input
                    placeholder={t('fines.statusNote', 'Notiz (optional)')}
                    value={statusNote}
                    onChange={(e) => setStatusNote(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    disabled={acting || !nextStatus}
                    onClick={() => {
                      void handleStatusUpdate();
                    }}
                  >
                    {t('fines.applyStatus', 'Status speichern')}
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
