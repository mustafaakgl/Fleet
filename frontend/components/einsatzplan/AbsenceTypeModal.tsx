'use client';

import { Check, Minus, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import {
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

export type AbsenceTypeAbbreviation =
  | 'SU'
  | 'PU'
  | 'SCH'
  | 'BH'
  | 'KA'
  | 'SA'
  | 'HO'
  | 'GR'
  | 'Aus'
  | 'k. Auftrag'
  | 'unent.Fehlen';

export interface AbsenceType {
  id: string;
  bezeichnung: string;
  abkuerzung: AbsenceTypeAbbreviation;
  gutschrift: boolean;
  allowOvertime: boolean;
  antragstyp: string;
  aktiv: boolean;
}

interface AbsenceTypeModalProps {
  open: boolean;
  absenceTypes: AbsenceType[];
  selectedTypeId: string | null;
  onSelect: (typeId: string) => void;
  onClose: () => void;
  onApply: () => void;
}

export function AbsenceTypeModal({
  open,
  absenceTypes,
  selectedTypeId,
  onSelect,
  onClose,
  onApply,
}: AbsenceTypeModalProps) {
  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/25" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-[min(1200px,96vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900">Abwesenheitstyp auswählen</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 p-2 text-slate-500 hover:bg-slate-50"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Plus className="h-4 w-4 text-[#1a4d7a]" />
              Abwesenheitstyp hinzufügen
            </button>
            <button type="button" className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Trash2 className="h-4 w-4 text-[#1a4d7a]" />
              Abwesenheitstyp löschen
            </button>
            <button type="button" className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <RefreshCw className="h-4 w-4 text-[#1a4d7a]" />
              Aktualisieren
            </button>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-auto p-5">
          <table className={FLEET_RAW_TABLE}>
            <thead className={cn('sticky top-0', FLEET_RAW_THEAD)}>
              <tr>
                <th className={FLEET_RAW_TH}>Bezeichnung</th>
                <th className={FLEET_RAW_TH}>Abkürzung</th>
                <th className={FLEET_RAW_TH}>Gutschrift als bezahlte Nichtarbeitszeit</th>
                <th className={FLEET_RAW_TH}>Erlaube Überschreitung der Regelarbeitszeit</th>
                <th className={FLEET_RAW_TH}>Antragstyp</th>
                <th className={FLEET_RAW_TH}>Aktiv</th>
              </tr>
            </thead>
            <tbody className={FLEET_RAW_TBODY}>
              {absenceTypes.map((absenceType) => {
                const selected = selectedTypeId === absenceType.id;
                return (
                  <tr
                    key={absenceType.id}
                    onClick={() => onSelect(absenceType.id)}
                    className={cn(
                      'cursor-pointer',
                      FLEET_RAW_TR,
                      selected ? 'bg-[#e8f0f8]' : 'bg-white',
                    )}
                  >
                    <td className={FLEET_RAW_TD_PRIMARY}>{absenceType.bezeichnung}</td>
                    <td className={FLEET_RAW_TD_MUTED}>{absenceType.abkuerzung}</td>
                    <td className={FLEET_RAW_TD}>
                      {absenceType.gutschrift ? <Check className="h-4 w-4 text-emerald-600" /> : <Minus className="h-4 w-4 text-rose-600" />}
                    </td>
                    <td className={FLEET_RAW_TD}>
                      {absenceType.allowOvertime ? <Check className="h-4 w-4 text-emerald-600" /> : <Minus className="h-4 w-4 text-rose-600" />}
                    </td>
                    <td className={FLEET_RAW_TD_MUTED}>{absenceType.antragstyp}</td>
                    <td className={FLEET_RAW_TD}>
                      {absenceType.aktiv ? <Check className="h-4 w-4 text-emerald-600" /> : <Minus className="h-4 w-4 text-rose-600" />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Abbrechen
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={!selectedTypeId}
            className="rounded-md bg-[#1a4d7a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b2342] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Übernehmen
          </button>
        </div>
      </div>
    </>
  );
}
