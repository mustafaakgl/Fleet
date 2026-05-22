'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFleetData } from '@/context/FleetDataContext';
import type { VehicleHandover, VehicleHandoverPhotoStatus } from '@/lib/types';
import {
  findPreviousVehicleFromAssignments,
  getVehicleHandovers,
  getVehicleHandoverSummary,
  updateVehicleHandoverPhotoStatus,
  upsertVehicleHandover,
} from '@/lib/vehicle-handovers';

function cardTone(value: string) {
  if (value === 'Missing Photos') return 'text-rose-700';
  if (value === 'Required Photos') return 'text-amber-700';
  if (value === 'Approved') return 'text-emerald-700';
  if (value === 'Submitted') return 'text-blue-700';
  return 'text-slate-900';
}

function photoStatusClass(value: VehicleHandoverPhotoStatus) {
  if (value === 'approved') return 'bg-emerald-100 text-emerald-700';
  if (value === 'submitted') return 'bg-blue-100 text-blue-700';
  if (value === 'missing') return 'bg-rose-100 text-rose-700';
  if (value === 'rejected') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-700';
}

function labelize(value: string) {
  return value.replace(/_/g, ' ');
}

export function VehicleHandovers() {
  const { assignments, morningCheckins, drivers } = useFleetData();
  const [rows, setRows] = useState<VehicleHandover[]>(getVehicleHandovers());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(() => rows.find((item) => item.id === selectedId) ?? null, [rows, selectedId]);

  useEffect(() => {
    morningCheckins.forEach((checkin) => {
      if (!checkin.vehiclePlate) return;
      const previousVehicleId = findPreviousVehicleFromAssignments(
        assignments.map((item) => ({ driverId: item.driverId, date: item.date, vehicle: item.vehicle })),
        checkin.driverId,
        checkin.date,
      );
      upsertVehicleHandover({
        id: `vh-auto-${checkin.id}`,
        driverId: checkin.driverId,
        vehicleId: checkin.vehiclePlate,
        previousVehicleId,
        date: checkin.date,
        time: checkin.submittedAt,
        handoverType: 'pickup',
      });
    });
    setRows(getVehicleHandovers());
  }, [assignments, morningCheckins]);

  const summary = getVehicleHandoverSummary();

  function refresh() {
    setRows(getVehicleHandovers());
  }

  function setStatus(id: string, status: VehicleHandoverPhotoStatus) {
    updateVehicleHandoverPhotoStatus(id, status);
    refresh();
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Vehicle Handovers</h2>
        <p className="text-sm text-slate-600">Track pickup and return handovers with required photo workflow.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Required Photos" value={summary.requiredPhotos} tone={cardTone('Required Photos')} />
        <SummaryCard label="Missing Photos" value={summary.missingPhotos} tone={cardTone('Missing Photos')} />
        <SummaryCard label="Submitted" value={summary.submitted} tone={cardTone('Submitted')} />
        <SummaryCard label="Approved" value={summary.approved} tone={cardTone('Approved')} />
        <SummaryCard label="Damage Reports" value={summary.damageReports} tone={cardTone('Damage Reports')} />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[1280px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="border-b border-slate-200 px-3 py-3">Driver</th>
                <th className="border-b border-slate-200 px-3 py-3">Current Vehicle</th>
                <th className="border-b border-slate-200 px-3 py-3">Previous Vehicle</th>
                <th className="border-b border-slate-200 px-3 py-3">Pickup Date</th>
                <th className="border-b border-slate-200 px-3 py-3">Photo Required</th>
                <th className="border-b border-slate-200 px-3 py-3">Photo Status</th>
                <th className="border-b border-slate-200 px-3 py-3">Damage</th>
                <th className="border-b border-slate-200 px-3 py-3">Status</th>
                <th className="border-b border-slate-200 px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const driver = drivers.find((item) => item.id === row.driverId);
                return (
                  <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-medium text-slate-900">{driver?.name ?? row.driverId}</td>
                    <td className="px-3 py-2.5 text-slate-700">{row.vehicleId}</td>
                    <td className="px-3 py-2.5 text-slate-700">{row.previousVehicleId ?? '-'}</td>
                    <td className="px-3 py-2.5 text-slate-700">{row.date}</td>
                    <td className="px-3 py-2.5 text-slate-700">{row.photoRequired ? 'Required' : 'Not Required'}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${photoStatusClass(row.photoStatus)}`}>
                        {labelize(row.photoStatus)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">{row.damageDetected ? row.damageNotes || 'Detected' : 'No damage'}</td>
                    <td className="px-3 py-2.5 text-slate-700">{labelize(row.status)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedId(row.id)}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => setStatus(row.id, 'approved')}
                          className="rounded-md border border-emerald-300 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => setStatus(row.id, 'rejected')}
                          className="rounded-md border border-rose-300 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setSelectedId(null)} />
          <aside className="fixed right-0 top-0 z-50 h-full w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white shadow-xl">
            <div className="sticky top-0 border-b border-slate-200 bg-white px-5 py-4">
              <h3 className="text-lg font-bold text-slate-900">Vehicle Handover Details</h3>
            </div>

            <div className="space-y-4 px-5 py-4 text-sm">
              <DetailRow label="Driver" value={drivers.find((item) => item.id === selected.driverId)?.name ?? selected.driverId} />
              <DetailRow label="Current Vehicle" value={selected.vehicleId} />
              <DetailRow label="Previous Vehicle" value={selected.previousVehicleId ?? '-'} />
              <DetailRow label="Pickup Time" value={selected.time} />

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pickup Photos</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(selected.photos.length ? selected.photos : ['placeholder-1.jpg', 'placeholder-2.jpg']).map((photo) => (
                    <div key={photo} className="rounded border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-600">
                      Photo placeholder: {photo}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Vehicle Condition</p>
                <div className="mt-2 space-y-1 text-sm text-slate-800">
                  <p>{selected.damageDetected ? '☐ No visible damage' : '☑ No visible damage'}</p>
                  <p>{selected.damageDetected ? '☑ Damage detected' : '☐ Damage detected'}</p>
                </div>
              </div>

              <DetailRow label="Damage Notes" value={selected.damageNotes || 'None'} />

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Equipment Checklist</p>
                <div className="mt-2 space-y-1 text-sm text-slate-800">
                  <p>{selected.equipmentChecklist.firstAidKit ? '☑' : '☐'} First aid kit</p>
                  <p>{selected.equipmentChecklist.fireExtinguisher ? '☑' : '☐'} Fire extinguisher</p>
                  <p>{selected.equipmentChecklist.straps ? '☑' : '☐'} Straps</p>
                  <p>{selected.equipmentChecklist.safetyVest ? '☑' : '☐'} Safety vest</p>
                </div>
              </div>

              <DetailRow label="Status" value={labelize(selected.photoStatus)} />
            </div>

            <div className="sticky bottom-0 flex gap-2 border-t border-slate-200 bg-white px-5 py-4">
              <button
                type="button"
                onClick={() => setStatus(selected.id, 'approved')}
                className="rounded-md border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => setStatus(selected.id, 'rejected')}
                className="rounded-md border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
              >
                Reject
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
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tone}`}>{value}</p>
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
