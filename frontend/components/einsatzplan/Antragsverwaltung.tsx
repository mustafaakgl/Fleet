'use client';

import { useMemo, useState } from 'react';
import { Printer, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFleetData } from '@/context/FleetDataContext';
import { createAntraegeFromRequests } from '@/lib/request-antraege';
import { FLEET_LIST_CARD, FLEET_RAW_TH, FLEET_RAW_THEAD } from '@/lib/fleet-table';
import { cn } from '@/lib/utils';

function statusClass(value: string) {
  if (value === 'angenommen') return 'bg-emerald-100 text-emerald-700';
  if (value === 'abgelehnt') return 'bg-rose-100 text-rose-700';
  if (value === 'storniert') return 'bg-slate-200 text-slate-700';
  return 'bg-amber-100 text-amber-700';
}

const KNOWN_STATUSES = ['angenommen', 'abgelehnt', 'storniert', 'beantragt'];

export function Antragsverwaltung() {
  const { t } = useTranslation();
  const statusLabel = (value: string) =>
    KNOWN_STATUSES.includes(value) ? t(`antrag.status.${value}`) : value;
  const { requests, cancelRequest, refetchHydrate } = useFleetData();
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'Antragsdatum, Antragsart' | 'Antragsart, Antragsdatum'>('Antragsdatum, Antragsart');
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
  }, [requests, filters, sortBy, toolbarFilter]);

  const selectedRow = rows.find((row) => row.id === selectedRowId) ?? null;

  return (
    <div className="space-y-4 print:space-y-2" id="antragsverwaltung-print">
      <div className="rounded-lg border border-surface-border bg-surface px-4 py-3 text-xs text-brand-primary">
        {t('antrag.banner')}
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
            {t('antrag.cancel')}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <input
            value={toolbarFilter}
            onChange={(event) => setToolbarFilter(event.target.value)}
            placeholder={t('antrag.filterPlaceholder')}
            className="h-8 w-44 rounded border border-slate-300 px-2 text-xs"
          />
          <button
            type="button"
            onClick={() => {
              refetchHydrate();
            }}
            className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t('antrag.refresh')}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded border border-slate-300 p-1.5 text-slate-700 hover:bg-slate-50 print:hidden"
            aria-label={t('antrag.print')}
          >
            <Printer className="h-4 w-4" />
          </button>
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as 'Antragsdatum, Antragsart' | 'Antragsart, Antragsdatum')}
            className="h-8 rounded border border-slate-300 px-2 text-xs"
          >
            <option value="Antragsdatum, Antragsart">{t('antrag.sortByDateType')}</option>
            <option value="Antragsart, Antragsdatum">{t('antrag.sortByTypeDate')}</option>
          </select>
        </div>
      </div>

      <div className={cn(FLEET_LIST_CARD, 'bg-white')}>
        <div className="overflow-x-auto">
          <table className="min-w-[1960px] border-collapse text-[13px]">
            <thead className={FLEET_RAW_THEAD}>
              <tr>
                <th className={cn(FLEET_RAW_TH, 'border border-slate-200')}>{t('antrag.colAntragsdatum')}</th>
                <th className={cn(FLEET_RAW_TH, 'border border-slate-200')}>{t('antrag.colAntragsart')}</th>
                <th className={cn(FLEET_RAW_TH, 'border border-slate-200')}>{t('antrag.colSonstige')}</th>
                <th className={cn(FLEET_RAW_TH, 'border border-slate-200')}>{t('antrag.colAntragsteller')}</th>
                <th className={cn(FLEET_RAW_TH, 'border border-slate-200')}>{t('antrag.colKommentar')}</th>
                <th className={cn(FLEET_RAW_TH, 'border border-slate-200')}>{t('antrag.colBearbeitungsdatum')}</th>
                <th className={cn(FLEET_RAW_TH, 'border border-slate-200')}>{t('antrag.colBearbeitetVon')}</th>
                <th className={cn(FLEET_RAW_TH, 'border border-slate-200')}>{t('antrag.colVertretung')}</th>
                <th className={cn(FLEET_RAW_TH, 'border border-slate-200')}>{t('antrag.colAnmerkungen')}</th>
                <th className={cn(FLEET_RAW_TH, 'border border-slate-200')}>{t('antrag.colStartdatum')}</th>
                <th className={cn(FLEET_RAW_TH, 'border border-slate-200')}>{t('antrag.colEnddatum')}</th>
                <th className={cn(FLEET_RAW_TH, 'border border-slate-200')}>{t('antrag.colDauer')}</th>
                <th className={cn(FLEET_RAW_TH, 'border border-slate-200')}>{t('antrag.colStatus')}</th>
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
                  <td colSpan={13} className="border border-slate-300 px-3 py-4 text-center text-slate-500">{t('antrag.empty')}</td>
                </tr>
              ) : (
                rows.map((row, index) => {
                  const isSelected = selectedRowId === row.id;
                  const isCancelled = row.status === 'storniert';
                  const baseRowClass = isSelected
                    ? 'bg-surface'
                    : index % 2 === 0
                    ? 'bg-white'
                    : 'bg-slate-50/60';
                  const cancelledClass = isCancelled ? 'text-slate-500 italic line-through' : 'text-slate-800';

                  return (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedRowId(row.id)}
                      className={`${baseRowClass} hover:bg-surface/60 ${cancelledClass}`}
                    >
                      <td className="border border-slate-200 px-3 py-2">{row.antragsdatum}</td>
                      <td className="border border-slate-200 px-3 py-2">{row.antragsart}</td>
                      <td className="border border-slate-200 px-3 py-2">{row.sonstigeAbwesenheit ?? '-'}</td>
                      <td className="border border-slate-200 px-3 py-2">
                        <div>{row.driverName}</div>
                        {row.source === 'request_auto' && (
                          <span className="inline-flex rounded border border-surface-border bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-brand-primary">
                            {t('antrag.autoFromRequest')}
                          </span>
                        )}
                      </td>
                      <td className="border border-slate-200 px-3 py-2">{row.kommentar}</td>
                      <td className="border border-slate-200 px-3 py-2">{row.bearbeitungsdatum}</td>
                      <td className="border border-slate-200 px-3 py-2">{row.bearbeitetVon}</td>
                      <td className="border border-slate-200 px-3 py-2">{row.vertretung}</td>
                      <td className="border border-slate-200 px-3 py-2">{row.anmerkungen}</td>
                      <td className="border border-slate-200 px-3 py-2">{row.dateFrom}</td>
                      <td className="border border-slate-200 px-3 py-2">{row.dateTo}</td>
                      <td className="border border-slate-200 px-3 py-2">{row.dauer}</td>
                      <td className="border border-slate-200 px-3 py-2">
                        <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${statusClass(row.status)}`}>
                          {statusLabel(row.status)}
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
