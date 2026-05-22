'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, PackageX } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { CargoDamageReport, CargoDamageStatus } from '@/lib/types';
import {
  getCargoDamageReports,
  getCargoDamageTimeline,
  updateCargoDamageStatus,
} from '@/lib/cargo-damage';
import { mockDrivers, mockVehicles } from '@/lib/mock-data';

function currency(value: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
}

function statusClass(status: CargoDamageStatus) {
  if (status === 'pending') return 'bg-amber-100 text-amber-700';
  if (status === 'under_review') return 'bg-blue-100 text-blue-700';
  if (status === 'approved') return 'bg-emerald-100 text-emerald-700';
  if (status === 'rejected') return 'bg-rose-100 text-rose-700';
  return 'bg-slate-100 text-slate-700';
}

function formatDamageType(value: CargoDamageReport['damageType']) {
  return value.replace(/_/g, ' ');
}

export default function CargoDamagePage() {
  const searchParams = useSearchParams();
  const [reports, setReports] = useState<CargoDamageReport[]>(getCargoDamageReports());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerNotes, setDrawerNotes] = useState('');

  const statusFilter = useMemo(() => {
    const statusParam = searchParams.get('status');
    if (!statusParam) return [] as CargoDamageStatus[];
    return statusParam
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean) as CargoDamageStatus[];
  }, [searchParams]);

  const visibleReports = useMemo(() => {
    if (!statusFilter.length) return reports;
    return reports.filter((item) => statusFilter.includes(item.status));
  }, [reports, statusFilter]);

  const selectedReport = useMemo(() => reports.find((item) => item.id === selectedId) ?? null, [reports, selectedId]);

  function refreshFromStore() {
    setReports(getCargoDamageReports());
  }

  function setStatus(id: string, status: CargoDamageStatus) {
    updateCargoDamageStatus(id, status);
    refreshFromStore();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <PackageX className="h-6 w-6 text-rose-600" />
        <h1 className="text-2xl font-bold text-gray-900">Cargo Damage Reports</h1>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Driver</TableHead>
              <TableHead>Vehicle</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Cargo Name</TableHead>
              <TableHead>Cargo Owner</TableHead>
              <TableHead>Damage Type</TableHead>
              <TableHead>Damage Value</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleReports.map((report) => {
              const driver = mockDrivers.find((item) => item.id === report.driverId);
              const vehicle = mockVehicles.find((item) => item.id === report.vehicleId);
              return (
                <TableRow key={report.id}>
                  <TableCell>{report.date} {report.time}</TableCell>
                  <TableCell>{driver ? `${driver.first_name} ${driver.last_name}` : report.driverId}</TableCell>
                  <TableCell>{vehicle?.plate_number ?? report.vehicleId}</TableCell>
                  <TableCell>{report.companyName}</TableCell>
                  <TableCell>{report.cargoName}</TableCell>
                  <TableCell>{report.cargoOwner}</TableCell>
                  <TableCell className="capitalize">{formatDamageType(report.damageType)}</TableCell>
                  <TableCell>{report.damageValue ? currency(report.damageValue) : '-'}</TableCell>
                  <TableCell>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass(report.status)}`}>{report.status}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setSelectedId(report.id)} className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">View</button>
                      <button type="button" onClick={() => setStatus(report.id, 'approved')} className="rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50">Approve</button>
                      <button type="button" onClick={() => setStatus(report.id, 'rejected')} className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50">Reject</button>
                      <button type="button" onClick={() => setStatus(report.id, 'closed')} className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">Close</button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {selectedReport && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setSelectedId(null)} />
          <aside className="fixed right-0 top-0 z-50 h-full w-full max-w-2xl overflow-y-auto border-l border-slate-200 bg-white shadow-xl">
            <div className="sticky top-0 border-b border-slate-200 bg-white px-5 py-4">
              <h3 className="text-lg font-bold text-slate-900">Cargo Damage Report Detail</h3>
            </div>

            <div className="space-y-4 px-5 py-4 text-sm">
              <DetailRow label="Driver" value={(() => {
                const driver = mockDrivers.find((item) => item.id === selectedReport.driverId);
                return driver ? `${driver.first_name} ${driver.last_name}` : selectedReport.driverId;
              })()} />
              <DetailRow label="Vehicle" value={(() => {
                const vehicle = mockVehicles.find((item) => item.id === selectedReport.vehicleId);
                return vehicle?.plate_number ?? selectedReport.vehicleId;
              })()} />
              <DetailRow label="Company" value={selectedReport.companyName} />
              <DetailRow label="Cargo name" value={selectedReport.cargoName} />
              <DetailRow label="Cargo owner" value={selectedReport.cargoOwner} />
              <DetailRow label="Damage type" value={formatDamageType(selectedReport.damageType)} />
              <DetailRow label="Description" value={selectedReport.description || '-'} />

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Uploaded photos</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {selectedReport.photos.map((photo) => (
                    <div key={photo} className="rounded border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-600">
                      Photo placeholder: {photo}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Document photo</p>
                <div className="mt-2 rounded border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-600">
                  Document placeholder: {selectedReport.documentPhoto || 'No document uploaded'}
                </div>
              </div>

              <DetailRow label="Damage value" value={selectedReport.damageValue ? currency(selectedReport.damageValue) : '-'} />
              <DetailRow label="Status" value={selectedReport.status} />

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Timeline</p>
                <ul className="mt-2 space-y-2">
                  {getCargoDamageTimeline(selectedReport).map((item) => (
                    <li key={item.id} className="rounded border border-slate-200 p-2">
                      <p className="font-semibold text-slate-800">{item.title}</p>
                      <p className="text-xs text-slate-500">{item.at}</p>
                      <p className="text-sm text-slate-700">{item.note}</p>
                    </li>
                  ))}
                </ul>
              </div>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</span>
                <textarea
                  value={drawerNotes}
                  onChange={(event) => setDrawerNotes(event.target.value)}
                  rows={4}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                  placeholder="Internal review notes..."
                />
              </label>
            </div>

            <div className="sticky bottom-0 flex gap-2 border-t border-slate-200 bg-white px-5 py-4">
              <button type="button" onClick={() => setStatus(selectedReport.id, 'approved')} className="rounded border border-emerald-300 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50">Approve</button>
              <button type="button" onClick={() => setStatus(selectedReport.id, 'rejected')} className="rounded border border-rose-300 px-3 py-2 text-sm text-rose-700 hover:bg-rose-50">Reject</button>
              <button type="button" onClick={() => setStatus(selectedReport.id, 'closed')} className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">Close</button>
              <button type="button" onClick={() => setSelectedId(null)} className="ml-auto rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">Close Drawer</button>
            </div>
          </aside>
        </>
      )}

      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
        <AlertTriangle className="mr-1 inline-block h-4 w-4" />
        Cargo damage is tracked separately from traffic accidents. Approved cargo reports can be used for risk review metrics.
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
