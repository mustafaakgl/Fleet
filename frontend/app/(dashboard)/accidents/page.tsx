'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, CarFront } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { DocumentFileLink } from '@/components/documents/DocumentFileLink';
import { accidentsApi, documentsApi } from '@/lib/api';
import type { Document } from '@/lib/types';
import {
  FLEET_LIST_CARD,
  FLEET_LIST_DESKTOP,
  FLEET_LIST_MOBILE,
  FLEET_TABLE,
  FLEET_TABLE_BODY,
  FLEET_TABLE_CELL,
  FLEET_TABLE_CELL_MUTED,
  FLEET_TABLE_CELL_PRIMARY,
  FLEET_TABLE_HEAD,
  FLEET_TABLE_HEADER_ROW,
  FLEET_TABLE_ROW,
} from '@/lib/fleet-table';
import { MobileDataCard, MobileField, MobileFieldGrid } from '@/components/ui/MobileDataCard';
import { formatDate } from '@/lib/utils';

type IncidentStatus = 'reported' | 'under_review' | 'resolved' | 'rejected';

interface AccidentRow {
  id: string;
  type: 'cargo_damage' | 'vehicle_accident';
  incidentDateTime: string;
  description: string;
  location?: string | null;
  policeReportNumber?: string | null;
  damageValue?: number | string | null;
  status: IncidentStatus;
  driver?: { id: string; firstName: string; lastName: string };
  vehicle?: { id: string; plateNumber: string };
  company?: { id: string; name: string } | null;
}

function currency(value?: number | string | null) {
  if (value === null || value === undefined) return '-';
  const n = typeof value === 'string' ? Number(value) : value;
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n);
}

function statusClass(status: IncidentStatus) {
  if (status === 'reported') return 'bg-amber-100 text-amber-700';
  if (status === 'under_review') return 'bg-blue-100 text-blue-700';
  if (status === 'resolved') return 'bg-emerald-100 text-emerald-700';
  if (status === 'rejected') return 'bg-rose-100 text-rose-700';
  return 'bg-slate-100 text-slate-700';
}

export default function AccidentsPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const [reports, setReports] = useState<AccidentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Document[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = (await accidentsApi.list()) as AccidentRow[];
      setReports(all.filter((r) => r.type === 'vehicle_accident'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('accidents.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const id = searchParams.get('id');
    if (id) setSelectedId(id);
  }, [searchParams]);

  const statusFilter = useMemo(() => {
    const statusParam = searchParams.get('status');
    if (!statusParam) return [] as IncidentStatus[];
    const allowed: IncidentStatus[] = ['reported', 'under_review', 'resolved', 'rejected'];
    return statusParam
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is IncidentStatus => allowed.includes(s as IncidentStatus));
  }, [searchParams]);

  const visibleReports = useMemo(() => {
    if (!statusFilter.length) return reports;
    return reports.filter((r) => statusFilter.includes(r.status));
  }, [reports, statusFilter]);

  const selectedReport = useMemo(
    () => reports.find((r) => r.id === selectedId) ?? null,
    [reports, selectedId],
  );

  useEffect(() => {
    if (!selectedId) {
      setAttachments([]);
      return;
    }

    setAttachmentsLoading(true);
    documentsApi
      .list('accident', selectedId)
      .then(setAttachments)
      .catch(() => setAttachments([]))
      .finally(() => setAttachmentsLoading(false));
  }, [selectedId]);

  async function setStatus(id: string, status: IncidentStatus) {
    try {
      await accidentsApi.updateStatus(id, status);
      await reload();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : t('accidents.statusUpdateError'));
    }
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex items-center gap-3">
        <CarFront className="h-6 w-6 text-amber-600" />
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{t('accidents.title')}</h1>
        {!loading && !error && (
          <span className="text-sm text-gray-500 bg-gray-100 rounded-full px-2.5 py-0.5">
            {visibleReports.length}
          </span>
        )}
      </div>

      <Card className={FLEET_LIST_CARD}>
        {loading ? (
          <div className="p-6 text-center text-sm text-gray-500">{t('accidents.loading')}</div>
        ) : error ? (
          <div className="p-4">
            <EmptyState
              icon={CarFront}
              title={t('accidents.loadErrorTitle')}
              subtitle={error}
              actionLabel={t('accidents.retry')}
              onAction={reload}
            />
          </div>
        ) : visibleReports.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={CarFront}
              title={t('accidents.emptyTitle')}
              subtitle={t('accidents.emptySubtitle')}
            />
          </div>
        ) : (
          <>
          <div className={FLEET_LIST_MOBILE}>
            {visibleReports.map((r) => (
              <MobileDataCard
                key={r.id}
                title={r.driver ? `${r.driver.firstName} ${r.driver.lastName}` : t('accidents.colDriver')}
                subtitle={`${r.vehicle?.plateNumber ?? '—'} · ${formatDate(r.incidentDateTime)}`}
                badge={
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass(r.status)}`}>
                    {t(`accidents.status.${r.status}`)}
                  </span>
                }
                onClick={() => setSelectedId(r.id)}
              >
                <MobileFieldGrid>
                  <MobileField label={t('accidents.colCompany')} value={r.company?.name ?? '—'} />
                  <MobileField label={t('accidents.colDamageValue')} value={currency(r.damageValue)} />
                </MobileFieldGrid>
              </MobileDataCard>
            ))}
          </div>
          <div className={FLEET_LIST_DESKTOP + ' overflow-x-auto'}>
            <Table className={FLEET_TABLE}>
              <TableHeader>
                <TableRow className={FLEET_TABLE_HEADER_ROW}>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('accidents.colDate')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('accidents.colDriver')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('accidents.colVehicle')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('accidents.colCompany')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('accidents.colLocation')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('accidents.colDamageValue')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('accidents.colStatus')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('accidents.colActions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={FLEET_TABLE_BODY}>
                {visibleReports.map((r) => (
                  <TableRow key={r.id} className={FLEET_TABLE_ROW}>
                    <TableCell className={FLEET_TABLE_CELL_MUTED}>{formatDate(r.incidentDateTime)}</TableCell>
                    <TableCell className={FLEET_TABLE_CELL_PRIMARY}>
                      {r.driver ? `${r.driver.firstName} ${r.driver.lastName}` : '-'}
                    </TableCell>
                    <TableCell className={FLEET_TABLE_CELL_MUTED}>{r.vehicle?.plateNumber ?? '-'}</TableCell>
                    <TableCell className={FLEET_TABLE_CELL_MUTED}>{r.company?.name ?? '-'}</TableCell>
                    <TableCell className={FLEET_TABLE_CELL_MUTED}>{r.location ?? '-'}</TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>{currency(r.damageValue)}</TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass(r.status)}`}
                      >
                        {t(`accidents.status.${r.status}`)}
                      </span>
                    </TableCell>
                    <TableCell className={FLEET_TABLE_CELL}>
                      <div className="flex flex-wrap gap-2 text-[13px]">
                        <button
                          type="button"
                          onClick={() => setSelectedId(r.id)}
                          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                        >
                          {t('accidents.view')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setStatus(r.id, 'under_review')}
                          disabled={r.status === 'under_review'}
                          className="rounded border border-blue-300 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                        >
                          {t('accidents.review')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setStatus(r.id, 'resolved')}
                          disabled={r.status === 'resolved'}
                          className="rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                        >
                          {t('accidents.resolve')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setStatus(r.id, 'rejected')}
                          disabled={r.status === 'rejected'}
                          className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                        >
                          {t('accidents.reject')}
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          </>
        )}
      </Card>

      {selectedReport && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setSelectedId(null)} />
          <aside className="fixed right-0 top-0 z-50 h-full w-full max-w-2xl overflow-y-auto border-l border-slate-200 bg-white shadow-xl">
            <div className="sticky top-0 border-b border-slate-200 bg-white px-5 py-4">
              <h3 className="text-lg font-bold text-slate-900">{t('accidents.detailTitle')}</h3>
            </div>

            <div className="space-y-4 px-5 py-4 text-sm">
              <DetailRow label={t('accidents.colDate')} value={formatDate(selectedReport.incidentDateTime)} />
              <DetailRow
                label={t('accidents.colDriver')}
                value={
                  selectedReport.driver
                    ? `${selectedReport.driver.firstName} ${selectedReport.driver.lastName}`
                    : '-'
                }
              />
              <DetailRow label={t('accidents.colVehicle')} value={selectedReport.vehicle?.plateNumber ?? '-'} />
              <DetailRow label={t('accidents.colCompany')} value={selectedReport.company?.name ?? '-'} />
              <DetailRow label={t('accidents.colLocation')} value={selectedReport.location ?? '-'} />
              <DetailRow
                label={t('accidents.colPoliceReport')}
                value={selectedReport.policeReportNumber ?? '-'}
              />
              <DetailRow label={t('accidents.colDescription')} value={selectedReport.description || '-'} />
              <DetailRow
                label={t('accidents.colDamageValue')}
                value={currency(selectedReport.damageValue)}
              />
              <DetailRow label={t('accidents.colStatus')} value={t(`accidents.status.${selectedReport.status}`)} />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t('accidents.attachments')}
                </p>
                {attachmentsLoading ? (
                  <p className="mt-2 text-sm text-slate-500">{t('common.loading')}</p>
                ) : attachments.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">{t('accidents.noAttachments')}</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {attachments.map((doc) => (
                      <li key={doc.id} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
                        <span className="text-slate-700">{doc.documentType ?? doc.fileName}</span>
                        <DocumentFileLink document={doc} variant="link" />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="sticky bottom-0 flex gap-2 border-t border-slate-200 bg-white px-5 py-4">
              <button
                type="button"
                onClick={() => setStatus(selectedReport.id, 'under_review')}
                disabled={selectedReport.status === 'under_review'}
                className="rounded border border-blue-300 px-3 py-2 text-sm text-blue-700 hover:bg-blue-50 disabled:opacity-50"
              >
                {t('accidents.markUnderReview')}
              </button>
              <button
                type="button"
                onClick={() => setStatus(selectedReport.id, 'resolved')}
                disabled={selectedReport.status === 'resolved'}
                className="rounded border border-emerald-300 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
              >
                {t('accidents.resolve')}
              </button>
              <button
                type="button"
                onClick={() => setStatus(selectedReport.id, 'rejected')}
                disabled={selectedReport.status === 'rejected'}
                className="rounded border border-rose-300 px-3 py-2 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-50"
              >
                {t('accidents.reject')}
              </button>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="ml-auto rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                {t('accidents.close')}
              </button>
            </div>
          </aside>
        </>
      )}

      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
        <AlertTriangle className="mr-1 inline-block h-4 w-4" />
        {t('accidents.infoBanner')}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-slate-100 pb-2 sm:grid-cols-[180px_1fr]">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm text-slate-800">{value || '-'}</p>
    </div>
  );
}
