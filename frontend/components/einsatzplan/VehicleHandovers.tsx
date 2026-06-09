'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/ui/empty-state';
import { getUser } from '@/lib/auth';
import { canEditVehicleHandovers } from '@/lib/permissions';
import { vehicleHandoversApi, type VehicleHandoverRecord } from '@/lib/api';
import {
  FLEET_LIST_CARD,
  FLEET_RAW_TABLE,
  FLEET_RAW_TBODY,
  FLEET_RAW_TD,
  FLEET_RAW_TD_MUTED,
  FLEET_RAW_TD_PRIMARY,
  FLEET_RAW_TH,
  FLEET_RAW_THEAD,
  FLEET_RAW_TR,
} from '@/lib/fleet-table';
import { cn } from '@/lib/utils';

type TableStatusFilter = 'all' | 'completed' | 'pending' | 'missing';
type DisplayStatus = 'Completed' | 'Pending' | 'Missing';
type PhotoStatus = VehicleHandoverRecord['photoStatus'];

function toDisplayDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('de-DE');
}

function photoStatusLabelKey(value: PhotoStatus) {
  if (value === 'not_required') return 'handover.photoNotRequired';
  if (value === 'uploaded') return 'handover.photoUploaded';
  if (value === 'approved') return 'handover.photoUploaded';
  if (value === 'missing') return 'handover.photoMissing';
  if (value === 'rejected') return 'handover.photoRejected';
  return value;
}

function getDisplayStatus(row: VehicleHandoverRecord): DisplayStatus {
  if (row.photoRequired && row.photoStatus === 'missing') return 'Missing';
  if (row.status === 'completed') return 'Completed';
  return 'Pending';
}

function displayStatusClass(status: DisplayStatus) {
  if (status === 'Completed') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (status === 'Missing') return 'bg-rose-100 text-rose-700 border-rose-200';
  return 'bg-amber-100 text-amber-700 border-amber-200';
}

function photoStatusClass(value: PhotoStatus) {
  if (value === 'missing') return 'bg-rose-100 text-rose-700';
  if (value === 'not_required') return 'bg-slate-100 text-slate-700';
  if (value === 'uploaded' || value === 'approved') return 'bg-emerald-100 text-emerald-700';
  return 'bg-amber-100 text-amber-700';
}

export function VehicleHandovers() {
  const { t } = useTranslation();
  const dispStatusLabel = (status: DisplayStatus) => t(`handover.disp${status}`);
  const [rows, setRows] = useState<VehicleHandoverRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [driverQuery, setDriverQuery] = useState('');
  const [vehicleQuery, setVehicleQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TableStatusFilter>('all');
  const [dateFilter, setDateFilter] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const currentUser = getUser();
  const canEdit = currentUser ? canEditVehicleHandovers(currentUser.role) : false;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await vehicleHandoversApi.list();
      setRows(data);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : t('handover.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const selected = useMemo(
    () => rows.find((item) => item.id === selectedId) ?? null,
    [rows, selectedId],
  );

  const filteredRows = useMemo(() => {
    const driverNeedle = driverQuery.trim().toLowerCase();
    const vehicleNeedle = vehicleQuery.trim().toLowerCase();

    return rows.filter((row) => {
      const driverName = row.driver
        ? `${row.driver.firstName} ${row.driver.lastName}`.toLowerCase()
        : row.driverId.toLowerCase();
      const vehiclePlate = row.vehicle?.plateNumber.toLowerCase() ?? row.vehicleId.toLowerCase();
      const displayStatus = getDisplayStatus(row);
      const dateIso = row.handoverDateTime.slice(0, 10);

      const matchesDate = !dateFilter || dateIso === dateFilter;
      const matchesDriver = !driverNeedle || driverName.includes(driverNeedle);
      const matchesVehicle =
        !vehicleNeedle ||
        vehiclePlate.includes(vehicleNeedle) ||
        (row.previousVehicleId ?? '').toLowerCase().includes(vehicleNeedle);
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'completed' && displayStatus === 'Completed') ||
        (statusFilter === 'pending' && displayStatus === 'Pending') ||
        (statusFilter === 'missing' && displayStatus === 'Missing');

      return matchesDate && matchesDriver && matchesVehicle && matchesStatus;
    });
  }, [dateFilter, driverQuery, rows, statusFilter, vehicleQuery]);

  async function handleApprovePhoto() {
    if (!selected || !canEdit) return;
    try {
      await vehicleHandoversApi.approvePhoto(selected.id);
      await refresh();
      setMessage(t('handover.photoApproved'));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t('handover.approveError'));
    }
  }

  async function handleRejectPhoto() {
    if (!selected || !canEdit) return;
    try {
      await vehicleHandoversApi.rejectPhoto(selected.id);
      await refresh();
      setMessage(t('handover.photoRejected'));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t('handover.rejectError'));
    }
  }

  async function handleMarkCompleted() {
    if (!selected || !canEdit) return;
    try {
      await vehicleHandoversApi.complete(selected.id);
      await refresh();
      setMessage(t('handover.markedCompleted'));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t('handover.completeError'));
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900">{t('handover.title')}</h2>
        <p className="text-sm text-slate-600">
          {t('handover.subtitle')}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="min-w-[160px] flex-1">
          <label
            htmlFor="handover-date"
            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            {t('handover.colDate')}
          </label>
          <input
            id="handover-date"
            type="date"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#1a4d7a]"
          />
        </div>

        <div className="min-w-[160px] flex-1">
          <label
            htmlFor="handover-driver"
            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            {t('handover.driverSearch')}
          </label>
          <input
            id="handover-driver"
            type="text"
            value={driverQuery}
            onChange={(event) => setDriverQuery(event.target.value)}
            placeholder={t('handover.searchDriver')}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#1a4d7a]"
          />
        </div>

        <div className="min-w-[160px] flex-1">
          <label
            htmlFor="handover-vehicle"
            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            {t('handover.vehicleSearch')}
          </label>
          <input
            id="handover-vehicle"
            type="text"
            value={vehicleQuery}
            onChange={(event) => setVehicleQuery(event.target.value)}
            placeholder={t('handover.searchVehicle')}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#1a4d7a]"
          />
        </div>

        <div className="w-[170px]">
          <label
            htmlFor="handover-status"
            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            {t('handover.colStatus')}
          </label>
          <select
            id="handover-status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as TableStatusFilter)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#1a4d7a]"
          >
            <option value="all">{t('handover.filterAll')}</option>
            <option value="completed">{t('handover.filterCompleted')}</option>
            <option value="pending">{t('handover.filterPending')}</option>
            <option value="missing">{t('handover.filterMissing')}</option>
          </select>
        </div>

        <button
          type="button"
          onClick={refresh}
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          <RefreshCw className="h-4 w-4" />
          {t('handover.refresh')}
        </button>
      </div>

      {!canEdit && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4" />
          {t('handover.viewOnly')}
        </div>
      )}

      <div className={cn(FLEET_LIST_CARD, 'bg-white')}>
        {loading ? (
          <div className="p-6 text-center text-sm text-slate-500">{t('handover.loading')}</div>
        ) : error ? (
          <div className="p-4">
            <EmptyState
              icon={AlertTriangle}
              title={t('handover.loadErrorTitle')}
              subtitle={error}
              actionLabel={t('handover.retry')}
              onAction={refresh}
            />
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={AlertTriangle}
              title={t('handover.emptyTitle')}
              subtitle={t('handover.emptySubtitle')}
              actionLabel={t('handover.clearFilters')}
              onAction={() => {
                setDateFilter('');
                setDriverQuery('');
                setVehicleQuery('');
                setStatusFilter('all');
              }}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className={cn(FLEET_RAW_TABLE, 'min-w-[1260px]')}>
              <thead className={FLEET_RAW_THEAD}>
                <tr>
                  <th className={FLEET_RAW_TH}>{t('handover.colDate')}</th>
                  <th className={FLEET_RAW_TH}>{t('handover.colDriver')}</th>
                  <th className={FLEET_RAW_TH}>{t('handover.colPreviousVehicle')}</th>
                  <th className={FLEET_RAW_TH}>{t('handover.colCurrentVehicle')}</th>
                  <th className={FLEET_RAW_TH}>{t('handover.colPhotoRequired')}</th>
                  <th className={FLEET_RAW_TH}>{t('handover.colPhotoStatus')}</th>
                  <th className={FLEET_RAW_TH}>{t('handover.colDamageDetected')}</th>
                  <th className={FLEET_RAW_TH}>{t('handover.colStatus')}</th>
                  <th className={FLEET_RAW_TH}>{t('handover.colActions')}</th>
                </tr>
              </thead>
              <tbody className={FLEET_RAW_TBODY}>
                {filteredRows.map((row) => {
                  const driverName = row.driver
                    ? `${row.driver.firstName} ${row.driver.lastName}`
                    : row.driverId;
                  const vehiclePlate = row.vehicle?.plateNumber ?? row.vehicleId;
                  const displayStatus = getDisplayStatus(row);
                  return (
                    <tr key={row.id} className={FLEET_RAW_TR}>
                      <td className={FLEET_RAW_TD_MUTED}>
                        {toDisplayDate(row.handoverDateTime)}
                      </td>
                      <td className={FLEET_RAW_TD_PRIMARY}>{driverName}</td>
                      <td className={FLEET_RAW_TD_MUTED}>
                        {row.previousVehicleId ?? '-'}
                      </td>
                      <td className={FLEET_RAW_TD_MUTED}>{vehiclePlate}</td>
                      <td className={FLEET_RAW_TD_MUTED}>
                        {row.photoRequired ? t('handover.yes') : t('handover.no')}
                      </td>
                      <td className={FLEET_RAW_TD}>
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${photoStatusClass(row.photoStatus)}`}
                        >
                          {t(photoStatusLabelKey(row.photoStatus))}
                        </span>
                      </td>
                      <td className={FLEET_RAW_TD_MUTED}>
                        {row.damageDetected ? t('handover.yes') : t('handover.no')}
                      </td>
                      <td className={FLEET_RAW_TD}>
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${displayStatusClass(displayStatus)}`}
                        >
                          {dispStatusLabel(displayStatus)}
                        </span>
                      </td>
                      <td className={FLEET_RAW_TD}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(row.id)}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          {t('handover.view')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setSelectedId(null)} />
          <aside className="fixed right-0 top-0 z-50 h-full w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white shadow-xl">
            <div className="sticky top-0 border-b border-slate-200 bg-white px-5 py-4">
              <h3 className="text-lg font-bold text-slate-900">{t('handover.detailTitle')}</h3>
            </div>

            <div className="space-y-4 px-5 py-4 text-sm">
              <DetailRow
                label={t('handover.colDriver')}
                value={
                  selected.driver
                    ? `${selected.driver.firstName} ${selected.driver.lastName}`
                    : selected.driverId
                }
              />
              <DetailRow label={t('handover.colDate')} value={toDisplayDate(selected.handoverDateTime)} />
              <DetailRow label={t('handover.colPreviousVehicle')} value={selected.previousVehicleId ?? '-'} />
              <DetailRow
                label={t('handover.colCurrentVehicle')}
                value={selected.vehicle?.plateNumber ?? selected.vehicleId}
              />
              <DetailRow label={t('handover.handoverType')} value={selected.handoverType} />
              <DetailRow label={t('handover.colPhotoRequired')} value={selected.photoRequired ? t('handover.yes') : t('handover.no')} />
              <DetailRow label={t('handover.colPhotoStatus')} value={t(photoStatusLabelKey(selected.photoStatus))} />
              <DetailRow label={t('handover.colDamageDetected')} value={selected.damageDetected ? t('handover.yes') : t('handover.no')} />
              <DetailRow label={t('handover.notes')} value={selected.notes ?? selected.damageNotes ?? '-'} />
            </div>

            <div className="sticky bottom-0 flex flex-wrap gap-2 border-t border-slate-200 bg-white px-5 py-4">
              <button
                type="button"
                onClick={handleApprovePhoto}
                disabled={!canEdit || selected.photoStatus !== 'uploaded'}
                className="rounded-md border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('handover.approvePhoto')}
              </button>
              <button
                type="button"
                onClick={handleRejectPhoto}
                disabled={!canEdit || selected.photoStatus !== 'uploaded'}
                className="rounded-md border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('handover.rejectPhoto')}
              </button>
              <button
                type="button"
                onClick={handleMarkCompleted}
                disabled={!canEdit || selected.status === 'completed'}
                className="rounded-md border border-[#163a5c] px-3 py-2 text-sm font-medium text-[#1a4d7a] hover:bg-[#e8f0f8] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('handover.markCompleted')}
              </button>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="ml-auto rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                {t('handover.close')}
              </button>
            </div>
          </aside>
        </>
      )}

      {message && (
        <div className="fixed bottom-6 right-6 z-50 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {message}
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-slate-100 pb-2 sm:grid-cols-[180px_1fr]">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm text-slate-800">{value}</p>
    </div>
  );
}
