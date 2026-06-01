'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, PackageX } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { accidentsApi } from '@/lib/api';
import { formatDate } from '@/lib/utils';

type IncidentStatus = 'reported' | 'under_review' | 'resolved' | 'rejected';

interface CargoDamageRow {
  id: string;
  type: 'cargo_damage' | 'vehicle_accident';
  incidentDateTime: string;
  description: string;
  cargoName?: string | null;
  cargoOwner?: string | null;
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

export default function CargoDamagePage() {
  const searchParams = useSearchParams();
  const [reports, setReports] = useState<CargoDamageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = (await accidentsApi.list()) as CargoDamageRow[];
      setReports(all.filter((r) => r.type === 'cargo_damage'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load cargo damage reports');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

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

  async function setStatus(id: string, status: IncidentStatus) {
    try {
      await accidentsApi.updateStatus(id, status);
      await reload();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Failed to update status');
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <PackageX className="h-6 w-6 text-rose-600" />
        <h1 className="text-2xl font-bold text-gray-900">Cargo Damage Reports</h1>
        {!loading && !error && (
          <span className="text-sm text-gray-500 bg-gray-100 rounded-full px-2.5 py-0.5">
            {visibleReports.length}
          </span>
        )}
      </div>

      <Card>
        {loading ? (
          <div className="p-6 text-center text-sm text-gray-500">Loading...</div>
        ) : error ? (
          <div className="p-4">
            <EmptyState
              icon={PackageX}
              title="Failed to load reports"
              subtitle={error}
              actionLabel="Retry"
              onAction={reload}
            />
          </div>
        ) : visibleReports.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={PackageX}
              title="No cargo damage reports"
              subtitle="No cargo damage cases match current filters."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Cargo Name</TableHead>
                  <TableHead>Cargo Owner</TableHead>
                  <TableHead>Damage Value</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleReports.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{formatDate(r.incidentDateTime)}</TableCell>
                    <TableCell>
                      {r.driver ? `${r.driver.firstName} ${r.driver.lastName}` : '-'}
                    </TableCell>
                    <TableCell>{r.vehicle?.plateNumber ?? '-'}</TableCell>
                    <TableCell>{r.company?.name ?? '-'}</TableCell>
                    <TableCell>{r.cargoName ?? '-'}</TableCell>
                    <TableCell>{r.cargoOwner ?? '-'}</TableCell>
                    <TableCell>{currency(r.damageValue)}</TableCell>
                    <TableCell>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass(r.status)}`}
                      >
                        {r.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedId(r.id)}
                          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => setStatus(r.id, 'under_review')}
                          disabled={r.status === 'under_review'}
                          className="rounded border border-blue-300 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                        >
                          Review
                        </button>
                        <button
                          type="button"
                          onClick={() => setStatus(r.id, 'resolved')}
                          disabled={r.status === 'resolved'}
                          className="rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                        >
                          Resolve
                        </button>
                        <button
                          type="button"
                          onClick={() => setStatus(r.id, 'rejected')}
                          disabled={r.status === 'rejected'}
                          className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {selectedReport && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setSelectedId(null)} />
          <aside className="fixed right-0 top-0 z-50 h-full w-full max-w-2xl overflow-y-auto border-l border-slate-200 bg-white shadow-xl">
            <div className="sticky top-0 border-b border-slate-200 bg-white px-5 py-4">
              <h3 className="text-lg font-bold text-slate-900">Cargo Damage Report Detail</h3>
            </div>

            <div className="space-y-4 px-5 py-4 text-sm">
              <DetailRow label="Date" value={formatDate(selectedReport.incidentDateTime)} />
              <DetailRow
                label="Driver"
                value={
                  selectedReport.driver
                    ? `${selectedReport.driver.firstName} ${selectedReport.driver.lastName}`
                    : '-'
                }
              />
              <DetailRow label="Vehicle" value={selectedReport.vehicle?.plateNumber ?? '-'} />
              <DetailRow label="Company" value={selectedReport.company?.name ?? '-'} />
              <DetailRow label="Cargo name" value={selectedReport.cargoName ?? '-'} />
              <DetailRow label="Cargo owner" value={selectedReport.cargoOwner ?? '-'} />
              <DetailRow label="Description" value={selectedReport.description || '-'} />
              <DetailRow
                label="Damage value"
                value={currency(selectedReport.damageValue)}
              />
              <DetailRow label="Status" value={selectedReport.status} />
            </div>

            <div className="sticky bottom-0 flex gap-2 border-t border-slate-200 bg-white px-5 py-4">
              <button
                type="button"
                onClick={() => setStatus(selectedReport.id, 'under_review')}
                disabled={selectedReport.status === 'under_review'}
                className="rounded border border-blue-300 px-3 py-2 text-sm text-blue-700 hover:bg-blue-50 disabled:opacity-50"
              >
                Mark Under Review
              </button>
              <button
                type="button"
                onClick={() => setStatus(selectedReport.id, 'resolved')}
                disabled={selectedReport.status === 'resolved'}
                className="rounded border border-emerald-300 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
              >
                Resolve
              </button>
              <button
                type="button"
                onClick={() => setStatus(selectedReport.id, 'rejected')}
                disabled={selectedReport.status === 'rejected'}
                className="rounded border border-rose-300 px-3 py-2 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-50"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="ml-auto rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </aside>
        </>
      )}

      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
        <AlertTriangle className="mr-1 inline-block h-4 w-4" />
        Cargo damage is tracked separately from traffic accidents. Resolved cargo reports feed driver
        risk score breakdown.
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
