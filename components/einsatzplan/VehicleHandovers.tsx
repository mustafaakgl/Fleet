'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useFleetData } from '@/context/FleetDataContext';
import { EmptyState } from '@/components/ui/empty-state';
import { getUser } from '@/lib/auth';
import { canEditVehicleHandovers } from '@/lib/permissions';
import type { VehicleHandover, VehicleHandoverPhotoStatus } from '@/lib/types';
import {
  getVehicleHandovers,
  markVehicleHandoverCompleted,
  markVehicleHandoverDamage,
  uploadVehicleHandoverPhoto,
} from '@/lib/vehicle-handovers';

type TableStatusFilter = 'all' | 'completed' | 'pending' | 'missing';

type DisplayStatus = 'Completed' | 'Pending' | 'Missing';

function toDisplayDate(value: string) {
  const [y, m, d] = value.split('-');
  if (!y || !m || !d) return value;
  return `${d}.${m}.${y}`;
}

function labelizePhotoStatus(value: VehicleHandoverPhotoStatus) {
  if (value === 'not_required') return 'Not Required';
  if (value === 'submitted') return 'Uploaded';
  if (value === 'approved') return 'Uploaded';
  if (value === 'missing') return 'Missing';
  if (value === 'rejected') return 'Rejected';
  return value;
}

function getDisplayStatus(row: VehicleHandover): DisplayStatus {
  if (row.photoRequired && row.photoStatus === 'missing') return 'Missing';
  if (row.status === 'completed') return 'Completed';
  return 'Pending';
}

function displayStatusClass(status: DisplayStatus) {
  if (status === 'Completed') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (status === 'Missing') return 'bg-rose-100 text-rose-700 border-rose-200';
  return 'bg-amber-100 text-amber-700 border-amber-200';
}

function photoStatusClass(value: VehicleHandoverPhotoStatus) {
  if (value === 'missing') return 'bg-rose-100 text-rose-700';
  if (value === 'not_required') return 'bg-slate-100 text-slate-700';
  if (value === 'submitted' || value === 'approved') return 'bg-emerald-100 text-emerald-700';
  return 'bg-amber-100 text-amber-700';
}

export function VehicleHandovers() {
  const { drivers } = useFleetData();
  const [rows, setRows] = useState<VehicleHandover[]>(getVehicleHandovers());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [driverQuery, setDriverQuery] = useState('');
  const [vehicleQuery, setVehicleQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TableStatusFilter>('all');
  const [dateFilter, setDateFilter] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const currentUser = getUser();
  const canEdit = currentUser ? canEditVehicleHandovers(currentUser.role) : false;

  const selected = useMemo(() => rows.find((item) => item.id === selectedId) ?? null, [rows, selectedId]);

  function refresh() {
    setRows(getVehicleHandovers());
  }

  const filteredRows = useMemo(() => {
    const driverNeedle = driverQuery.trim().toLowerCase();
    const vehicleNeedle = vehicleQuery.trim().toLowerCase();

    return rows.filter((row) => {
      const driver = drivers.find((item) => item.id === row.driverId);
      const driverName = (driver?.name ?? row.driverId).toLowerCase();
      const displayStatus = getDisplayStatus(row);

      const matchesDate = !dateFilter || row.date === dateFilter;
      const matchesDriver = !driverNeedle || driverName.includes(driverNeedle);
      const matchesVehicle =
        !vehicleNeedle
        || row.vehicleId.toLowerCase().includes(vehicleNeedle)
        || (row.previousVehicleId ?? '').toLowerCase().includes(vehicleNeedle);
      const matchesStatus =
        statusFilter === 'all'
        || (statusFilter === 'completed' && displayStatus === 'Completed')
        || (statusFilter === 'pending' && displayStatus === 'Pending')
        || (statusFilter === 'missing' && displayStatus === 'Missing');

      return matchesDate && matchesDriver && matchesVehicle && matchesStatus;
    });
  }, [dateFilter, driverQuery, drivers, rows, statusFilter, vehicleQuery]);

  function openRow(id: string) {
    setSelectedId(id);
  }

  function handleUploadPhoto() {
    if (!selected || !canEdit) return;
    uploadVehicleHandoverPhoto(selected.id);
    refresh();
    setMessage('Photo uploaded (mock placeholder).');
  }

  function handleMarkCompleted() {
    if (!selected || !canEdit) return;
    const result = markVehicleHandoverCompleted(selected.id);
    refresh();
    setMessage(result.message);
  }

  function handleCreateDamageReport() {
    if (!selected || !canEdit) return;
    const result = markVehicleHandoverDamage(selected.id, selected.damageNotes);
    refresh();
    setMessage(result.message);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Vehicle Handovers</h2>
        <p className="text-sm text-slate-600">Complete pickup handover workflow with photo and damage controls.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="min-w-[160px] flex-1">
          <label htmlFor="handover-date" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Date
          </label>
          <input
            id="handover-date"
            type="date"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
          />
        </div>

        <div className="min-w-[160px] flex-1">
          <label htmlFor="handover-driver" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Driver Search
          </label>
          <input
            id="handover-driver"
            type="text"
            value={driverQuery}
            onChange={(event) => setDriverQuery(event.target.value)}
            placeholder="Search driver"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
          />
        </div>

        <div className="min-w-[160px] flex-1">
          <label htmlFor="handover-vehicle" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Vehicle Search
          </label>
          <input
            id="handover-vehicle"
            type="text"
            value={vehicleQuery}
            onChange={(event) => setVehicleQuery(event.target.value)}
            placeholder="Search vehicle"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
          />
        </div>

        <div className="w-[170px]">
          <label htmlFor="handover-status" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Status
          </label>
          <select
            id="handover-status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as TableStatusFilter)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
          >
            <option value="all">All</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="missing">Missing</option>
          </select>
        </div>

        <button
          type="button"
          onClick={refresh}
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {!canEdit && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4" />
          View-only mode. Only Admin and Office can edit handovers.
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        {filteredRows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={AlertTriangle}
              title="No vehicle handovers"
              subtitle="No handovers found for selected filters."
              actionLabel="Clear filters"
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
          <table className="min-w-[1260px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="border-b border-slate-200 px-3 py-3">Date</th>
                <th className="border-b border-slate-200 px-3 py-3">Driver</th>
                <th className="border-b border-slate-200 px-3 py-3">Previous Vehicle</th>
                <th className="border-b border-slate-200 px-3 py-3">Current Vehicle</th>
                <th className="border-b border-slate-200 px-3 py-3">Photo Required</th>
                <th className="border-b border-slate-200 px-3 py-3">Photo Status</th>
                <th className="border-b border-slate-200 px-3 py-3">Damage Detected</th>
                <th className="border-b border-slate-200 px-3 py-3">Status</th>
                <th className="border-b border-slate-200 px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const driver = drivers.find((item) => item.id === row.driverId);
                const displayStatus = getDisplayStatus(row);
                return (
                  <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2.5 text-slate-700">{toDisplayDate(row.date)}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-900">{driver?.name ?? row.driverId}</td>
                    <td className="px-3 py-2.5 text-slate-700">{row.previousVehicleId ?? '-'}</td>
                    <td className="px-3 py-2.5 text-slate-700">{row.vehicleId}</td>
                    <td className="px-3 py-2.5 text-slate-700">{row.photoRequired ? 'Yes' : 'No'}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${photoStatusClass(row.photoStatus)}`}>
                        {labelizePhotoStatus(row.photoStatus)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">{row.damageDetected ? 'Yes' : 'No'}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${displayStatusClass(displayStatus)}`}>
                        {displayStatus}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => openRow(row.id)}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredRows.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={9}>
                    No handovers found for selected filters.
                  </td>
                </tr>
              )}
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
              <h3 className="text-lg font-bold text-slate-900">Handover Details</h3>
            </div>

            <div className="space-y-4 px-5 py-4 text-sm">
              <DetailRow label="Driver" value={drivers.find((item) => item.id === selected.driverId)?.name ?? selected.driverId} />
              <DetailRow label="Date" value={toDisplayDate(selected.date)} />
              <DetailRow label="Previous Vehicle" value={selected.previousVehicleId ?? '-'} />
              <DetailRow label="Current Vehicle" value={selected.vehicleId} />
              <DetailRow label="Photo Required" value={selected.photoRequired ? 'Yes' : 'No'} />
              <DetailRow label="Photo Status" value={labelizePhotoStatus(selected.photoStatus)} />
              <DetailRow label="Damage Detected" value={selected.damageDetected ? 'Yes' : 'No'} />

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Uploaded Photos</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(selected.photos.length ? selected.photos : ['No photo uploaded']).map((photo) => (
                    <div key={photo} className="rounded border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-600">
                      {photo}
                    </div>
                  ))}
                </div>
              </div>

              <DetailRow label="Notes" value={selected.damageNotes ?? 'No notes'} />
            </div>

            <div className="sticky bottom-0 flex flex-wrap gap-2 border-t border-slate-200 bg-white px-5 py-4">
              <button
                type="button"
                onClick={handleUploadPhoto}
                disabled={!canEdit}
                className="rounded-md border border-blue-300 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Upload Photo
              </button>
              <button
                type="button"
                onClick={handleMarkCompleted}
                disabled={!canEdit}
                className="rounded-md border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Mark Completed
              </button>
              <button
                type="button"
                onClick={handleCreateDamageReport}
                disabled={!canEdit}
                className="rounded-md border border-amber-300 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Create Damage Report
              </button>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="ml-auto rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Close
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
