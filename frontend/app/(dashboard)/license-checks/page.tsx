'use client';

import { useCallback, useEffect, useState } from 'react';
import { IdCard, Check, X, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { LicenseCheckPhoto } from '@/components/license-checks/LicenseCheckPhoto';
import { getApiErrorMessage, licenseChecksApi } from '@/lib/api';
import type { LicenseCheck } from '@/lib/types';
import { FLEET_PAGE, FLEET_PAGE_HEADER, FLEET_PAGE_TITLE } from '@/lib/fleet-table';

export default function LicenseChecksPage() {
  const { t } = useTranslation();
  const [checks, setChecks] = useState<LicenseCheck[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [acting, setActing] = useState(false);

  const selected = checks.find((c) => c.id === selectedId) ?? checks[0] ?? null;

  const fetchPending = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await licenseChecksApi.listPending();
      setChecks(rows);
      setSelectedId((prev) => {
        if (prev && rows.some((row) => row.id === prev)) return prev;
        return rows[0]?.id ?? null;
      });
    } catch (e) {
      setChecks([]);
      setSelectedId(null);
      setError(
        getApiErrorMessage(
          e,
          t('licenseChecks.loadError', 'Führerscheinkontrollen konnten nicht geladen werden.'),
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void fetchPending();
  }, [fetchPending]);

  async function handleApprove() {
    if (!selected) return;
    setActing(true);
    try {
      await licenseChecksApi.approve(selected.id);
      setRejectReason('');
      await fetchPending();
    } catch (e) {
      setError(getApiErrorMessage(e, t('licenseChecks.approveError', 'Bestätigung fehlgeschlagen.')));
    } finally {
      setActing(false);
    }
  }

  async function handleReject() {
    if (!selected || rejectReason.trim().length < 3) return;
    setActing(true);
    try {
      await licenseChecksApi.reject(selected.id, rejectReason.trim());
      setRejectReason('');
      await fetchPending();
    } catch (e) {
      setError(getApiErrorMessage(e, t('licenseChecks.rejectError', 'Ablehnung fehlgeschlagen.')));
    } finally {
      setActing(false);
    }
  }

  return (
    <div className={FLEET_PAGE}>
      <div className={FLEET_PAGE_HEADER}>
        <div className="flex items-center gap-3">
          <IdCard className="h-8 w-8 text-blue-600" />
          <h1 className={FLEET_PAGE_TITLE}>
            {t('licenseChecks.title', 'Digitale Führerscheinkontrolle')}
          </h1>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <Skeleton className="h-64" />
          <Skeleton className="h-96" />
        </div>
      ) : null}

      {!loading && error ? (
        <EmptyState
          icon={WifiOff}
          title={t('licenseChecks.loadErrorTitle', 'Daten konnten nicht geladen werden')}
          subtitle={error}
          actionLabel={t('common.retry', 'Erneut versuchen')}
          onAction={() => {
            void fetchPending();
          }}
        />
      ) : null}

      {!loading && !error && checks.length === 0 ? (
        <EmptyState
          icon={IdCard}
          title={t('licenseChecks.emptyTitle', 'Keine offenen Kontrollen')}
          subtitle={t(
            'licenseChecks.emptyMessage',
            'Alle eingereichten Führerscheinkontrollen wurden bearbeitet.',
          )}
        />
      ) : null}

      {!loading && selected ? (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t('licenseChecks.queue', 'Warteschlange')} ({checks.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {checks.map((check) => (
                <button
                  key={check.id}
                  type="button"
                  onClick={() => setSelectedId(check.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                    check.id === selected.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="font-medium">{check.driver_name}</div>
                  <div className="text-xs text-gray-500">
                    {check.check_date} · {check.check_type}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {selected.driver_name} · {selected.employee_number}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-gray-700">
                    {t('licenseChecks.reference', 'Referenz (Akte)')}
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="mb-1 text-xs text-gray-500">Vorderseite</p>
                      <LicenseCheckPhoto
                        apiPath={selected.reference_license?.front_photo_url}
                        alt="Referenz Vorderseite"
                      />
                    </div>
                    <div>
                      <p className="mb-1 text-xs text-gray-500">Rückseite</p>
                      <LicenseCheckPhoto
                        apiPath={selected.reference_license?.back_photo_url}
                        alt="Referenz Rückseite"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-semibold text-gray-700">
                    {t('licenseChecks.submission', 'Neue Einreichung')}
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="mb-1 text-xs text-gray-500">Vorderseite</p>
                      <LicenseCheckPhoto apiPath={selected.photos?.front_url} alt="Neu Vorderseite" />
                    </div>
                    <div>
                      <p className="mb-1 text-xs text-gray-500">Rückseite</p>
                      <LicenseCheckPhoto apiPath={selected.photos?.back_url} alt="Neu Rückseite" />
                    </div>
                    <div className="col-span-2">
                      <p className="mb-1 text-xs text-gray-500">Selfie mit Führerschein</p>
                      <LicenseCheckPhoto apiPath={selected.photos?.selfie_url} alt="Selfie" className="h-56 w-full rounded-lg border object-cover" />
                    </div>
                  </div>
                </div>
              </div>

              {selected.photo_metadata ? (
                <pre className="overflow-x-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
                  {JSON.stringify(selected.photo_metadata, null, 2)}
                </pre>
              ) : null}

              <div className="flex flex-wrap items-end gap-3 border-t pt-4">
                <Button onClick={() => void handleApprove()} disabled={acting}>
                  <Check className="mr-2 h-4 w-4" />
                  {t('licenseChecks.approve', 'Bestätigen')}
                </Button>
                <div className="min-w-[220px] flex-1 space-y-1">
                  <Label htmlFor="reject-reason">{t('licenseChecks.rejectReason', 'Ablehnungsgrund')}</Label>
                  <Input
                    id="reject-reason"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder={t('licenseChecks.rejectPlaceholder', 'z. B. Foto unscharf')}
                  />
                </div>
                <Button variant="destructive" onClick={() => void handleReject()} disabled={acting || rejectReason.trim().length < 3}>
                  <X className="mr-2 h-4 w-4" />
                  {t('licenseChecks.reject', 'Ablehnen')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
