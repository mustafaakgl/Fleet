'use client';

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getTodayDate, type FleetAssignment, useFleetData } from '@/context/FleetDataContext';
import { CustomerAssignmentMessagesPanel } from '@/components/customer-portal/CustomerAssignmentMessagesPanel';
import { CompanyAssignmentBoard } from './CompanyAssignmentBoard';
import { groupAssignmentsByCompany, TRAILER_BY_VEHICLE } from './companyBoard';

interface StatusBlockItem {
  name: string;
  until: string;
}

interface TagesuebersichtAbsences {
  urlaub: StatusBlockItem[];
  kuendigung: StatusBlockItem[];
  krank: StatusBlockItem[];
}

interface TagesuebersichtExportAssignment {
  company: string;
  driver: string;
  vehicle: string;
  trailer: string;
  startTime: string;
  cargo: string;
  pickupAddress: string;
  deliveryAddress: string;
  notes: string;
}

function formatShortDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}`;
}

function toDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

function addDays(value: string, days: number) {
  const date = toDate(value);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatHeaderDate(value: string) {
  const date = toDate(value);
  const weekday = new Intl.DateTimeFormat('de-DE', { weekday: 'long' }).format(date);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `Einsatzplan - ${weekday}, ${day}.${month}.${year}`;
}

export async function exportCurrentTagesuebersichtToExcel({
  selectedDate,
  absences,
  assignments,
}: {
  selectedDate: string;
  absences: TagesuebersichtAbsences;
  assignments: TagesuebersichtExportAssignment[];
}) {
  // npm install xlsx
  const moduleName = 'xlsx';
  const XLSX = await import(moduleName);

  const workbook = XLSX.utils.book_new();

  const overviewSheet = XLSX.utils.aoa_to_sheet([
    ['Selected Date', selectedDate],
  ]);
  XLSX.utils.book_append_sheet(workbook, overviewSheet, 'Overview');

  const absenceRows = [
    ...absences.urlaub.map((item) => ({ Type: 'Urlaub', Driver: item.name, Until: item.until })),
    ...absences.kuendigung.map((item) => ({ Type: 'Kundigung', Driver: item.name, Until: item.until })),
    ...absences.krank.map((item) => ({ Type: 'Krank', Driver: item.name, Until: item.until })),
  ];
  const absencesSheet = XLSX.utils.json_to_sheet(absenceRows);
  XLSX.utils.book_append_sheet(workbook, absencesSheet, 'Absences');

  const assignmentsSheet = XLSX.utils.json_to_sheet(
    assignments.map((item) => ({
      Company: item.company,
      Driver: item.driver,
      Vehicle: item.vehicle,
      Trailer: item.trailer,
      'Start Time': item.startTime,
      Cargo: item.cargo,
      'Pickup Address': item.pickupAddress,
      'Delivery Address': item.deliveryAddress,
      Notes: item.notes,
    })),
  );
  XLSX.utils.book_append_sheet(workbook, assignmentsSheet, 'Assignments');

  XLSX.writeFile(workbook, `tagesuebersicht_${selectedDate}.xlsx`);
}

export function TagesuebersichtTab({ planningDate }: { planningDate?: string }) {
  const { t } = useTranslation();
  const { assignments, drivers, requests, getDriverAvailability, updateAssignment, completeAssignment, cancelAssignment } = useFleetData();

  const [selectedDate, setSelectedDate] = useState(planningDate ?? getTodayDate());

  useEffect(() => {
    if (planningDate) setSelectedDate(planningDate);
  }, [planningDate]);

  const absenceBlocks = useMemo<TagesuebersichtAbsences>(() => {
    const urlaub: StatusBlockItem[] = [];
    const krank: StatusBlockItem[] = [];

    for (const driver of drivers) {
      const availability = getDriverAvailability(driver.id, selectedDate);
      if (availability !== 'Urlaub' && availability !== 'Krank') continue;

      const matchingRequest = requests.find(
        (request) =>
          request.driverId === driver.id
          && request.dateFrom
          && request.dateTo
          && request.dateFrom <= selectedDate
          && request.dateTo >= selectedDate,
      );
      const until = matchingRequest?.dateTo
        ? formatShortDate(matchingRequest.dateTo)
        : formatShortDate(selectedDate);
      const shortName = driver.name.split(' ')[0] ?? driver.name;
      const item = { name: shortName, until };

      if (availability === 'Urlaub') urlaub.push(item);
      else krank.push(item);
    }

    return { urlaub, kuendigung: [], krank };
  }, [drivers, getDriverAvailability, requests, selectedDate]);
  const [driverSearch, setDriverSearch] = useState('');
  const [companySearch, setCompanySearch] = useState('');
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editDraft, setEditDraft] = useState<Partial<FleetAssignment>>({});
  const [toast, setToast] = useState<string | null>(null);

  const selectedAssignment = useMemo(
    () => assignments.find((assignment) => assignment.id === selectedAssignmentId) ?? null,
    [assignments, selectedAssignmentId],
  );

  const blockedDriverIds = useMemo(() => {
    return drivers
      .filter((driver) => {
        const availability = getDriverAvailability(driver.id, selectedDate);
        return availability === 'Urlaub' || availability === 'Krank';
      })
      .map((driver) => driver.id);
  }, [drivers, getDriverAvailability, selectedDate]);

  const assignmentPool = useMemo(() => {
    return assignments.filter((assignment) => {
      if (assignment.date !== selectedDate) return false;
      if (!['manual', 'mobile_checkin', 'transport_request'].includes(assignment.source)) return false;
      if (blockedDriverIds.includes(assignment.driverId)) return false;

      const driverName = drivers.find((driver) => driver.id === assignment.driverId)?.name ?? assignment.driverId;
      const matchesDriver =
        driverSearch.trim().length === 0
        || driverName.toLowerCase().includes(driverSearch.trim().toLowerCase());
      const matchesCompany =
        companySearch.trim().length === 0
        || assignment.company.toLowerCase().includes(companySearch.trim().toLowerCase());

      return matchesDriver && matchesCompany;
    });
  }, [assignments, blockedDriverIds, companySearch, driverSearch, drivers, selectedDate]);

  const companyGroups = useMemo(() => groupAssignmentsByCompany(assignmentPool), [assignmentPool]);

  const exportAssignments = useMemo<TagesuebersichtExportAssignment[]>(() => {
    return companyGroups.flatMap(({ company, rows }) =>
      rows.map((assignment) => {
        const driverName = drivers.find((driver) => driver.id === assignment.driverId)?.name ?? assignment.driverId;
        const trailer = TRAILER_BY_VEHICLE[assignment.vehicle.replace(/-/g, '')] ?? '---';
        return {
          company: company.label,
          driver: driverName,
          vehicle: assignment.vehicle || '-',
          trailer,
          startTime: assignment.startTime || '-',
          cargo: assignment.cargoName || '-',
          pickupAddress: assignment.pickupAddress || '-',
          deliveryAddress: assignment.deliveryAddress || '-',
          notes: assignment.notes || '-',
        };
      }),
    );
  }, [companyGroups, drivers]);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  }

  function openDrawer(assignment: FleetAssignment) {
    setSelectedAssignmentId(assignment.id);
    setEditMode(false);
    setEditDraft({});
  }

  function beginEdit() {
    if (!selectedAssignment) return;
    setEditDraft({
      vehicle: selectedAssignment.vehicle,
      company: selectedAssignment.company,
      startTime: selectedAssignment.startTime,
      endTime: selectedAssignment.endTime,
      notes: selectedAssignment.notes,
      cargoName: selectedAssignment.cargoName,
      cargoOwner: selectedAssignment.cargoOwner,
      pickupAddress: selectedAssignment.pickupAddress,
      deliveryAddress: selectedAssignment.deliveryAddress,
    });
    setEditMode(true);
  }

  function saveEdit() {
    if (!selectedAssignment) return;
    updateAssignment(selectedAssignment.id, editDraft);
    setEditMode(false);
    showToast(t('tagesueber.toastUpdated'));
  }

  async function removeAssignment() {
    if (!selectedAssignment) return;
    const result = await cancelAssignment(selectedAssignment.id);
    if (result.success) {
      setSelectedAssignmentId(null);
      showToast(t('tagesueber.toastRemoved'));
      return;
    }
    showToast(result.message);
  }

  async function markCompleted() {
    if (!selectedAssignment) return;
    const result = await completeAssignment(selectedAssignment.id);
    showToast(result.success ? t('tagesueber.toastCompleted') : result.message);
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-slate-300 bg-white p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('tagesueber.date')}</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="h-8 rounded border border-slate-300 px-2 text-xs text-slate-800"
            />
          </label>
          <button
            type="button"
            onClick={() => setSelectedDate(getTodayDate())}
            className="h-8 rounded border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {t('tagesueber.today')}
          </button>
          <button
            type="button"
            onClick={() => setSelectedDate(addDays(getTodayDate(), 1))}
            className="h-8 rounded border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {t('tagesueber.tomorrow')}
          </button>

          <label className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('tagesueber.searchDriver')}</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-slate-400" />
              <input
                value={driverSearch}
                onChange={(event) => setDriverSearch(event.target.value)}
                placeholder={t('tagesueber.driverPh')}
                className="h-8 w-40 rounded border border-slate-300 pl-7 pr-2 text-xs text-slate-800"
              />
            </div>
          </label>

          <label className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('tagesueber.searchCompany')}</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-slate-400" />
              <input
                value={companySearch}
                onChange={(event) => setCompanySearch(event.target.value)}
                placeholder={t('tagesueber.companyPh')}
                className="h-8 w-44 rounded border border-slate-300 pl-7 pr-2 text-xs text-slate-800"
              />
            </div>
          </label>

          <button
            type="button"
            onClick={() => {
              setSelectedAssignmentId(null);
              showToast(t('tagesueber.toastRefreshed'));
            }}
            className="inline-flex h-8 items-center gap-1 rounded border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t('tagesueber.refresh')}
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                await exportCurrentTagesuebersichtToExcel({
                  selectedDate,
                  absences: absenceBlocks,
                  assignments: exportAssignments,
                });
                showToast(t('tagesueber.toastExported'));
              } catch {
                showToast(t('tagesueber.toastXlsxMissing'));
              }
            }}
            className="inline-flex h-8 items-center gap-1 rounded border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {t('tagesueber.exportExcel')}
          </button>
        </div>

        <p className="mt-3 text-sm font-semibold text-slate-900">{formatHeaderDate(selectedDate)}</p>
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
        <StatusBlock title={t('tagesueber.urlaub')} rows={absenceBlocks.urlaub} className="border-emerald-300" titleClassName="text-emerald-700" />
        <StatusBlock title={t('tagesueber.kuendigung')} rows={absenceBlocks.kuendigung} className="border-amber-300" titleClassName="text-amber-700" />
        <StatusBlock title={t('tagesueber.krank')} rows={absenceBlocks.krank} className="border-rose-300" titleClassName="text-rose-700" />
      </div>

      <div className="max-h-[58vh] overflow-auto rounded-md border border-slate-300 bg-white p-2">
        <CompanyAssignmentBoard
          groups={companyGroups}
          drivers={drivers}
          onAssignmentClick={openDrawer}
          emptyMessage={t('tagesueber.empty')}
        />
      </div>

      {selectedAssignment && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setSelectedAssignmentId(null)} />
          <aside className="fixed right-0 top-0 z-50 h-full w-full max-w-lg overflow-y-auto border-l border-slate-300 bg-white shadow-xl">
            <div className="border-b border-slate-300 px-4 py-3">
              <h3 className="text-sm font-bold text-slate-900">{t('tagesueber.drawerTitle')}</h3>
            </div>

            <div className="space-y-3 px-4 py-3 text-sm">
              <DrawerRow label={t('tagesueber.driver')} value={drivers.find((driver) => driver.id === selectedAssignment.driverId)?.name ?? selectedAssignment.driverId} />
              <DrawerEditableRow label={t('tagesueber.vehicle')} value={editMode ? String(editDraft.vehicle ?? '') : selectedAssignment.vehicle || '-'} onChange={(value) => setEditDraft((current) => ({ ...current, vehicle: value }))} editMode={editMode} />
              <DrawerRow label={t('tagesueber.trailer')} value={TRAILER_BY_VEHICLE[selectedAssignment.vehicle.replace(/-/g, '')] ?? '---'} />
              <DrawerEditableRow label={t('tagesueber.company')} value={editMode ? String(editDraft.company ?? '') : selectedAssignment.company || '-'} onChange={(value) => setEditDraft((current) => ({ ...current, company: value }))} editMode={editMode} />
              <DrawerEditableRow label={t('tagesueber.cargo')} value={editMode ? String(editDraft.cargoName ?? '') : selectedAssignment.cargoName || '-'} onChange={(value) => setEditDraft((current) => ({ ...current, cargoName: value }))} editMode={editMode} />
              <DrawerEditableRow label={t('tagesueber.cargoOwner')} value={editMode ? String(editDraft.cargoOwner ?? '') : selectedAssignment.cargoOwner || '-'} onChange={(value) => setEditDraft((current) => ({ ...current, cargoOwner: value }))} editMode={editMode} />
              <DrawerEditableRow label={t('tagesueber.pickupAddress')} value={editMode ? String(editDraft.pickupAddress ?? '') : selectedAssignment.pickupAddress || '-'} onChange={(value) => setEditDraft((current) => ({ ...current, pickupAddress: value }))} editMode={editMode} />
              <DrawerEditableRow label={t('tagesueber.deliveryAddress')} value={editMode ? String(editDraft.deliveryAddress ?? '') : selectedAssignment.deliveryAddress || '-'} onChange={(value) => setEditDraft((current) => ({ ...current, deliveryAddress: value }))} editMode={editMode} />
              <DrawerEditableRow label={t('tagesueber.startTime')} value={editMode ? String(editDraft.startTime ?? '') : selectedAssignment.startTime || '-'} onChange={(value) => setEditDraft((current) => ({ ...current, startTime: value }))} editMode={editMode} />
              <DrawerEditableRow label={t('tagesueber.endTime')} value={editMode ? String(editDraft.endTime ?? '') : selectedAssignment.endTime || '-'} onChange={(value) => setEditDraft((current) => ({ ...current, endTime: value }))} editMode={editMode} />
              <DrawerEditableRow label={t('tagesueber.notes')} value={editMode ? String(editDraft.notes ?? '') : selectedAssignment.notes || '-'} onChange={(value) => setEditDraft((current) => ({ ...current, notes: value }))} editMode={editMode} />
              <CustomerAssignmentMessagesPanel assignmentId={selectedAssignment.id} variant="fleet" />
            </div>

            <div className="sticky bottom-0 flex flex-wrap gap-2 border-t border-slate-300 bg-white px-4 py-3">
              {editMode ? (
                <button
                  type="button"
                  onClick={saveEdit}
                  className="rounded border border-[#163a5c] px-3 py-1.5 text-xs font-semibold text-[#1a4d7a] hover:bg-[#e8f0f8]"
                >
                  {t('tagesueber.save')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={beginEdit}
                  className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {t('tagesueber.edit')}
                </button>
              )}
              <button
                type="button"
                onClick={removeAssignment}
                className="rounded border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
              >
                {t('tagesueber.remove')}
              </button>
              <button
                type="button"
                onClick={markCompleted}
                className="rounded border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
              >
                {t('tagesueber.markCompleted')}
              </button>
              <button
                type="button"
                onClick={() => setSelectedAssignmentId(null)}
                className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {t('tagesueber.close')}
              </button>
            </div>
          </aside>
        </>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function StatusBlock({
  title,
  rows,
  className,
  titleClassName,
}: {
  title: string;
  rows: StatusBlockItem[];
  className: string;
  titleClassName: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={`rounded-md border bg-white ${className}`}>
      <div className="border-b border-slate-200 px-2 py-1">
        <p className={`text-xs font-bold uppercase tracking-wide ${titleClassName}`}>{title}</p>
      </div>
      <div className="space-y-1 px-2 py-2 text-xs text-slate-800">
        {rows.map((row) => (
          <div key={`${title}-${row.name}`} className="flex items-center justify-between border-b border-slate-100 pb-1 last:border-b-0">
            <span className="font-medium">{row.name}</span>
            <span className="text-slate-500">{t('tagesueber.until', { date: row.until })}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DrawerRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 border-b border-slate-100 pb-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm text-slate-900">{value}</p>
    </div>
  );
}

function DrawerEditableRow({
  label,
  value,
  onChange,
  editMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  editMode: boolean;
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 border-b border-slate-100 pb-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      {editMode ? (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 rounded border border-slate-300 px-2 text-sm text-slate-900"
        />
      ) : (
        <p className="text-sm text-slate-900">{value}</p>
      )}
    </div>
  );
}
