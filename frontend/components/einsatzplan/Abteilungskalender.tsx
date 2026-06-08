'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AbsenceTypeModal, type AbsenceType, type AbsenceTypeAbbreviation } from './AbsenceTypeModal';
import { CalendarCellContextMenu, type CalendarCellContextMenuAction } from './CalendarCellContextMenu';
import { CalendarStatusTooltip, type TooltipSource } from './CalendarStatusTooltip';
import { useFleetData } from '@/context/FleetDataContext';
import { calendarApi } from '@/lib/api';
import { toCalendarApiStatus } from '@/lib/calendar-status-map';
import { formatAccidentCountLabel, getDriverRiskBadgeClass, getDriverRiskLabel } from '@/lib/utils';

type CalendarStatus = 'FT' | 'UT' | 'KT' | 'AT' | AbsenceTypeAbbreviation | '';
type WorkTimeMode = 'inklusive Arbeitszeiten' | 'exklusive Arbeitszeiten';
type ViewMode = 'Überlappung' | 'Einzelansicht';

interface Department {
  id: string;
  name: string;
  kind: 'internal' | 'external';
}

interface Employee {
  id: string;
  name: string;
  departmentId: string;
}

interface StatusEntry {
  status: CalendarStatus;
  notes: string;
  source?: TooltipSource;
  sourceDate?: string;
  requestId?: string;
  assignmentId?: string;
}

interface HoveredStatusCell {
  employeeId: string;
  day: number;
  month: number;
  year: number;
  entry: StatusEntry;
}

interface SelectedCell {
  employee: Employee;
  department: Department;
  day: number;
  month: number;
  year: number;
  entry: StatusEntry;
}

interface PendingAbsenceSelection {
  employee: Employee;
  department: Department;
  day: number;
  month: number;
  year: number;
}

interface SelectedEmptyCell {
  employee: Employee;
  department: Department;
  day: number;
  month: number;
  year: number;
}

function slugifyDepartment(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'general';
}

function formatMonthDate(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const monthLabels = [
  'Januar',
  'Februar',
  'Marz',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

const statusNames: Record<Exclude<CalendarStatus, ''>, string> = {
  FT: 'Feiertag',
  UT: 'Urlaubstag',
  KT: 'Krankheitstag',
  AT: 'Arbeitstag',
  SU: 'Sonderurlaub',
  PU: 'Pflegefreistellung',
  SCH: 'Schulung',
  BH: 'Bundesheer',
  KA: 'Karenz',
  SA: 'Sonstige Abwesenheiten',
  HO: 'Homeoffice',
  GR: 'Geschäftsreise',
  Aus: 'Ausgeschieden',
  'k. Auftrag': 'Kein Auftrag des AG',
  'unent.Fehlen': 'unentschuldigtes Fehlen',
};

const statusColors: Record<Exclude<CalendarStatus, ''>, string> = {
  FT: 'bg-pink-400 text-pink-700',
  UT: 'bg-emerald-500 text-emerald-700',
  KT: 'bg-red-500 text-red-700',
  AT: 'bg-blue-500 text-blue-700',
  SU: 'bg-violet-500 text-violet-700',
  PU: 'bg-violet-500 text-violet-700',
  SCH: 'bg-blue-500 text-blue-700',
  BH: 'bg-slate-500 text-slate-700',
  KA: 'bg-violet-500 text-violet-700',
  SA: 'bg-violet-500 text-violet-700',
  HO: 'bg-teal-500 text-teal-700',
  GR: 'bg-orange-500 text-orange-700',
  Aus: 'bg-slate-700 text-slate-800',
  'k. Auftrag': 'bg-amber-700 text-amber-800',
  'unent.Fehlen': 'bg-red-600 text-red-700',
};

const absenceTypes: AbsenceType[] = [
  { id: 'su-1', bezeichnung: 'Sonderurlaub', abkuerzung: 'SU', gutschrift: true, allowOvertime: false, antragstyp: 'Workflow (laut Zuständigkeiten)', aktiv: true },
  { id: 'pu', bezeichnung: 'Pflegefreistellung', abkuerzung: 'PU', gutschrift: true, allowOvertime: false, antragstyp: 'Workflow (laut Zuständigkeiten)', aktiv: true },
  { id: 'sch', bezeichnung: 'Schulung', abkuerzung: 'SCH', gutschrift: true, allowOvertime: true, antragstyp: 'Workflow (laut Zuständigkeiten)', aktiv: true },
  { id: 'bh', bezeichnung: 'Bundesheer', abkuerzung: 'BH', gutschrift: true, allowOvertime: false, antragstyp: 'Workflow (laut Zuständigkeiten)', aktiv: false },
  { id: 'su-2', bezeichnung: 'Umzugsurlaub', abkuerzung: 'SU', gutschrift: true, allowOvertime: false, antragstyp: 'Workflow (laut Zuständigkeiten)', aktiv: false },
  { id: 'ka', bezeichnung: 'Karenz', abkuerzung: 'KA', gutschrift: true, allowOvertime: false, antragstyp: 'Workflow (laut Zuständigkeiten)', aktiv: true },
  { id: 'sa', bezeichnung: 'Sonstige Abwesenheiten', abkuerzung: 'SA', gutschrift: true, allowOvertime: false, antragstyp: 'Workflow (laut Zuständigkeiten)', aktiv: true },
  { id: 'ho', bezeichnung: 'Homeoffice', abkuerzung: 'HO', gutschrift: false, allowOvertime: false, antragstyp: 'Workflow (laut Zuständigkeiten)', aktiv: true },
  { id: 'gr', bezeichnung: 'Geschäftsreise', abkuerzung: 'GR', gutschrift: true, allowOvertime: true, antragstyp: 'Workflow (laut Zuständigkeiten)', aktiv: false },
  { id: 'aus', bezeichnung: 'Ausgeschieden', abkuerzung: 'Aus', gutschrift: false, allowOvertime: false, antragstyp: 'Workflow (laut Zuständigkeiten)', aktiv: true },
  { id: 'k-auftrag', bezeichnung: 'Kein Auftrag des AG', abkuerzung: 'k. Auftrag', gutschrift: false, allowOvertime: false, antragstyp: 'Workflow (laut Zuständigkeiten)', aktiv: true },
  { id: 'unent', bezeichnung: 'unentschuldigtes Fehlen', abkuerzung: 'unent.Fehlen', gutschrift: false, allowOvertime: false, antragstyp: 'Workflow (laut Zuständigkeiten)', aktiv: true },
];

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function isWeekend(year: number, month: number, day: number) {
  const value = new Date(year, month, day).getDay();
  return value === 0 || value === 6;
}

export function Abteilungskalender({ statusFocus }: { statusFocus?: 'UT' | 'KT' }) {
  const { t } = useTranslation();
  const { drivers, getCalendarStatusEntry, getAssignmentById } = useFleetData();
  const now = new Date();
  const [statusMap, setStatusMap] = useState<Record<string, Record<string, StatusEntry>>>({});
  const [apiCalendarMap, setApiCalendarMap] = useState<Record<string, Record<string, StatusEntry>>>({});
  const departments = useMemo<Department[]>(() => {
    const names = [...new Set(drivers.map((driver) => driver.department).filter(Boolean))].sort();
    return names.map((name) => ({
      id: slugifyDepartment(name),
      name,
      kind: name === 'Operations' || name === 'Office' ? 'internal' : 'external',
    }));
  }, [drivers]);
  const employees = useMemo<Employee[]>(
    () =>
      drivers.map((driver) => ({
        id: driver.id,
        name: driver.name,
        departmentId: slugifyDepartment(driver.department),
      })),
    [drivers],
  );
  const [selectedDepartmentIds, setSelectedDepartmentIds] = useState<string[]>([]);
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [workTimeMode, setWorkTimeMode] = useState<WorkTimeMode>('inklusive Arbeitszeiten');
  const [viewMode, setViewMode] = useState<ViewMode>('Überlappung');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [collapsedDepartments, setCollapsedDepartments] = useState<Record<string, boolean>>({});
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [pendingAbsenceSelection, setPendingAbsenceSelection] = useState<PendingAbsenceSelection | null>(null);
  const [selectedAbsenceTypeId, setSelectedAbsenceTypeId] = useState<string | null>(null);
  const [hoveredStatusCell, setHoveredStatusCell] = useState<HoveredStatusCell | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [selectedEmptyCell, setSelectedEmptyCell] = useState<SelectedEmptyCell | null>(null);

  useEffect(() => {
    if (departments.length === 0) {
      return;
    }
    setSelectedDepartmentIds((current) =>
      current.length > 0 ? current : departments.map((department) => department.id),
    );
  }, [departments]);

  useEffect(() => {
    let cancelled = false;
    const from = formatMonthDate(year, month, 1);
    const to = formatMonthDate(year, month, daysInMonth(year, month));

    void calendarApi
      .list({ from, to })
      .then((events) => {
        if (cancelled) {
          return;
        }
        const map: Record<string, Record<string, StatusEntry>> = {};
        for (const event of events) {
          if (event.source !== 'manual') {
            continue;
          }
          const dateStr = (event.date ?? '').slice(0, 10);
          const parts = dateStr.split('-').map(Number);
          if (parts.length !== 3) {
            continue;
          }
          const monthPart = parts[1];
          const dayPart = parts[2];
          if (monthPart - 1 !== month) {
            continue;
          }
          map[event.driverId] ??= {};
          map[event.driverId][`${month}-${dayPart}`] = {
            status: event.status as CalendarStatus,
            notes: 'Manuell eingetragen.',
            source: 'manual',
            sourceDate: dateStr,
          };
        }
        setApiCalendarMap(map);
      })
      .catch(() => {
        if (!cancelled) {
          setApiCalendarMap({});
        }
      });

    return () => {
      cancelled = true;
    };
  }, [year, month]);

  const visibleDepartments = useMemo(() => {
    return departments.filter((department) => selectedDepartmentIds.includes(department.id));
  }, [departments, selectedDepartmentIds]);

  const departmentEmployeeMap = useMemo(() => {
    return visibleDepartments.map((department) => ({
      department,
      employees: employees.filter((employee) => employee.departmentId === department.id),
    }));
  }, [employees, visibleDepartments]);

  const dayCount = useMemo(() => daysInMonth(year, month), [month, year]);

  const getMergedEntry = useMemo(() => {
    return (employeeId: string, day: number): StatusEntry => {
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const shared = getCalendarStatusEntry(employeeId, dateKey);
      if (shared) {
        return {
          status: shared.status as CalendarStatus,
          notes: shared.source === 'request'
            ? `Automatisch aus Request ${shared.requestId ?? ''} aktualisiert.`
            : shared.source === 'assignment'
            ? `Automatisch aus Einsatz ${shared.assignmentId ?? ''} aktualisiert.`
            : 'Automatisch aus gemeinsamer Planung aktualisiert.',
          source: shared.source,
          sourceDate: dateKey,
          requestId: shared.requestId,
          assignmentId: shared.assignmentId,
        };
      }

      const persisted = apiCalendarMap[employeeId]?.[`${month}-${day}`];
      if (persisted) {
        return persisted;
      }

      return statusMap[employeeId]?.[`${month}-${day}`] ?? {
        status: '',
        notes: 'Kein Eintrag vorhanden.',
      };
    };
  }, [apiCalendarMap, getCalendarStatusEntry, month, statusMap, year]);

  const overlapSummary = useMemo(() => {
    let vacationDays = 0;
    let sickDays = 0;
    let overlappingVacationConflicts = 0;

    for (let day = 1; day <= dayCount; day += 1) {
      let dayVacationCount = 0;

      departmentEmployeeMap.forEach(({ employees: departmentEmployees }) => {
        departmentEmployees.forEach((employee) => {
          const entry = getMergedEntry(employee.id, day);
          if (entry?.status === 'UT') {
            vacationDays += 1;
            dayVacationCount += 1;
          }
          if (entry?.status === 'KT') {
            sickDays += 1;
          }
        });
      });

      if (dayVacationCount > 1) {
        overlappingVacationConflicts += 1;
      }
    }

    return {
      departmentCount: visibleDepartments.length,
      employeeCount: departmentEmployeeMap.reduce((total, item) => total + item.employees.length, 0),
      vacationDays,
      sickDays,
      overlappingVacationConflicts,
    };
  }, [dayCount, departmentEmployeeMap, getMergedEntry, visibleDepartments.length]);

  const selectedFleetDriver = useMemo(() => {
    if (!selectedCell) return null;
    return drivers.find((driver) => driver.id === selectedCell.employee.id) ?? null;
  }, [drivers, selectedCell]);

  const selectedAssignment = useMemo(() => {
    if (!selectedCell?.entry.assignmentId) return null;
    return getAssignmentById(selectedCell.entry.assignmentId) ?? null;
  }, [getAssignmentById, selectedCell]);

  const closeContextMenu = () => {
    setContextMenuPosition(null);
    setSelectedEmptyCell(null);
  };

  const openContextMenu = (
    event: React.MouseEvent<HTMLButtonElement>,
    payload: SelectedEmptyCell,
  ) => {
    event.preventDefault();
    setSelectedCell(null);
    setPendingAbsenceSelection(null);
    setSelectedAbsenceTypeId(null);
    setSelectedEmptyCell(payload);
    setContextMenuPosition({ x: event.clientX + 8, y: event.clientY + 8 });
  };

  const applyManualStatus = async (target: SelectedEmptyCell, status: Exclude<CalendarStatus, ''>) => {
    const sourceDate = formatMonthDate(target.year, target.month, target.day);
    const entry: StatusEntry = {
      status,
      notes: 'Manuell eingetragen.',
      source: 'manual',
      sourceDate,
    };

    setApiCalendarMap((current) => ({
      ...current,
      [target.employee.id]: {
        ...(current[target.employee.id] ?? {}),
        [`${target.month}-${target.day}`]: entry,
      },
    }));

    try {
      await calendarApi.create({
        driver_id: target.employee.id,
        date: sourceDate,
        status: toCalendarApiStatus(status),
      });
    } catch {
      setStatusMap((current) => ({
        ...current,
        [target.employee.id]: {
          ...(current[target.employee.id] ?? {}),
          [`${target.month}-${target.day}`]: entry,
        },
      }));
    }
  };

  const handleContextMenuAction = (action: CalendarCellContextMenuAction) => {
    if (!selectedEmptyCell) return;

    if (action === 'urlaub') {
      void applyManualStatus(selectedEmptyCell, 'UT');
      closeContextMenu();
      return;
    }

    if (action === 'krank') {
      void applyManualStatus(selectedEmptyCell, 'KT');
      closeContextMenu();
      return;
    }

    if (absenceTypes.length > 0) {
      setPendingAbsenceSelection(selectedEmptyCell);
      setSelectedAbsenceTypeId(null);
    } else {
      void applyManualStatus(selectedEmptyCell, 'SA');
    }

    closeContextMenu();
  };

  return (
    <div className="space-y-5">
      {statusFocus && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-800">
          {t('abt.focusBanner', { status: statusFocus })}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative">
              <button
                type="button"
                onClick={() => setDropdownOpen((value) => !value)}
                className="inline-flex h-10 min-w-[250px] items-center justify-between rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 hover:bg-slate-50"
              >
                <span>{t('abt.departmentsSelected', { count: selectedDepartmentIds.length })}</span>
                <ChevronsUpDown className="h-4 w-4 text-slate-500" />
              </button>

              {dropdownOpen && (
                <div className="absolute left-0 top-12 z-30 w-[320px] rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
                  <div className="mb-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedDepartmentIds(departments.map((department) => department.id))}
                      className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {t('abt.selectAll')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedDepartmentIds([])}
                      className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {t('abt.clearSelection')}
                    </button>
                  </div>

                  <div className="max-h-72 space-y-1 overflow-y-auto">
                    {departments.map((department) => {
                      const checked = selectedDepartmentIds.includes(department.id);
                      return (
                        <label key={department.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-slate-50">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setSelectedDepartmentIds((current) =>
                                current.includes(department.id)
                                  ? current.filter((id) => id !== department.id)
                                  : [...current, department.id],
                              );
                            }}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <Building2 className="h-4 w-4 text-slate-500" />
                          <span className="text-sm text-slate-800">{department.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMonth((current) => (current === 0 ? 11 : current - 1))}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <select
                value={month}
                onChange={(event) => setMonth(Number(event.target.value))}
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
              >
                {monthLabels.map((label, index) => (
                  <option key={label} value={index}>
                    {t(`jk.months.${index}`)}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setMonth((current) => (current === 11 ? 0 : current + 1))}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <select
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
            >
              <option value={2025}>2025</option>
              <option value={2026}>2026</option>
              <option value={2027}>2027</option>
            </select>

            <select
              value={workTimeMode}
              onChange={(event) => setWorkTimeMode(event.target.value as WorkTimeMode)}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
            >
              <option value="inklusive Arbeitszeiten">{t('jk.workTimeInclusive')}</option>
              <option value="exklusive Arbeitszeiten">{t('jk.workTimeExclusive')}</option>
            </select>

            <select
              value={viewMode}
              onChange={(event) => setViewMode(event.target.value as ViewMode)}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
            >
              <option value="Überlappung">{t('abt.viewOverlap')}</option>
              <option value="Einzelansicht">{t('abt.viewSingle')}</option>
            </select>
          </div>
        </div>
      </div>

      {viewMode === 'Überlappung' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">{t('abt.selectedDepartments')}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{overlapSummary.departmentCount}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">{t('abt.employeesShown')}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{overlapSummary.employeeCount}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">{t('abt.vacationDaysMonth')}</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700">{overlapSummary.vacationDays}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">{t('abt.sickDaysMonth')}</p>
            <p className="mt-1 text-2xl font-bold text-red-700">{overlapSummary.sickDays}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">{t('abt.overlapConflicts')}</p>
            <p className="mt-1 text-2xl font-bold text-amber-700">{overlapSummary.overlappingVacationConflicts}</p>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 text-center text-sm font-semibold text-slate-900">
          {`${t(`jk.months.${month}`)}, ${year}`}
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[1700px]">
            <div className="grid grid-cols-[160px_220px_repeat(31,minmax(42px,1fr))] border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <div className="sticky left-0 z-20 border-r border-slate-200 bg-slate-50 px-3 py-3">{t('abt.colDepartment')}</div>
              <div className="sticky left-[160px] z-20 border-r border-slate-200 bg-slate-50 px-3 py-3">{t('abt.colName')}</div>
              {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                <div key={day} className="border-l border-slate-200 px-1 py-3 text-center">
                  {String(day).padStart(2, '0')}
                </div>
              ))}
            </div>

            {departmentEmployeeMap.map(({ department, employees: departmentEmployees }) => {
              const isCollapsed = collapsedDepartments[department.id] ?? false;

              return (
                <div key={department.id}>
                  <div className="grid grid-cols-[160px_220px_repeat(31,minmax(42px,1fr))] border-b border-slate-200 bg-blue-50/70">
                    <button
                      type="button"
                      onClick={() => setCollapsedDepartments((current) => ({ ...current, [department.id]: !isCollapsed }))}
                      className="sticky left-0 z-10 flex items-center gap-2 border-r border-slate-200 bg-blue-50/70 px-3 py-3 text-left text-sm font-semibold text-blue-900"
                    >
                      {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      {department.name}
                    </button>
                    <div className="sticky left-[160px] z-10 flex items-center border-r border-slate-200 bg-blue-50/70 px-3 py-3">
                      <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-blue-700 shadow-sm">
                        {departmentEmployees.length}
                      </span>
                    </div>
                    <div className="col-span-31" />
                  </div>

                  {!isCollapsed &&
                    departmentEmployees.map((employee) => (
                      <div
                        key={employee.id}
                        className="grid grid-cols-[160px_220px_repeat(31,minmax(42px,1fr))] border-b border-slate-200 bg-white"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedCell({
                              employee,
                              department,
                              day: 1,
                              month,
                              year,
                              entry: getMergedEntry(employee.id, 1),
                            })
                          }
                          className="sticky left-0 z-10 border-r border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-500 hover:bg-slate-50"
                        >
                          {department.kind === 'internal' ? t('abt.internal') : t('abt.external')}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedCell({
                              employee,
                              department,
                              day: 1,
                              month,
                              year,
                              entry: getMergedEntry(employee.id, 1),
                            })
                          }
                          className="sticky left-[160px] z-10 border-r border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-900 hover:bg-slate-50"
                        >
                          {employee.name}
                        </button>

                        {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => {
                          if (day > dayCount) {
                            return <div key={`${employee.id}-${day}`} className="border-l border-slate-200 bg-slate-50/70" />;
                          }

                          const entry = getMergedEntry(employee.id, day);
                          const currentDay = day === 21 && month === 4 && year === 2026;
                          const weekend = isWeekend(year, month, day);
                          const colorClass = entry.status ? statusColors[entry.status as Exclude<CalendarStatus, ''>] : 'bg-slate-200 text-slate-300';
                          const shouldDimForFocus = Boolean(
                            statusFocus && entry.status && entry.status !== statusFocus,
                          );

                          return (
                            <button
                              key={`${employee.id}-${day}`}
                              type="button"
                              onMouseEnter={() => {
                                if (!entry.status) return;
                                setHoveredStatusCell({ employeeId: employee.id, day, month, year, entry });
                              }}
                              onMouseLeave={() => {
                                setHoveredStatusCell((current) => {
                                  if (!current) return null;
                                  if (
                                    current.employeeId !== employee.id ||
                                    current.day !== day ||
                                    current.month !== month ||
                                    current.year !== year
                                  ) {
                                    return current;
                                  }
                                  return null;
                                });
                              }}
                              onContextMenu={(event) => {
                                if (entry.status) return;
                                openContextMenu(event, { employee, department, day, month, year });
                              }}
                              onClick={() => {
                                if (entry.status) {
                                  closeContextMenu();
                                  setSelectedCell({ employee, department, day, month, year, entry });
                                  setPendingAbsenceSelection(null);
                                  return;
                                }

                                setSelectedCell(null);
                                setPendingAbsenceSelection(null);
                                setSelectedAbsenceTypeId(null);
                              }}
                              onMouseDown={(event) => {
                                if (entry.status) return;
                                if (event.button !== 0) return;
                                openContextMenu(event, { employee, department, day, month, year });
                              }}
                              className={`border-l border-slate-200 px-1 py-1.5 hover:bg-blue-50 ${
                                weekend ? 'bg-slate-100/70' : 'bg-white'
                              } ${currentDay ? 'bg-amber-50' : ''} ${shouldDimForFocus ? 'opacity-40' : ''}`}
                            >
                              <div className="relative flex min-h-[40px] flex-col items-center justify-center rounded-sm text-[11px] font-semibold">
                                <span className={entry.status ? colorClass.split(' ')[1] : 'text-slate-300'}>{entry.status}</span>
                                <span className={`mt-1 h-1 w-6 rounded-full ${colorClass.split(' ')[0]}`} />
                                {entry.status &&
                                  hoveredStatusCell?.employeeId === employee.id &&
                                  hoveredStatusCell?.day === day &&
                                  hoveredStatusCell?.month === month &&
                                  hoveredStatusCell?.year === year && (
                                    <CalendarStatusTooltip
                                      date={new Date(year, month, day)}
                                      status={entry.status}
                                      source={entry.source}
                                      sourceDate={entry.sourceDate}
                                    />
                                  )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {selectedCell && (
        <>
          <div className="fixed inset-0 z-40 bg-slate-900/25" onClick={() => setSelectedCell(null)} />
          <aside className="fixed right-0 top-0 z-50 h-screen w-full max-w-sm border-l border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h3 className="text-sm font-semibold text-slate-900">{t('abt.detailsTitle')}</h3>
              <button
                type="button"
                onClick={() => setSelectedCell(null)}
                className="rounded-md border border-slate-300 p-2 text-slate-500 hover:bg-slate-50"
                aria-label={t('abt.closeDetails')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">{t('abt.employeeName')}</p>
                <p className="mt-1 font-medium text-slate-900">{selectedCell.employee.name}</p>
              </div>
              {selectedFleetDriver && (
                <>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">{t('abt.accidents')}</p>
                    <p className="mt-1 font-medium text-slate-900">{formatAccidentCountLabel(selectedFleetDriver.accidentCount)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">{t('abt.risk')}</p>
                    <span
                      className={`mt-1 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getDriverRiskBadgeClass(
                        selectedFleetDriver.riskScore,
                      )}`}
                    >
                      {getDriverRiskLabel(selectedFleetDriver.riskScore)}
                    </span>
                  </div>
                </>
              )}
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">{t('abt.department')}</p>
                <p className="mt-1 font-medium text-slate-900">{selectedCell.department.name}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">{t('abt.selectedDate')}</p>
                <p className="mt-1 font-medium text-slate-900">{`${String(selectedCell.day).padStart(2, '0')}.${String(selectedCell.month + 1).padStart(2, '0')}.${selectedCell.year}`}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">{t('jk.statusAbbr')}</p>
                <p className="mt-1 font-medium text-slate-900">{selectedCell.entry.status || '-'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">{t('jk.fullStatusName')}</p>
                <p className="mt-1 font-medium text-slate-900">
                  {selectedCell.entry.status ? statusNames[selectedCell.entry.status as Exclude<CalendarStatus, ''>] : t('jk.noEntry')}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">{t('jk.notes')}</p>
                <p className="mt-1 rounded-md border border-slate-200 bg-slate-50 p-3 text-slate-700">{selectedCell.entry.notes}</p>
              </div>

              {selectedAssignment && (
                <>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">{t('jk.assignmentSource')}</p>
                    <p className="mt-1 font-medium text-slate-900">{selectedAssignment.source}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">{t('jk.vehicle')}</p>
                    <p className="mt-1 font-medium text-slate-900">{selectedAssignment.vehicle || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">{t('jk.company')}</p>
                    <p className="mt-1 font-medium text-slate-900">{selectedAssignment.company || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">{t('jk.cargo')}</p>
                    <p className="mt-1 font-medium text-slate-900">{selectedAssignment.cargoName || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">{t('jk.pickup')}</p>
                    <p className="mt-1 font-medium text-slate-900">{selectedAssignment.pickupAddress || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">{t('jk.delivery')}</p>
                    <p className="mt-1 font-medium text-slate-900">{selectedAssignment.deliveryAddress || '-'}</p>
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  {t('abt.editStatus')}
                </button>
                <button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  {t('abt.addVacation')}
                </button>
                <button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  {t('abt.markSick')}
                </button>
                <button type="button" className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
                  {t('abt.clearStatus')}
                </button>
              </div>
            </div>
          </aside>
        </>
      )}

      {contextMenuPosition && selectedEmptyCell && (
        <CalendarCellContextMenu
          x={contextMenuPosition.x}
          y={contextMenuPosition.y}
          onClose={closeContextMenu}
          onSelect={handleContextMenuAction}
        />
      )}

      <AbsenceTypeModal
        open={Boolean(pendingAbsenceSelection)}
        absenceTypes={absenceTypes}
        selectedTypeId={selectedAbsenceTypeId}
        onSelect={setSelectedAbsenceTypeId}
        onClose={() => {
          setPendingAbsenceSelection(null);
          setSelectedAbsenceTypeId(null);
        }}
        onApply={() => {
          if (!pendingAbsenceSelection || !selectedAbsenceTypeId) return;
          const selectedAbsenceType = absenceTypes.find((item) => item.id === selectedAbsenceTypeId);
          if (!selectedAbsenceType) return;

          void applyManualStatus(pendingAbsenceSelection, selectedAbsenceType.abkuerzung);

          setPendingAbsenceSelection(null);
          setSelectedAbsenceTypeId(null);
        }}
      />
    </div>
  );
}
