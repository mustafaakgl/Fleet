'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPinned } from 'lucide-react';
import type { MorningCheckin } from '@/context/FleetDataContext';
import { getTodayDate, useFleetData } from '@/context/FleetDataContext';
import { morningCheckinsApi } from '@/lib/api';
import { liveTrackingHref } from '@/lib/office-deep-links';
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
import { cn, formatAccidentCountLabel, getDriverRiskBadgeClass, getDriverRiskLabel } from '@/lib/utils';

function formatApiError(error: unknown, fallback: string) {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const data = (error as { response?: { data?: { message?: string | string[] } } }).response?.data;
    const message = data?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string' && message.trim()) return message;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

const CHECKIN_STATUS_KEY: Record<string, string> = {
  Confirmed: 'checkins.status.confirmed',
  'Added to Einsatzplan': 'checkins.status.added',
  'Waiting for Review': 'checkins.status.waiting',
  'Missing Vehicle Plate': 'checkins.status.missingVehicle',
  'Missing Company': 'checkins.status.missingCompany',
  Conflict: 'checkins.status.conflict',
  Rejected: 'checkins.status.rejected',
};

function statusPill(status: MorningCheckin['status']) {
  switch (status) {
    case 'Confirmed':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'Added to Einsatzplan':
      return 'bg-[#e8f0f8] text-[#1a4d7a] border-[#d4e3f2]';
    case 'Waiting for Review':
      return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'Missing Vehicle Plate':
    case 'Missing Company':
      return 'bg-orange-100 text-orange-700 border-orange-200';
    case 'Conflict':
    case 'Rejected':
      return 'bg-rose-100 text-rose-700 border-rose-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

interface SummaryCardProps {
  label: string;
  value: number;
  tone: string;
}

function SummaryCard({ label, value, tone }: SummaryCardProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

export function MorningCheckins() {
  const { t } = useTranslation();
  const {
    morningCheckins,
    drivers,
    assignments,
    rejectMorningCheckin,
    updateMorningCheckin,
    validateMorningCheckin,
    refetchHydrate,
  } = useFleetData();

  useEffect(() => {
    refetchHydrate();
  }, [refetchHydrate]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editVehiclePlate, setEditVehiclePlate] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [autoAddEnabled, setAutoAddEnabled] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const autoAddInFlightRef = useRef<Set<string>>(new Set());

  const today = getTodayDate();

  const todaysCheckins = useMemo(
    () => morningCheckins.filter((checkin) => checkin.date === today),
    [morningCheckins, today],
  );

  const selectedCheckin = useMemo(
    () => todaysCheckins.find((item) => item.id === selectedId) ?? null,
    [todaysCheckins, selectedId],
  );

  useEffect(() => {
    if (!autoAddEnabled) {
      autoAddInFlightRef.current.clear();
      return;
    }

    const validPending = todaysCheckins.filter((checkin) => {
      if (checkin.status === 'Added to Einsatzplan' || checkin.status === 'Rejected') return false;
      const validation = validateMorningCheckin(checkin);
      return validation.status === 'Confirmed';
    });

    for (const checkin of validPending) {
      if (autoAddInFlightRef.current.has(checkin.id)) continue;
      autoAddInFlightRef.current.add(checkin.id);
      void handleAdd(checkin.id).finally(() => {
        autoAddInFlightRef.current.delete(checkin.id);
      });
    }
  }, [autoAddEnabled, todaysCheckins, validateMorningCheckin]);

  function showToast(message: string) {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 2200);
  }

  function handleView(checkin: MorningCheckin) {
    setSelectedId(checkin.id);
    setEditMode(false);
    setDrawerOpen(true);
  }

  function handleEdit(checkin: MorningCheckin) {
    setSelectedId(checkin.id);
    setEditVehiclePlate(checkin.vehiclePlate ?? '');
    setEditCompany(checkin.company ?? '');
    setEditMode(true);
    setDrawerOpen(true);
  }

  function handleReject(checkinId: string) {
    rejectMorningCheckin(checkinId);
    showToast(t('checkins.toastRejected'));
  }

  async function handleAdd(checkinId: string) {
    const checkin = todaysCheckins.find((item) => item.id === checkinId);
    if (!checkin) {
      showToast(t('checkins.notFound'));
      return;
    }
    if (checkin.status === 'Added to Einsatzplan') {
      return;
    }
    const validation = validateMorningCheckin(checkin);
    if (validation.status !== 'Confirmed') {
      showToast(validation.conflictReason ?? t('checkins.needsReview'));
      return;
    }
    try {
      await morningCheckinsApi.addToEinsatzplan(checkinId);
      await refetchHydrate();
      showToast(`${t('office.checkin.addedToast')} ${t('office.checkin.trackingHint')}`);
    } catch (error) {
      await refetchHydrate();
      showToast(formatApiError(error, t('checkins.addError')));
    }
  }

  function handleSaveEdit() {
    if (!selectedCheckin) return;
    updateMorningCheckin(selectedCheckin.id, {
      vehiclePlate: editVehiclePlate.trim() || undefined,
      company: editCompany.trim() || undefined,
    });
    setEditMode(false);
    showToast(t('checkins.toastUpdated'));
  }

  const summary = {
    total: todaysCheckins.length,
    confirmed: todaysCheckins.filter((item) => item.status === 'Confirmed').length,
    waiting: todaysCheckins.filter((item) => item.status === 'Waiting for Review').length,
    missingVehicle: todaysCheckins.filter((item) => item.status === 'Missing Vehicle Plate').length,
    missingCompany: todaysCheckins.filter((item) => item.status === 'Missing Company').length,
    added: todaysCheckins.filter((item) => item.status === 'Added to Einsatzplan').length,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{t('checkins.title')}</h2>
          <p className="text-sm text-slate-600">{t('checkins.subtitle')}</p>
        </div>
        <label className="inline-flex items-center gap-3 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">
          <span>{t('checkins.autoAdd')}</span>
          <button
            type="button"
            onClick={() => setAutoAddEnabled((prev) => !prev)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              autoAddEnabled ? 'bg-[#1a4d7a]' : 'bg-slate-300'
            }`}
            aria-pressed={autoAddEnabled}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                autoAddEnabled ? 'translate-x-5' : 'translate-x-1'
              }`}
            />
          </button>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryCard label={t('checkins.total')} value={summary.total} tone="text-slate-900" />
        <SummaryCard label={t('checkins.confirmed')} value={summary.confirmed} tone="text-emerald-700" />
        <SummaryCard label={t('checkins.waiting')} value={summary.waiting} tone="text-amber-700" />
        <SummaryCard label={t('checkins.missingVehicle')} value={summary.missingVehicle} tone="text-orange-700" />
        <SummaryCard label={t('checkins.missingCompany')} value={summary.missingCompany} tone="text-orange-700" />
        <SummaryCard label={t('checkins.added')} value={summary.added} tone="text-[#1a4d7a]" />
      </div>

      <div className={cn(FLEET_LIST_CARD, 'bg-white')}>
        <div className="overflow-x-auto">
          <table className={cn(FLEET_RAW_TABLE, 'min-w-[1280px]')}>
            <thead className={FLEET_RAW_THEAD}>
              <tr>
                <th className={FLEET_RAW_TH}>{t('checkins.colDriver')}</th>
                <th className={FLEET_RAW_TH}>{t('checkins.colDepartment')}</th>
                <th className={FLEET_RAW_TH}>{t('checkins.colSubmittedAt')}</th>
                <th className={FLEET_RAW_TH}>{t('checkins.colVehiclePlate')}</th>
                <th className={FLEET_RAW_TH}>{t('checkins.colCompany')}</th>
                <th className={FLEET_RAW_TH}>{t('checkins.colCargo')}</th>
                <th className={FLEET_RAW_TH}>{t('checkins.colQuantity')}</th>
                <th className={FLEET_RAW_TH}>{t('checkins.colStartLocation')}</th>
                <th className={FLEET_RAW_TH}>{t('checkins.colStatus')}</th>
                <th className={FLEET_RAW_TH}>{t('checkins.colConflict')}</th>
                <th className={FLEET_RAW_TH}>{t('checkins.colActions')}</th>
              </tr>
            </thead>
            <tbody className={FLEET_RAW_TBODY}>
              {todaysCheckins.map((checkin) => {
                const driver = drivers.find((item) => item.id === checkin.driverId);
                return (
                  <tr key={checkin.id} className={FLEET_RAW_TR}>
                    <td className={FLEET_RAW_TD_PRIMARY}>{driver?.name ?? checkin.driverId}</td>
                    <td className={FLEET_RAW_TD_MUTED}>{driver?.department ?? '-'}</td>
                    <td className={FLEET_RAW_TD_MUTED}>{checkin.submittedAt}</td>
                    <td className={FLEET_RAW_TD_MUTED}>{checkin.vehiclePlate || '-'}</td>
                    <td className={FLEET_RAW_TD_MUTED}>{checkin.company || '-'}</td>
                    <td className={FLEET_RAW_TD_MUTED}>{checkin.cargoName || '-'}</td>
                    <td className={FLEET_RAW_TD_MUTED}>{checkin.cargoQuantity || '-'}</td>
                    <td className={FLEET_RAW_TD_MUTED}>{checkin.startLocation || '-'}</td>
                    <td className={FLEET_RAW_TD}>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusPill(checkin.status)}`}>
                        {t(CHECKIN_STATUS_KEY[checkin.status] ?? checkin.status)}
                      </span>
                    </td>
                    <td className={FLEET_RAW_TD_MUTED}>{checkin.conflictReason ?? t('checkins.noConflict')}</td>
                    <td className={FLEET_RAW_TD}>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleView(checkin)}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          {t('checkins.view')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAdd(checkin.id)}
                          className="rounded-md border border-[#163a5c] px-2 py-1 text-xs font-medium text-[#1a4d7a] hover:bg-[#e8f0f8]"
                        >
                          {t('checkins.addToPlan')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEdit(checkin)}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          {t('checkins.edit')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReject(checkin.id)}
                          className="rounded-md border border-rose-300 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
                        >
                          {t('checkins.reject')}
                        </button>
                        {checkin.status === 'Added to Einsatzplan' || checkin.assignmentId ? (
                          <Link
                            href={liveTrackingHref(checkin.driverId, checkin.assignmentId)}
                            className="inline-flex items-center gap-1 rounded-md border border-emerald-300 px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-50"
                          >
                            <MapPinned className="h-3.5 w-3.5" />
                            {t('office.checkin.openOnMap')}
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {drawerOpen && selectedCheckin && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setDrawerOpen(false)} />
          <aside className="fixed right-0 top-0 z-50 h-full w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white shadow-xl">
            <div className="sticky top-0 border-b border-slate-200 bg-white px-5 py-4">
              <h3 className="text-lg font-bold text-slate-900">{t('checkins.detailTitle')}</h3>
            </div>

            <div className="space-y-4 px-5 py-4 text-sm">
              {(() => {
                const driver = drivers.find((item) => item.id === selectedCheckin.driverId);
                const assignment = assignments.find(
                  (item) => item.date === selectedCheckin.date && item.driverId === selectedCheckin.driverId,
                );

                return (
                  <>
                    <DetailRow label={t('checkins.colDriver')} value={driver?.name ?? selectedCheckin.driverId} />
                    <DetailRow label={t('checkins.colDepartment')} value={driver?.department ?? '-'} />
                    <DetailRow label={t('abt.accidents')} value={formatAccidentCountLabel(driver?.accidentCount ?? 0)} />
                    <div className="grid grid-cols-1 gap-1 border-b border-slate-100 pb-2 sm:grid-cols-[180px_1fr]">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('checkins.risk')}</p>
                      <div>
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getDriverRiskBadgeClass(
                            driver?.riskScore ?? 'green',
                          )}`}
                        >
                          {getDriverRiskLabel(driver?.riskScore ?? 'green')}
                        </span>
                      </div>
                    </div>
                    <DetailRow label={t('checkins.colSubmittedAt')} value={selectedCheckin.submittedAt} />

                    {editMode ? (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="space-y-1">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('checkins.colVehiclePlate')}</span>
                          <input
                            value={editVehiclePlate}
                            onChange={(event) => setEditVehiclePlate(event.target.value)}
                            className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('checkins.colCompany')}</span>
                          <input
                            value={editCompany}
                            onChange={(event) => setEditCompany(event.target.value)}
                            className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900"
                          />
                        </label>
                      </div>
                    ) : (
                      <>
                        <DetailRow label={t('checkins.colVehiclePlate')} value={selectedCheckin.vehiclePlate || '-'} />
                        <DetailRow label={t('checkins.colCompany')} value={selectedCheckin.company || '-'} />
                        <DetailRow label={t('checkins.colCargo')} value={selectedCheckin.cargoName || '-'} />
                        <DetailRow label={t('checkins.colQuantity')} value={selectedCheckin.cargoQuantity || '-'} />
                      </>
                    )}

                    <DetailRow label={t('checkins.colStartLocation')} value={selectedCheckin.startLocation || '-'} />
                    <DetailRow
                      label={t('checkins.gpsCoordinates')}
                      value={selectedCheckin.gps ? `${selectedCheckin.gps.lat}, ${selectedCheckin.gps.lng}` : '-'}
                    />
                    <DetailRow label={t('checkins.phone')} value={selectedCheckin.phone || '-'} />
                    <DetailRow label={t('checkins.calendarStatusToday')} value={selectedCheckin.conflictReason?.includes('Urlaub') ? 'Urlaub (UT)' : selectedCheckin.conflictReason?.includes('Krank') ? 'Krank (KT)' : t('checkins.available')} />
                    <DetailRow
                      label={t('checkins.existingAssignment')}
                      value={assignment ? `${assignment.vehicle} / ${assignment.company}` : t('checkins.none')}
                    />
                    <DetailRow label={t('checkins.colConflict')} value={selectedCheckin.conflictReason || t('checkins.noConflict')} />
                    <DetailRow label={t('checkins.source')} value={t('checkins.sourceMobile')} />
                    <DetailRow label={t('checkins.notes')} value={selectedCheckin.notes || '-'} />
                  </>
                );
              })()}
            </div>

            <div className="sticky bottom-0 flex flex-wrap gap-2 border-t border-slate-200 bg-white px-5 py-4">
              <button
                type="button"
                onClick={() => {
                  if (selectedCheckin) void handleAdd(selectedCheckin.id);
                }}
                className="rounded-md border border-[#163a5c] px-3 py-2 text-sm font-medium text-[#1a4d7a] hover:bg-[#e8f0f8]"
              >
                {t('checkins.addToPlan')}
              </button>
              {selectedCheckin &&
              (selectedCheckin.status === 'Added to Einsatzplan' || selectedCheckin.assignmentId) ? (
                <Link
                  href={liveTrackingHref(selectedCheckin.driverId, selectedCheckin.assignmentId)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50"
                >
                  <MapPinned className="h-4 w-4" />
                  {t('office.checkin.openOnMap')}
                </Link>
              ) : null}
              {editMode ? (
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  {t('checkins.save')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEditVehiclePlate(selectedCheckin.vehiclePlate ?? '');
                    setEditCompany(selectedCheckin.company ?? '');
                    setEditMode(true);
                  }}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  {t('checkins.edit')}
                </button>
              )}
              <button
                type="button"
                onClick={() => selectedCheckin && handleReject(selectedCheckin.id)}
                className="rounded-md border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
              >
                {t('checkins.reject')}
              </button>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                {t('checkins.close')}
              </button>
            </div>
          </aside>
        </>
      )}

      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {toastMessage}
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
