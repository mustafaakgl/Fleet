'use client';

import { useMemo, useState } from 'react';
import { Printer, RefreshCw } from 'lucide-react';
import { useFleetData } from '@/context/FleetDataContext';
import { createAntraegeFromRequests } from '@/lib/request-antraege';

function statusClass(value: string) {
  if (value === 'angenommen') return 'bg-emerald-100 text-emerald-700';
  if (value === 'abgelehnt') return 'bg-rose-100 text-rose-700';
  if (value === 'storniert') return 'bg-slate-200 text-slate-700';
  return 'bg-amber-100 text-amber-700';
}

export function Antragsverwaltung() {
  const { requests, cancelRequest } = useFleetData();
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'Antragsdatum, Antragsart' | 'Antragsart, Antragsdatum'>('Antragsdatum, Antragsart');
  const [refreshTick, setRefreshTick] = useState(0);
  const [toolbarFilter, setToolbarFilter] = useState('');
  const [filters, setFilters] = useState({
    antragsdatum: '',
    antragsart: '',
    sonstigeAbwesenheit: '',
    antragsteller: '',
    kommentar: '',
    bearbeitungsdatum: '',
    bearbeitetVon: '',
    vertretung: '',
    anmerkungen: '',
    startdatum: '',
    enddatum: '',
    dauer: '',
    status: '',
  });

  const rows = useMemo(() => {
    const generated = createAntraegeFromRequests(requests);

    const filtered = generated.filter((row) => {
      const toolbar = toolbarFilter.trim().toLowerCase();
      const toolbarMatch =
        toolbar.length === 0
        || row.driverName.toLowerCase().includes(toolbar)
        || row.antragsart.toLowerCase().includes(toolbar)
        || row.status.toLowerCase().includes(toolbar)
        || row.requestId.toLowerCase().includes(toolbar);

      const columnMatch =
        row.antragsdatum.toLowerCase().includes(filters.antragsdatum.toLowerCase())
        && row.antragsart.toLowerCase().includes(filters.antragsart.toLowerCase())
        && (row.sonstigeAbwesenheit ?? '-').toLowerCase().includes(filters.sonstigeAbwesenheit.toLowerCase())
        && row.driverName.toLowerCase().includes(filters.antragsteller.toLowerCase())
        && row.kommentar.toLowerCase().includes(filters.kommentar.toLowerCase())
        && row.bearbeitungsdatum.toLowerCase().includes(filters.bearbeitungsdatum.toLowerCase())
        && row.bearbeitetVon.toLowerCase().includes(filters.bearbeitetVon.toLowerCase())
        && row.vertretung.toLowerCase().includes(filters.vertretung.toLowerCase())
        && row.anmerkungen.toLowerCase().includes(filters.anmerkungen.toLowerCase())
        && row.dateFrom.toLowerCase().includes(filters.startdatum.toLowerCase())
        && row.dateTo.toLowerCase().includes(filters.enddatum.toLowerCase())
        && row.dauer.toLowerCase().includes(filters.dauer.toLowerCase())
        && row.status.toLowerCase().includes(filters.status.toLowerCase());

      return toolbarMatch && columnMatch;
    });

    return filtered.sort((a, b) => {
      if (sortBy === 'Antragsdatum, Antragsart') {
        if (a.antragsdatum === b.antragsdatum) return a.antragsart.localeCompare(b.antragsart);
        return a.antragsdatum.localeCompare(b.antragsdatum);
      }

      if (a.antragsart === b.antragsart) return a.antragsdatum.localeCompare(b.antragsdatum);
      return a.antragsart.localeCompare(b.antragsart);
    });
  }, [requests, filters, sortBy, toolbarFilter, refreshTick]);

  const selectedRow = rows.find((row) => row.id === selectedRowId) ?? null;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800">
        Antragsverwaltung ist read-only. Zeilen werden automatisch aus Requests erzeugt.
      </div>

      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!selectedRow || selectedRow.status === 'storniert'}
            onClick={() => {
              if (!selectedRow) return;
              cancelRequest(selectedRow.requestId);
              setSelectedRowId(null);
            }}
            className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Antrag stornieren
          </button>
        </div>

        <div className="flex items-center gap-2">
          <input
            value={toolbarFilter}
            onChange={(event) => setToolbarFilter(event.target.value)}
            placeholder="Filter deaktiviert"
            className="h-8 w-44 rounded border border-slate-300 px-2 text-xs"
          />
          <button
            type="button"
            onClick={() => setRefreshTick((value) => value + 1)}
            className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Aktualisieren
          </button>
          <button type="button" className="rounded border border-slate-300 p-1.5 text-slate-700 hover:bg-slate-50" aria-label="Print">
            <Printer className="h-4 w-4" />
          </button>
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as 'Antragsdatum, Antragsart' | 'Antragsart, Antragsdatum')}
            className="h-8 rounded border border-slate-300 px-2 text-xs"
          >
            <option>Antragsdatum, Antragsart</option>
            <option>Antragsart, Antragsdatum</option>
          </select>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[1960px] border-collapse text-[11px]">
            <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="border border-slate-300 px-2 py-2">Antragsdatum</th>
                <th className="border border-slate-300 px-2 py-2">Antragsart</th>
                <th className="border border-slate-300 px-2 py-2">Sonstige Abwesenheit</th>
                <th className="border border-slate-300 px-2 py-2">Antragsteller</th>
                <th className="border border-slate-300 px-2 py-2">Kommentar</th>
                <th className="border border-slate-300 px-2 py-2">Bearbeitungsdatum</th>
                <th className="border border-slate-300 px-2 py-2">Bearbeitet von</th>
                <th className="border border-slate-300 px-2 py-2">Vertretung</th>
                <th className="border border-slate-300 px-2 py-2">Anmerkungen</th>
                <th className="border border-slate-300 px-2 py-2">Startdatum</th>
                <th className="border border-slate-300 px-2 py-2">Enddatum</th>
                <th className="border border-slate-300 px-2 py-2">Dauer</th>
                <th className="border border-slate-300 px-2 py-2">Status</th>
              </tr>
              <tr className="bg-white">
                <th className="border border-slate-300 p-1"><input value={filters.antragsdatum} onChange={(e) => setFilters((cur) => ({ ...cur, antragsdatum: e.target.value }))} className="h-6 w-full rounded border border-slate-300 px-1 text-[10px]" /></th>
                <th className="border border-slate-300 p-1"><input value={filters.antragsart} onChange={(e) => setFilters((cur) => ({ ...cur, antragsart: e.target.value }))} className="h-6 w-full rounded border border-slate-300 px-1 text-[10px]" /></th>
                <th className="border border-slate-300 p-1"><input value={filters.sonstigeAbwesenheit} onChange={(e) => setFilters((cur) => ({ ...cur, sonstigeAbwesenheit: e.target.value }))} className="h-6 w-full rounded border border-slate-300 px-1 text-[10px]" /></th>
                <th className="border border-slate-300 p-1"><input value={filters.antragsteller} onChange={(e) => setFilters((cur) => ({ ...cur, antragsteller: e.target.value }))} className="h-6 w-full rounded border border-slate-300 px-1 text-[10px]" /></th>
                <th className="border border-slate-300 p-1"><input value={filters.kommentar} onChange={(e) => setFilters((cur) => ({ ...cur, kommentar: e.target.value }))} className="h-6 w-full rounded border border-slate-300 px-1 text-[10px]" /></th>
                <th className="border border-slate-300 p-1"><input value={filters.bearbeitungsdatum} onChange={(e) => setFilters((cur) => ({ ...cur, bearbeitungsdatum: e.target.value }))} className="h-6 w-full rounded border border-slate-300 px-1 text-[10px]" /></th>
                <th className="border border-slate-300 p-1"><input value={filters.bearbeitetVon} onChange={(e) => setFilters((cur) => ({ ...cur, bearbeitetVon: e.target.value }))} className="h-6 w-full rounded border border-slate-300 px-1 text-[10px]" /></th>
                <th className="border border-slate-300 p-1"><input value={filters.vertretung} onChange={(e) => setFilters((cur) => ({ ...cur, vertretung: e.target.value }))} className="h-6 w-full rounded border border-slate-300 px-1 text-[10px]" /></th>
                <th className="border border-slate-300 p-1"><input value={filters.anmerkungen} onChange={(e) => setFilters((cur) => ({ ...cur, anmerkungen: e.target.value }))} className="h-6 w-full rounded border border-slate-300 px-1 text-[10px]" /></th>
                <th className="border border-slate-300 p-1"><input value={filters.startdatum} onChange={(e) => setFilters((cur) => ({ ...cur, startdatum: e.target.value }))} className="h-6 w-full rounded border border-slate-300 px-1 text-[10px]" /></th>
                <th className="border border-slate-300 p-1"><input value={filters.enddatum} onChange={(e) => setFilters((cur) => ({ ...cur, enddatum: e.target.value }))} className="h-6 w-full rounded border border-slate-300 px-1 text-[10px]" /></th>
                <th className="border border-slate-300 p-1"><input value={filters.dauer} onChange={(e) => setFilters((cur) => ({ ...cur, dauer: e.target.value }))} className="h-6 w-full rounded border border-slate-300 px-1 text-[10px]" /></th>
                <th className="border border-slate-300 p-1"><input value={filters.status} onChange={(e) => setFilters((cur) => ({ ...cur, status: e.target.value }))} className="h-6 w-full rounded border border-slate-300 px-1 text-[10px]" /></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="border border-slate-300 px-3 py-4 text-center text-slate-500">No calendar-related requests available.</td>
                </tr>
              ) : (
                rows.map((row, index) => {
                  const isSelected = selectedRowId === row.id;
                  const isCancelled = row.status === 'storniert';
                  const baseRowClass = isSelected
                    ? 'bg-blue-50'
                    : index % 2 === 0
                    ? 'bg-white'
                    : 'bg-slate-50/60';
                  const cancelledClass = isCancelled ? 'text-slate-500 italic line-through' : 'text-slate-800';

                  return (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedRowId(row.id)}
                      className={`${baseRowClass} hover:bg-blue-50/60 ${cancelledClass}`}
                    >
                      <td className="border border-slate-300 px-2 py-1.5">{row.antragsdatum}</td>
                      <td className="border border-slate-300 px-2 py-1.5">{row.antragsart}</td>
                      <td className="border border-slate-300 px-2 py-1.5">{row.sonstigeAbwesenheit ?? '-'}</td>
                      <td className="border border-slate-300 px-2 py-1.5">
                        <div>{row.driverName}</div>
                        {row.source === 'request_auto' && (
                          <span className="inline-flex rounded border border-blue-200 bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                            Auto from Request
                          </span>
                        )}
                      </td>
                      <td className="border border-slate-300 px-2 py-1.5">{row.kommentar}</td>
                      <td className="border border-slate-300 px-2 py-1.5">{row.bearbeitungsdatum}</td>
                      <td className="border border-slate-300 px-2 py-1.5">{row.bearbeitetVon}</td>
                      <td className="border border-slate-300 px-2 py-1.5">{row.vertretung}</td>
                      <td className="border border-slate-300 px-2 py-1.5">{row.anmerkungen}</td>
                      <td className="border border-slate-300 px-2 py-1.5">{row.dateFrom}</td>
                      <td className="border border-slate-300 px-2 py-1.5">{row.dateTo}</td>
                      <td className="border border-slate-300 px-2 py-1.5">{row.dauer}</td>
                      <td className="border border-slate-300 px-2 py-1.5">
                        <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${statusClass(row.status)}`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
