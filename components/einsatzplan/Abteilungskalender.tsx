'use client';

import { useMemo, useState } from 'react';
import {
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  X,
} from 'lucide-react';
import { AbsenceTypeModal, type AbsenceType, type AbsenceTypeAbbreviation } from './AbsenceTypeModal';
import { CalendarCellContextMenu, type CalendarCellContextMenuAction } from './CalendarCellContextMenu';
import { CalendarStatusTooltip, type TooltipSource } from './CalendarStatusTooltip';
import { useFleetData } from '@/context/FleetDataContext';
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

const departments: Department[] = [
  { id: 'office', name: 'Office', kind: 'internal' },
  { id: 'krage', name: 'Krage', kind: 'external' },
  { id: 'raben-trans', name: 'Raben Trans', kind: 'external' },
  { id: 'weliver', name: 'Weliver', kind: 'external' },
  { id: 'go', name: 'Go', kind: 'external' },
  { id: 'kunzendorf', name: 'Kunzendorf', kind: 'external' },
  { id: 'penny', name: 'Penny', kind: 'external' },
  { id: 'securitas', name: 'Securitas', kind: 'external' },
  { id: 'werkstatt', name: 'Werkstatt', kind: 'internal' },
  { id: 'netto', name: 'Netto', kind: 'external' },
  { id: 'schnellecke', name: 'Schnellecke', kind: 'external' },
  { id: 'weidler', name: 'Weidler', kind: 'external' },
  { id: 'lidl', name: 'Lidl', kind: 'external' },
];

const employees: Employee[] = [
  { id: 'ozdemir-hakan', name: 'Ozdemir Hakan', departmentId: 'office' },
  { id: 'office-2', name: 'Anna Muller', departmentId: 'office' },
  { id: 'sita-diallo', name: 'Sita Diallo', departmentId: 'krage' },
  { id: 'andrii-dudiak', name: 'Andrii Dudiak', departmentId: 'krage' },
  { id: 'nesrin-feyzula', name: 'Nesrin Feyzula', departmentId: 'krage' },
  { id: 'krage-4', name: 'Gundrum Andreas', departmentId: 'krage' },
  { id: 'krage-5', name: 'Kosching Fritz', departmentId: 'krage' },
  { id: 'krage-6', name: 'Marinov Karamfil', departmentId: 'krage' },
  { id: 'ilker-cukur', name: 'Ilker Cukur', departmentId: 'go' },
  { id: 'thomas-scharein', name: 'Thomas Scharein', departmentId: 'go' },
  { id: 'werkstatt-1', name: 'Mehmet Yilmaz', departmentId: 'werkstatt' },
  { id: 'werkstatt-2', name: 'Piotr Kowalski', departmentId: 'werkstatt' },
  { id: 'raben-1', name: 'John Smith', departmentId: 'raben-trans' },
  { id: 'raben-2', name: 'Tomasz Nowak', departmentId: 'raben-trans' },
  { id: 'weliver-1', name: 'Marco Rossi', departmentId: 'weliver' },
  { id: 'penny-1', name: 'Sarah Becker', departmentId: 'penny' },
  { id: 'securitas-1', name: 'Lucas Martin', departmentId: 'securitas' },
  { id: 'netto-1', name: 'Elena Weber', departmentId: 'netto' },
  { id: 'schnellecke-1', name: 'Ahmed Ali', departmentId: 'schnellecke' },
  { id: 'weidler-1', name: 'Daniel Hoffmann', departmentId: 'weidler' },
  { id: 'lidl-1', name: 'Julia Schneider', departmentId: 'lidl' },
];

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

function createMonthlyStatusMap() {
  const map: Record<string, Record<string, StatusEntry>> = {};

  const setEntry = (
    employeeId: string,
    month: number,
    day: number,
    status: Exclude<CalendarStatus, ''>,
    notes: string,
    metadata?: Pick<StatusEntry, 'source' | 'sourceDate' | 'requestId' | 'assignmentId'>,
  ) => {
    map[employeeId] ??= {};
    map[employeeId][`${month}-${day}`] = { status, notes, ...metadata };
  };

  setEntry('ozdemir-hakan', 4, 1, 'FT', 'Labour Day holiday.');
  setEntry('ozdemir-hakan', 4, 5, 'AT', 'Office planning day.');
  setEntry('ozdemir-hakan', 4, 12, 'UT', 'Approved vacation day.');
  setEntry('ozdemir-hakan', 4, 13, 'UT', 'Approved vacation day.');
  setEntry('ozdemir-hakan', 4, 20, 'KT', 'Krankmeldung eingegangen.', {
    source: 'request',
    sourceDate: '2026-05-20',
    requestId: 'REQ-2026-0520',
  });
  setEntry('ozdemir-hakan', 4, 21, 'AT', 'Einsatzbestatigung vorhanden.', {
    source: 'assignment',
    sourceDate: '2026-05-21',
    assignmentId: 'ASSIGN-2026-0521',
  });
  setEntry('office-2', 4, 7, 'KT', 'Medical leave.');
  setEntry('office-2', 4, 8, 'KT', 'Medical leave.');

  setEntry('sita-diallo', 4, 10, 'UT', 'Private travel approved.');
  setEntry('andrii-dudiak', 4, 15, 'AT', 'Customer deployment.');
  setEntry('nesrin-feyzula', 4, 15, 'UT', 'Vacation overlap.');
  setEntry('krage-4', 4, 15, 'UT', 'Vacation overlap.');
  setEntry('krage-5', 4, 3, 'FT', 'Regional holiday.');
  setEntry('krage-6', 4, 21, 'KT', 'Sick leave.');

  setEntry('ilker-cukur', 4, 2, 'AT', 'Shift planned.');
  setEntry('ilker-cukur', 4, 18, 'UT', 'Leave planned.');
  setEntry('thomas-scharein', 4, 18, 'UT', 'Leave planned.');

  setEntry('werkstatt-1', 4, 9, 'AT', 'Workshop inspection.');
  setEntry('werkstatt-2', 4, 22, 'KT', 'Sick note received.');
  setEntry('raben-1', 4, 6, 'AT', 'Loading shift.');
  setEntry('raben-2', 4, 20, 'UT', 'Annual leave.');
  setEntry('weliver-1', 4, 11, 'AT', 'Route assignment.');
  setEntry('penny-1', 4, 17, 'UT', 'Requested leave entered.');
  setEntry('securitas-1', 4, 4, 'AT', 'Security shift.');
  setEntry('netto-1', 4, 24, 'KT', 'Short illness.');
  setEntry('schnellecke-1', 4, 14, 'AT', 'Dispatch support.');
  setEntry('weidler-1', 4, 28, 'UT', 'Approved leave.');
  setEntry('lidl-1', 4, 26, 'AT', 'Store supply route.');

  return map;
}

const monthlyStatusMap = createMonthlyStatusMap();

export function Abteilungskalender({ statusFocus }: { statusFocus?: 'UT' | 'KT' }) {
  const { drivers, getCalendarStatusEntry, getAssignmentById } = useFleetData();
  const [statusMap, setStatusMap] = useState<Record<string, Record<string, StatusEntry>>>(monthlyStatusMap);
  const [selectedDepartmentIds, setSelectedDepartmentIds] = useState<string[]>([
    'office',
    'krage',
    'raben-trans',
    'weliver',
    'go',
    'kunzendorf',
    'penny',
    'securitas',
    'werkstatt',
    'netto',
    'schnellecke',
  ]);
  const [month, setMonth] = useState(4);
  const [year, setYear] = useState(2026);
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

  const visibleDepartments = useMemo(() => {
    return departments.filter((department) => selectedDepartmentIds.includes(department.id));
  }, [selectedDepartmentIds]);

  const departmentEmployeeMap = useMemo(() => {
    return visibleDepartments.map((department) => ({
      department,
      employees: employees.filter((employee) => employee.departmentId === department.id),
    }));
  }, [visibleDepartments]);

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

      return statusMap[employeeId]?.[`${month}-${day}`] ?? {
        status: '',
        notes: 'Kein Eintrag vorhanden.',
      };
    };
  }, [getCalendarStatusEntry, month, statusMap, year]);

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

  const applyManualStatus = (target: SelectedEmptyCell, status: Exclude<CalendarStatus, ''>) => {
    const sourceDate = `${target.year}-${String(target.month + 1).padStart(2, '0')}-${String(target.day).padStart(2, '0')}`;

    setStatusMap((current) => ({
      ...current,
      [target.employee.id]: {
        ...(current[target.employee.id] ?? {}),
        [`${target.month}-${target.day}`]: {
          status,
          notes: 'Manuell eingetragen.',
          source: 'manual',
          sourceDate,
        },
      },
    }));
  };

  const handleContextMenuAction = (action: CalendarCellContextMenuAction) => {
    if (!selectedEmptyCell) return;

    if (action === 'urlaub') {
      applyManualStatus(selectedEmptyCell, 'UT');
      closeContextMenu();
      return;
    }

    if (action === 'krank') {
      applyManualStatus(selectedEmptyCell, 'KT');
      closeContextMenu();
      return;
    }

    if (absenceTypes.length > 0) {
      setPendingAbsenceSelection(selectedEmptyCell);
      setSelectedAbsenceTypeId(null);
    } else {
      applyManualStatus(selectedEmptyCell, 'SA');
    }

    closeContextMenu();
  };

  return (
    <div className="space-y-5">
      {statusFocus && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-800">
          Fokus aktiv: {statusFocus} Status wird hervorgehoben.
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
                <span>{`${selectedDepartmentIds.length} Abteilungen ausgewahlt`}</span>
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
                      Alle auswahlen
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedDepartmentIds([])}
                      className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Auswahl loschen
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
                    {label}
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
              <option value="inklusive Arbeitszeiten">inklusive Arbeitszeiten</option>
              <option value="exklusive Arbeitszeiten">exklusive Arbeitszeiten</option>
            </select>

            <select
              value={viewMode}
              onChange={(event) => setViewMode(event.target.value as ViewMode)}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
            >
              <option value="Überlappung">Überlappung</option>
              <option value="Einzelansicht">Einzelansicht</option>
            </select>
          </div>
        </div>
      </div>

      {viewMode === 'Überlappung' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Selected departments</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{overlapSummary.departmentCount}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Employees shown</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{overlapSummary.employeeCount}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Vacation days this month</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700">{overlapSummary.vacationDays}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Sick days this month</p>
            <p className="mt-1 text-2xl font-bold text-red-700">{overlapSummary.sickDays}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Overlapping vacation conflicts</p>
            <p className="mt-1 text-2xl font-bold text-amber-700">{overlapSummary.overlappingVacationConflicts}</p>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 text-center text-sm font-semibold text-slate-900">
          {`${monthLabels[month]}, ${year}`}
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[1700px]">
            <div className="grid grid-cols-[160px_220px_repeat(31,minmax(42px,1fr))] border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <div className="sticky left-0 z-20 border-r border-slate-200 bg-slate-50 px-3 py-3">Abteilung</div>
              <div className="sticky left-[160px] z-20 border-r border-slate-200 bg-slate-50 px-3 py-3">Name</div>
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
                          {department.kind === 'internal' ? 'Intern' : 'Extern'}
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
              <h3 className="text-sm font-semibold text-slate-900">Abteilungskalender Details</h3>
              <button
                type="button"
                onClick={() => setSelectedCell(null)}
                className="rounded-md border border-slate-300 p-2 text-slate-500 hover:bg-slate-50"
                aria-label="Close details"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Employee name</p>
                <p className="mt-1 font-medium text-slate-900">{selectedCell.employee.name}</p>
              </div>
              {selectedFleetDriver && (
                <>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Accidents</p>
                    <p className="mt-1 font-medium text-slate-900">{formatAccidentCountLabel(selectedFleetDriver.accidentCount)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Risk</p>
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
                <p className="text-xs uppercase tracking-wide text-slate-500">Department</p>
                <p className="mt-1 font-medium text-slate-900">{selectedCell.department.name}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Selected date</p>
                <p className="mt-1 font-medium text-slate-900">{`${String(selectedCell.day).padStart(2, '0')}.${String(selectedCell.month + 1).padStart(2, '0')}.${selectedCell.year}`}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Status abbreviation</p>
                <p className="mt-1 font-medium text-slate-900">{selectedCell.entry.status || '-'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Full status name</p>
                <p className="mt-1 font-medium text-slate-900">
                  {selectedCell.entry.status ? statusNames[selectedCell.entry.status as Exclude<CalendarStatus, ''>] : 'Kein Eintrag'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Notes</p>
                <p className="mt-1 rounded-md border border-slate-200 bg-slate-50 p-3 text-slate-700">{selectedCell.entry.notes}</p>
              </div>

              {selectedAssignment && (
                <>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Assignment source</p>
                    <p className="mt-1 font-medium text-slate-900">{selectedAssignment.source}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Vehicle</p>
                    <p className="mt-1 font-medium text-slate-900">{selectedAssignment.vehicle || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Company</p>
                    <p className="mt-1 font-medium text-slate-900">{selectedAssignment.company || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Cargo</p>
                    <p className="mt-1 font-medium text-slate-900">{selectedAssignment.cargoName || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Pickup</p>
                    <p className="mt-1 font-medium text-slate-900">{selectedAssignment.pickupAddress || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Delivery</p>
                    <p className="mt-1 font-medium text-slate-900">{selectedAssignment.deliveryAddress || '-'}</p>
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Edit Status
                </button>
                <button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Add Vacation
                </button>
                <button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Mark Sick
                </button>
                <button type="button" className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
                  Clear Status
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

          setStatusMap((current) => ({
            ...current,
            [pendingAbsenceSelection.employee.id]: {
              ...(current[pendingAbsenceSelection.employee.id] ?? {}),
              [`${pendingAbsenceSelection.month}-${pendingAbsenceSelection.day}`]: {
                status: selectedAbsenceType.abkuerzung,
                notes: `${selectedAbsenceType.bezeichnung} wurde lokal zugewiesen.`,
                source: 'manual',
                sourceDate: `${pendingAbsenceSelection.year}-${String(pendingAbsenceSelection.month + 1).padStart(2, '0')}-${String(pendingAbsenceSelection.day).padStart(2, '0')}`,
              },
            },
          }));

          setPendingAbsenceSelection(null);
          setSelectedAbsenceTypeId(null);
        }}
      />
    </div>
  );
}
