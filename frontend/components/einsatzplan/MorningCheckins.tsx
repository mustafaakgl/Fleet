'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPinned } from 'lucide-react';
import type { MorningCheckin } from '@/context/FleetDataContext';
import { getTodayDate, useFleetData } from '@/context/FleetDataContext';
import { morningCheckinsApi } from '@/lib/api';
import { liveTrackingHref } from '@/lib/office-deep-links';
import { formatAccidentCountLabel, getDriverRiskBadgeClass, getDriverRiskLabel } from '@/lib/utils';

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

function statusPill(status: MorningCheckin['status']) {
  switch (status) {
    case 'Confirmed':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'Added to Einsatzplan':
      return 'bg-blue-100 text-blue-700 border-blue-200';
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
    showToast('Check-in rejected.');
  }

  async function handleAdd(checkinId: string) {
    const checkin = todaysCheckins.find((item) => item.id === checkinId);
    if (!checkin) {
      showToast('Check-in not found.');
      return;
    }
    if (checkin.status === 'Added to Einsatzplan') {
      return;
    }
    const validation = validateMorningCheckin(checkin);
    if (validation.status !== 'Confirmed') {
      showToast(validation.conflictReason ?? 'Check-in needs review before adding.');
      return;
    }
    try {
      await morningCheckinsApi.addToEinsatzplan(checkinId);
      await refetchHydrate();
      showToast(`${t('office.checkin.addedToast')} ${t('office.checkin.trackingHint')}`);
    } catch (error) {
      await refetchHydrate();
      showToast(formatApiError(error, 'Failed to add check-in to Einsatzplan.'));
    }
  }

  function handleSaveEdit() {
    if (!selectedCheckin) return;
    updateMorningCheckin(selectedCheckin.id, {
      vehiclePlate: editVehiclePlate.trim() || undefined,
      company: editCompany.trim() || undefined,
    });
    setEditMode(false);
    showToast('Check-in updated.');
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
          <h2 className="text-xl font-bold text-slate-900">Morning Check-ins</h2>
          <p className="text-sm text-slate-600">Live admin intake for driver morning starts from the mobile app.</p>
        </div>
        <label className="inline-flex items-center gap-3 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">
          <span>Auto-add valid check-ins to Einsatzplan</span>
          <button
            type="button"
            onClick={() => setAutoAddEnabled((prev) => !prev)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              autoAddEnabled ? 'bg-blue-600' : 'bg-slate-300'
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
        <SummaryCard label="Total Check-ins Today" value={summary.total} tone="text-slate-900" />
        <SummaryCard label="Confirmed" value={summary.confirmed} tone="text-emerald-700" />
        <SummaryCard label="Waiting for Review" value={summary.waiting} tone="text-amber-700" />
        <SummaryCard label="Missing Vehicle Plate" value={summary.missingVehicle} tone="text-orange-700" />
        <SummaryCard label="Missing Company" value={summary.missingCompany} tone="text-orange-700" />
        <SummaryCard label="Added to Einsatzplan" value={summary.added} tone="text-blue-700" />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[1280px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="border-b border-slate-200 px-3 py-3">Driver</th>
                <th className="border-b border-slate-200 px-3 py-3">Department</th>
                <th className="border-b border-slate-200 px-3 py-3">Submitted At</th>
                <th className="border-b border-slate-200 px-3 py-3">Vehicle Plate</th>
                <th className="border-b border-slate-200 px-3 py-3">Company</th>
                <th className="border-b border-slate-200 px-3 py-3">Start Location</th>
                <th className="border-b border-slate-200 px-3 py-3">Status</th>
                <th className="border-b border-slate-200 px-3 py-3">Conflict</th>
                <th className="border-b border-slate-200 px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {todaysCheckins.map((checkin) => {
                const driver = drivers.find((item) => item.id === checkin.driverId);
                return (
                  <tr key={checkin.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-medium text-slate-900">{driver?.name ?? checkin.driverId}</td>
                    <td className="px-3 py-2.5 text-slate-700">{driver?.department ?? '-'}</td>
                    <td className="px-3 py-2.5 text-slate-700">{checkin.submittedAt}</td>
                    <td className="px-3 py-2.5 text-slate-700">{checkin.vehiclePlate || '-'}</td>
                    <td className="px-3 py-2.5 text-slate-700">{checkin.company || '-'}</td>
                    <td className="px-3 py-2.5 text-slate-700">{checkin.startLocation || '-'}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusPill(checkin.status)}`}>
                        {checkin.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">{checkin.conflictReason ?? 'No conflict'}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleView(checkin)}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAdd(checkin.id)}
                          className="rounded-md border border-blue-300 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                        >
                          Add to Einsatzplan
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEdit(checkin)}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReject(checkin.id)}
                          className="rounded-md border border-rose-300 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
                        >
                          Reject
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
              <h3 className="text-lg font-bold text-slate-900">Morning Check-in Details</h3>
            </div>

            <div className="space-y-4 px-5 py-4 text-sm">
              {(() => {
                const driver = drivers.find((item) => item.id === selectedCheckin.driverId);
                const assignment = assignments.find(
                  (item) => item.date === selectedCheckin.date && item.driverId === selectedCheckin.driverId,
                );

                return (
                  <>
                    <DetailRow label="Driver" value={driver?.name ?? selectedCheckin.driverId} />
                    <DetailRow label="Department" value={driver?.department ?? '-'} />
                    <DetailRow label="Accidents" value={formatAccidentCountLabel(driver?.accidentCount ?? 0)} />
                    <div className="grid grid-cols-1 gap-1 border-b border-slate-100 pb-2 sm:grid-cols-[180px_1fr]">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Risk</p>
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
                    <DetailRow label="Submitted At" value={selectedCheckin.submittedAt} />

                    {editMode ? (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="space-y-1">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Vehicle Plate</span>
                          <input
                            value={editVehiclePlate}
                            onChange={(event) => setEditVehiclePlate(event.target.value)}
                            className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Company</span>
                          <input
                            value={editCompany}
                            onChange={(event) => setEditCompany(event.target.value)}
                            className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900"
                          />
                        </label>
                      </div>
                    ) : (
                      <>
                        <DetailRow label="Vehicle Plate" value={selectedCheckin.vehiclePlate || '-'} />
                        <DetailRow label="Company" value={selectedCheckin.company || '-'} />
                      </>
                    )}

                    <DetailRow label="Start Location" value={selectedCheckin.startLocation || '-'} />
                    <DetailRow
                      label="GPS Coordinates"
                      value={selectedCheckin.gps ? `${selectedCheckin.gps.lat}, ${selectedCheckin.gps.lng}` : '-'}
                    />
                    <DetailRow label="Phone" value={selectedCheckin.phone || '-'} />
                    <DetailRow label="Calendar Status Today" value={selectedCheckin.conflictReason?.includes('Urlaub') ? 'Urlaub (UT)' : selectedCheckin.conflictReason?.includes('Krank') ? 'Krank (KT)' : 'Available'} />
                    <DetailRow
                      label="Existing Assignment"
                      value={assignment ? `${assignment.vehicle} / ${assignment.company}` : 'None'}
                    />
                    <DetailRow label="Conflict" value={selectedCheckin.conflictReason || 'No conflict'} />
                    <DetailRow label="Source" value="Mobile App" />
                    <DetailRow label="Notes" value={selectedCheckin.notes || '-'} />
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
                className="rounded-md border border-blue-300 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
              >
                Add to Einsatzplan
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
                  Save
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
                  Edit
                </button>
              )}
              <button
                type="button"
                onClick={() => selectedCheckin && handleReject(selectedCheckin.id)}
                className="rounded-md border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Close
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
