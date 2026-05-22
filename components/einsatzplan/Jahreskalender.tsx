'use client';

import { useMemo, useState } from 'react';
import { Lock, RefreshCw, X } from 'lucide-react';
import { AbsenceTypeModal, type AbsenceType, type AbsenceTypeAbbreviation } from './AbsenceTypeModal';
import { useFleetData } from '@/context/FleetDataContext';

type CalendarStatus = 'FT' | 'UT' | 'KT' | 'AT' | 'PENDING_UT' | 'APPROVED_UT' | AbsenceTypeAbbreviation | '';
type YearOption = 2025 | 2026 | 2027;
type WorkTimeMode = 'inklusive Arbeitszeiten' | 'exklusive Arbeitszeiten';
type PlannerSubtab = 'jahreskalender' | 'abteilungskalender' | 'antragsverwaltung';

interface Driver {
  id: string;
  name: string;
  annualVacationEntitlement: number;
  carryOverFromPreviousPeriod: number;
}

interface CalendarEntry {
  status: CalendarStatus;
  notes: string;
}

interface DriverCalendarData {
  driverId: string;
  years: Record<YearOption, Record<number, Record<number, CalendarEntry>>>;
}

interface VacationPeriodOverview {
  carryOver: number;
  entitlement: number;
  consumed: number;
  currentClaim: number;
  pending: number;
  approved: number;
  remaining: number;
}

interface VacationOverview {
  currentPeriod: VacationPeriodOverview;
  nextPeriod: VacationPeriodOverview;
}

interface SelectedDay {
  year: YearOption;
  monthIndex: number;
  day: number;
  entry: CalendarEntry;
}

interface PendingAbsenceSelection {
  year: YearOption;
  monthIndex: number;
  day: number;
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
  PENDING_UT: 'Beantragter Urlaub',
  APPROVED_UT: 'Genehmigter Urlaub',
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

const statusAccentClasses: Record<Exclude<CalendarStatus, ''>, string> = {
  FT: 'bg-pink-400',
  UT: 'bg-emerald-500',
  KT: 'bg-red-500',
  AT: 'bg-blue-500',
  PENDING_UT: 'bg-amber-500',
  APPROVED_UT: 'bg-emerald-700',
  SU: 'bg-violet-500',
  PU: 'bg-violet-500',
  SCH: 'bg-blue-500',
  BH: 'bg-slate-500',
  KA: 'bg-violet-500',
  SA: 'bg-violet-500',
  HO: 'bg-teal-500',
  GR: 'bg-orange-500',
  Aus: 'bg-slate-700',
  'k. Auftrag': 'bg-amber-700',
  'unent.Fehlen': 'bg-red-600',
};

const statusTextClasses: Record<Exclude<CalendarStatus, ''>, string> = {
  FT: 'text-pink-700',
  UT: 'text-emerald-700',
  KT: 'text-red-700',
  AT: 'text-blue-700',
  PENDING_UT: 'text-amber-700',
  APPROVED_UT: 'text-emerald-800',
  SU: 'text-violet-700',
  PU: 'text-violet-700',
  SCH: 'text-blue-700',
  BH: 'text-slate-700',
  KA: 'text-violet-700',
  SA: 'text-violet-700',
  HO: 'text-teal-700',
  GR: 'text-orange-700',
  Aus: 'text-slate-800',
  'k. Auftrag': 'text-amber-800',
  'unent.Fehlen': 'text-red-700',
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

const drivers: Driver[] = [
  { id: 'ozdemir-hakan', name: 'Ozdemir Hakan', annualVacationEntitlement: 24, carryOverFromPreviousPeriod: -1 },
  { id: 'ilker-cukur', name: 'Ilker Cukur', annualVacationEntitlement: 28, carryOverFromPreviousPeriod: 3 },
  { id: 'thomas-scharein', name: 'Thomas Scharein', annualVacationEntitlement: 26, carryOverFromPreviousPeriod: 1 },
  { id: 'sita-diallo', name: 'Sita Diallo', annualVacationEntitlement: 24, carryOverFromPreviousPeriod: 0 },
  { id: 'andrii-dudiak', name: 'Andrii Dudiak', annualVacationEntitlement: 24, carryOverFromPreviousPeriod: 0 },
  { id: 'nesrin-feyzula', name: 'Nesrin Feyzula', annualVacationEntitlement: 24, carryOverFromPreviousPeriod: 2 },
];

function setStatusRange(
  target: Record<number, Record<number, CalendarEntry>>,
  monthIndex: number,
  startDay: number,
  endDay: number,
  status: Exclude<CalendarStatus, ''>,
  notes: string,
) {
  for (let day = startDay; day <= endDay; day += 1) {
    target[monthIndex] ??= {};
    target[monthIndex][day] = { status, notes };
  }
}

function buildDriverYear(seed: 'A' | 'B' | 'C', year: YearOption) {
  const months: Record<number, Record<number, CalendarEntry>> = {};

  if (seed === 'A') {
    setStatusRange(months, 0, 1, 1, 'FT', `New year public holiday ${year}`);
    setStatusRange(months, 0, 2, 3, 'AT', 'First workdays of the year.');
    setStatusRange(months, 1, 10, 12, 'APPROVED_UT', 'Winter vacation approved.');
    setStatusRange(months, 1, 13, 14, 'UT', 'Vacation already taken.');
    setStatusRange(months, 3, 7, 8, 'KT', 'Short sickness period.');
    setStatusRange(months, 4, 1, 1, 'FT', 'May holiday.');
    setStatusRange(months, 6, 15, 18, 'UT', 'Summer vacation block.');
    setStatusRange(months, 7, 21, 21, 'PENDING_UT', 'Requested bridge day.');
    setStatusRange(months, 9, 3, 3, 'FT', 'German Unity Day.');
    setStatusRange(months, 11, 24, 26, 'FT', 'Christmas days.');
  }

  if (seed === 'B') {
    setStatusRange(months, 0, 1, 1, 'FT', `New year public holiday ${year}`);
    setStatusRange(months, 2, 18, 18, 'KT', 'Medical leave.');
    setStatusRange(months, 4, 19, 20, 'PENDING_UT', 'Family vacation request.');
    setStatusRange(months, 4, 21, 23, 'APPROVED_UT', 'Approved family vacation.');
    setStatusRange(months, 7, 5, 6, 'KT', 'Recovery days.');
    setStatusRange(months, 9, 3, 3, 'FT', 'German Unity Day.');
    setStatusRange(months, 10, 11, 15, 'AT', 'Special project week.');
  }

  if (seed === 'C') {
    setStatusRange(months, 0, 1, 1, 'FT', `New year public holiday ${year}`);
    setStatusRange(months, 1, 1, 2, 'AT', 'Route handover.');
    setStatusRange(months, 5, 7, 9, 'APPROVED_UT', 'Approved annual leave.');
    setStatusRange(months, 5, 10, 11, 'PENDING_UT', 'Extension request pending.');
    setStatusRange(months, 8, 20, 20, 'KT', 'Sick day.');
    setStatusRange(months, 9, 3, 3, 'FT', 'German Unity Day.');
    setStatusRange(months, 11, 31, 31, 'FT', 'Year-end holiday.');
  }

  return months;
}

const driverCalendars: DriverCalendarData[] = [
  {
    driverId: 'ozdemir-hakan',
    years: {
      2025: buildDriverYear('A', 2025),
      2026: buildDriverYear('A', 2026),
      2027: buildDriverYear('A', 2027),
    },
  },
  {
    driverId: 'ilker-cukur',
    years: {
      2025: buildDriverYear('B', 2025),
      2026: buildDriverYear('B', 2026),
      2027: buildDriverYear('B', 2027),
    },
  },
  {
    driverId: 'thomas-scharein',
    years: {
      2025: buildDriverYear('C', 2025),
      2026: buildDriverYear('C', 2026),
      2027: buildDriverYear('C', 2027),
    },
  },
  {
    driverId: 'sita-diallo',
    years: {
      2025: buildDriverYear('C', 2025),
      2026: buildDriverYear('C', 2026),
      2027: buildDriverYear('C', 2027),
    },
  },
  {
    driverId: 'andrii-dudiak',
    years: {
      2025: buildDriverYear('B', 2025),
      2026: buildDriverYear('B', 2026),
      2027: buildDriverYear('B', 2027),
    },
  },
  {
    driverId: 'nesrin-feyzula',
    years: {
      2025: buildDriverYear('A', 2025),
      2026: buildDriverYear('A', 2026),
      2027: buildDriverYear('A', 2027),
    },
  },
];

function calculateVacationOverview(driver: Driver, selectedYear: YearOption): VacationOverview {
  const yearEntries = driverCalendars.find((calendar) => calendar.driverId === driver.id)?.years[selectedYear] ?? {};

  let consumed = 0;
  let pending = 0;
  let approved = 0;

  Object.values(yearEntries).forEach((month) => {
    Object.values(month).forEach((entry) => {
      if (entry.status === 'PENDING_UT') {
        pending += 1;
      }

      if (entry.status === 'UT' || entry.status === 'APPROVED_UT') {
        consumed += 1;
        approved += 1;
      }
    });
  });

  const currentClaim = driver.carryOverFromPreviousPeriod + driver.annualVacationEntitlement;
  const remaining = currentClaim - approved - pending;
  const nextCarryOver = remaining;
  const nextClaim = nextCarryOver + driver.annualVacationEntitlement;

  return {
    currentPeriod: {
      carryOver: driver.carryOverFromPreviousPeriod,
      entitlement: driver.annualVacationEntitlement,
      consumed,
      currentClaim,
      pending,
      approved,
      remaining,
    },
    nextPeriod: {
      carryOver: nextCarryOver,
      entitlement: driver.annualVacationEntitlement,
      consumed: 0,
      currentClaim: nextClaim,
      pending: 0,
      approved: 0,
      remaining: nextClaim,
    },
  };
}

function formatDays(value: number) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)} T`;
}

function getStatusLabel(status: CalendarStatus) {
  switch (status) {
    case 'PENDING_UT':
      return 'UT';
    case 'APPROVED_UT':
      return 'UT';
    default:
      return status;
  }
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function isWeekend(year: number, monthIndex: number, day: number) {
  const weekday = new Date(year, monthIndex, day).getDay();
  return weekday === 0 || weekday === 6;
}

export function Jahreskalender() {
  const { getCalendarStatusEntry } = useFleetData();
  const [calendarState, setCalendarState] = useState<DriverCalendarData[]>(driverCalendars);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('ozdemir-hakan');
  const [selectedYear, setSelectedYear] = useState<YearOption>(2026);
  const [workTimeMode, setWorkTimeMode] = useState<WorkTimeMode>('inklusive Arbeitszeiten');
  const [activeSubtab] = useState<PlannerSubtab>('jahreskalender');
  const [selectedDay, setSelectedDay] = useState<SelectedDay | null>(null);
  const [pendingAbsenceSelection, setPendingAbsenceSelection] = useState<PendingAbsenceSelection | null>(null);
  const [selectedAbsenceTypeId, setSelectedAbsenceTypeId] = useState<string | null>(null);

  const selectedDriver = useMemo(() => {
    return drivers.find((driver) => driver.id === selectedDriverId) ?? drivers[0];
  }, [selectedDriverId]);

  const selectedCalendar = useMemo(() => {
    return calendarState.find((calendar) => calendar.driverId === selectedDriverId)?.years[selectedYear] ?? {};
  }, [calendarState, selectedDriverId, selectedYear]);

  const getMergedEntry = useMemo(() => {
    return (monthIndex: number, day: number): CalendarEntry => {
      const dateKey = `${selectedYear}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const shared = getCalendarStatusEntry(selectedDriverId, dateKey);
      if (shared) {
        return {
          status: shared.status as CalendarStatus,
          notes: shared.source === 'request'
            ? `Automatisch aus Request ${shared.requestId ?? ''} aktualisiert.`
            : 'Automatisch aus gemeinsamer Planung aktualisiert.',
        };
      }

      return selectedCalendar[monthIndex]?.[day] ?? { status: '', notes: 'Kein Eintrag vorhanden.' };
    };
  }, [getCalendarStatusEntry, selectedCalendar, selectedDriverId, selectedYear]);

  const vacationOverview = useMemo(() => {
    return calculateVacationOverview(selectedDriver, selectedYear);
  }, [selectedDriver, selectedYear]);

  const vacationOverviewRows = [
    { label: 'Ubertrag Vorperiode', current: formatDays(vacationOverview.currentPeriod.carryOver), next: formatDays(vacationOverview.nextPeriod.carryOver) },
    { label: '+ Anspruch Periode', current: formatDays(vacationOverview.currentPeriod.entitlement), next: formatDays(vacationOverview.nextPeriod.entitlement) },
    { label: '- Verbrauch Periode', current: formatDays(vacationOverview.currentPeriod.consumed), next: formatDays(vacationOverview.nextPeriod.consumed) },
    { label: 'Anspruch aktuell', current: formatDays(vacationOverview.currentPeriod.currentClaim), next: formatDays(vacationOverview.nextPeriod.currentClaim) },
    { label: '- beantragt', current: formatDays(vacationOverview.currentPeriod.pending), next: formatDays(vacationOverview.nextPeriod.pending) },
    { label: '- genehmigt', current: formatDays(vacationOverview.currentPeriod.approved), next: formatDays(vacationOverview.nextPeriod.approved) },
    { label: 'Resturlaub', current: formatDays(vacationOverview.currentPeriod.remaining), next: formatDays(vacationOverview.nextPeriod.remaining) },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-sm font-bold text-blue-700">
              {getInitials(selectedDriver.name)}
            </div>

            <div className="min-w-[260px]">
              <label htmlFor="driver-select" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Fahrer
              </label>
              <select
                id="driver-select"
                value={selectedDriverId}
                onChange={(event) => {
                  setSelectedDriverId(event.target.value);
                  setSelectedDay(null);
                  setPendingAbsenceSelection(null);
                }}
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
              >
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="mt-5 inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              aria-label="Lock selection"
            >
              <Lock className="h-4 w-4" />
            </button>

            <button
              type="button"
              className="mt-5 inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              onClick={() => {
                setSelectedYear(2026);
                setWorkTimeMode('inklusive Arbeitszeiten');
                setSelectedDay(null);
                setPendingAbsenceSelection(null);
              }}
              aria-label="Refresh selection"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Urlaubsubersicht</h2>
        </div>

        <div className="overflow-x-auto p-4">
          <table className="min-w-full border border-slate-200 text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="border-b border-r border-slate-200 px-4 py-3">Position</th>
                <th className="border-b border-r border-slate-200 px-4 py-3">Current period: vom 01.01.2026 bis 31.12.2026</th>
                <th className="border-b border-slate-200 px-4 py-3">Next period: nachste Periode ab 01.01.2027</th>
              </tr>
            </thead>
            <tbody>
              {vacationOverviewRows.map((row) => (
                <tr key={row.label} className="border-t border-slate-100">
                  <td className="border-r border-slate-200 px-4 py-3 font-medium text-slate-800">{row.label}</td>
                  <td className="border-r border-slate-200 px-4 py-3 text-slate-700">{row.current}</td>
                  <td className="px-4 py-3 text-slate-700">{row.next}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`rounded-md border px-3 py-2 text-sm font-medium ${
            activeSubtab === 'jahreskalender'
              ? 'border-blue-700 bg-blue-700 text-white'
              : 'border-slate-300 bg-white text-slate-700'
          }`}
        >
          Jahreskalender
        </button>
        <button type="button" className="rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-500">
          Abteilungskalender
        </button>
        <button type="button" className="rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-500">
          Antragsverwaltung
        </button>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Jahreskalender</h3>

          <div className="flex flex-col gap-3 sm:flex-row">
            <select
              value={selectedYear}
              onChange={(event) => {
                setSelectedYear(Number(event.target.value) as YearOption);
                setSelectedDay(null);
                setPendingAbsenceSelection(null);
              }}
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
          </div>
        </div>

        <div className="overflow-x-auto p-4">
          <div className="min-w-[1700px]">
            <div className="grid grid-cols-[140px_repeat(31,minmax(42px,1fr))] border border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <div className="border-r border-slate-200 px-3 py-3">Monat</div>
              {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                <div key={day} className="border-l border-slate-200 px-1 py-3 text-center">
                  {day}
                </div>
              ))}
            </div>

            {monthLabels.map((monthLabel, monthIndex) => {
              const maxDays = daysInMonth(selectedYear, monthIndex);

              return (
                <div key={monthLabel} className="grid grid-cols-[140px_repeat(31,minmax(42px,1fr))] border-x border-b border-slate-200 bg-white">
                  <div className="border-r border-slate-200 px-3 py-3 text-sm font-medium text-slate-800">{monthLabel}</div>

                  {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => {
                    if (day > maxDays) {
                      return <div key={`${monthLabel}-${day}`} className="border-l border-slate-200 bg-slate-50/60" />;
                    }

                    const entry = getMergedEntry(monthIndex, day);
                    const weekend = isWeekend(selectedYear, monthIndex, day);
                    const isSelected =
                      selectedDay?.year === selectedYear &&
                      selectedDay?.monthIndex === monthIndex &&
                      selectedDay?.day === day;

                    return (
                      <button
                        key={`${monthLabel}-${day}`}
                        type="button"
                        onClick={() => {
                          if (entry.status) {
                            setSelectedDay({ year: selectedYear, monthIndex, day, entry });
                            setPendingAbsenceSelection(null);
                            return;
                          }

                          setSelectedDay(null);
                          setPendingAbsenceSelection({ year: selectedYear, monthIndex, day });
                          setSelectedAbsenceTypeId(null);
                        }}
                        className={`border-l border-slate-200 px-1 py-1.5 transition-colors hover:bg-blue-50 ${
                          weekend ? 'bg-slate-100/70' : 'bg-white'
                        } ${isSelected ? 'bg-amber-50' : ''}`}
                      >
                        <div className="flex min-h-[44px] flex-col items-center justify-center rounded-sm text-[11px] font-semibold">
                          <span className={entry.status ? statusTextClasses[entry.status as Exclude<CalendarStatus, ''>] : 'text-slate-300'}>
                            {getStatusLabel(entry.status)}
                          </span>
                          <span
                            className={`mt-1 h-1 w-6 rounded-full ${
                              entry.status ? statusAccentClasses[entry.status as Exclude<CalendarStatus, ''>] : 'bg-slate-200'
                            }`}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        <div className="border-t border-slate-200 px-4 py-3">
          <div className="flex flex-wrap gap-4 text-xs text-slate-600">
            <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-pink-400" />FT = Feiertag</div>
            <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-emerald-500" />UT = Urlaubstag</div>
            <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-red-500" />KT = Krankheitstag</div>
            <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-blue-500" />AT = Arbeitstag</div>
            <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-amber-500" />UT (pending) = beantragter Urlaub</div>
            <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-emerald-700" />UT (approved) = genehmigter Urlaub</div>
            <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm border border-slate-200 bg-white" />Empty = Kein Eintrag</div>
          </div>
        </div>
      </div>

      {selectedDay && (
        <>
          <div className="fixed inset-0 z-40 bg-slate-900/25" onClick={() => setSelectedDay(null)} />
          <aside className="fixed right-0 top-0 z-50 h-screen w-full max-w-sm border-l border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h4 className="text-sm font-semibold text-slate-900">Kalenderdetails</h4>
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                className="rounded-md border border-slate-300 p-2 text-slate-500 hover:bg-slate-50"
                aria-label="Close details"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Driver name</p>
                <p className="mt-1 font-medium text-slate-900">{selectedDriver.name}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Date</p>
                <p className="mt-1 font-medium text-slate-900">{`${selectedDay.day}.${String(selectedDay.monthIndex + 1).padStart(2, '0')}.${selectedDay.year}`}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Month</p>
                <p className="mt-1 font-medium text-slate-900">{monthLabels[selectedDay.monthIndex]}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Day number</p>
                <p className="mt-1 font-medium text-slate-900">{selectedDay.day}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Status abbreviation</p>
                <p className="mt-1 font-medium text-slate-900">{getStatusLabel(selectedDay.entry.status) || '-'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Full status name</p>
                <p className="mt-1 font-medium text-slate-900">
                  {selectedDay.entry.status ? statusNames[selectedDay.entry.status as Exclude<CalendarStatus, ''>] : 'Kein Eintrag'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Notes</p>
                <p className="mt-1 rounded-md border border-slate-200 bg-slate-50 p-3 text-slate-700">{selectedDay.entry.notes}</p>
              </div>
            </div>
          </aside>
        </>
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

          setCalendarState((current) =>
            current.map((calendar) => {
              if (calendar.driverId !== selectedDriverId) return calendar;
              return {
                ...calendar,
                years: {
                  ...calendar.years,
                  [pendingAbsenceSelection.year]: {
                    ...calendar.years[pendingAbsenceSelection.year],
                    [pendingAbsenceSelection.monthIndex]: {
                      ...(calendar.years[pendingAbsenceSelection.year]?.[pendingAbsenceSelection.monthIndex] ?? {}),
                      [pendingAbsenceSelection.day]: {
                        status: selectedAbsenceType.abkuerzung,
                        notes: `${selectedAbsenceType.bezeichnung} wurde lokal zugewiesen.`,
                      },
                    },
                  },
                },
              };
            }),
          );

          setPendingAbsenceSelection(null);
          setSelectedAbsenceTypeId(null);
        }}
      />
    </div>
  );
}
