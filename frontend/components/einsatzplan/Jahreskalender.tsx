'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AbsenceTypeModal, type AbsenceType, type AbsenceTypeAbbreviation } from './AbsenceTypeModal';
import { CalendarCellContextMenu, type CalendarCellContextMenuAction } from './CalendarCellContextMenu';
import {
  CALENDAR_DAY_CELL_CONTENT_HOVER,
  CALENDAR_DAY_CELL_HOVER,
  CalendarDayHoverPlus,
} from './CalendarDayHoverPlus';
import { CalendarStatusTooltip, type TooltipSource } from './CalendarStatusTooltip';
import { DriverVacationEntitlementEditor } from '@/components/drivers/DriverVacationEntitlementEditor';
import { useFleetData } from '@/context/FleetDataContext';
import { calendarApi } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { fromCalendarApiStatus, toCalendarApiStatus } from '@/lib/calendar-status-map';
import {
  buildPendingVacationDateSet,
  buildYearOptions,
  clampYearOption,
  DEFAULT_VACATION_ENTITLEMENT,
} from '@/lib/calendar-vacation';
import { canEditDriverVacationEntitlement } from '@/lib/permissions';
import {
  FLEET_RAW_TABLE,
  FLEET_RAW_TBODY,
  FLEET_RAW_TD,
  FLEET_RAW_TD_PRIMARY,
  FLEET_RAW_TH,
  FLEET_RAW_THEAD,
  FLEET_RAW_TR,
} from '@/lib/fleet-table';
import { cn } from '@/lib/utils';

type CalendarStatus = 'FT' | 'UT' | 'KT' | 'AT' | 'PENDING_UT' | 'APPROVED_UT' | AbsenceTypeAbbreviation | '';

interface Driver {
  id: string;
  name: string;
  annualVacationEntitlement: number;
  carryOverFromPreviousPeriod: number;
}

interface CalendarEntry {
  status: CalendarStatus;
  notes: string;
  source?: TooltipSource;
  sourceDate?: string;
  requestId?: string;
  assignmentId?: string;
  eventId?: string;
}

interface HoveredStatusCell {
  year: number;
  monthIndex: number;
  day: number;
  entry: CalendarEntry;
}

interface DriverCalendarData {
  driverId: string;
  years: Record<number, Record<number, Record<number, CalendarEntry>>>;
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
  year: number;
  monthIndex: number;
  day: number;
  entry: CalendarEntry;
}

interface PendingAbsenceSelection {
  year: number;
  monthIndex: number;
  day: number;
}

interface SelectedContextCell {
  year: number;
  monthIndex: number;
  day: number;
  eventId?: string;
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
  AT: 'bg-[#1a4d7a]',
  PENDING_UT: 'bg-amber-500',
  APPROVED_UT: 'bg-emerald-700',
  SU: 'bg-violet-500',
  PU: 'bg-violet-500',
  SCH: 'bg-[#1a4d7a]',
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
  AT: 'text-[#1a4d7a]',
  PENDING_UT: 'text-amber-700',
  APPROVED_UT: 'text-emerald-800',
  SU: 'text-violet-700',
  PU: 'text-violet-700',
  SCH: 'text-[#1a4d7a]',
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
  metadata?: Pick<CalendarEntry, 'source' | 'sourceDate' | 'requestId' | 'assignmentId'>,
) {
  for (let day = startDay; day <= endDay; day += 1) {
    target[monthIndex] ??= {};
    target[monthIndex][day] = { status, notes, ...metadata };
  }
}

function buildDriverYear(seed: 'A' | 'B' | 'C', year: number) {
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

    if (year === 2025) {
      setStatusRange(months, 6, 25, 25, 'UT', 'Urlaubsantrag genehmigt.', {
        source: 'request',
        sourceDate: '2024-12-02',
        requestId: 'REQ-2024-1202',
      });
    }

    if (year === 2026) {
      setStatusRange(months, 4, 20, 20, 'KT', 'Krankmeldung eingegangen.', {
        source: 'request',
        sourceDate: '2026-05-20',
        requestId: 'REQ-2026-0520',
      });
      setStatusRange(months, 4, 21, 21, 'AT', 'Einsatzbestatigung vorhanden.', {
        source: 'assignment',
        sourceDate: '2026-05-21',
        assignmentId: 'ASSIGN-2026-0521',
      });
    }
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

function cloneDriverCalendars(): DriverCalendarData[] {
  return JSON.parse(JSON.stringify(driverCalendars)) as DriverCalendarData[];
}

type CalendarStatusLookup = (
  driverId: string,
  date: string,
) =>
  | {
      status: string;
      source?: TooltipSource;
      requestId?: string;
      assignmentId?: string;
    }
  | undefined;

function formatYearDate(year: number, monthIndex: number, day: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function resolveCalendarEntry(
  driverId: string,
  year: number,
  monthIndex: number,
  day: number,
  localCalendar: Record<number, Record<number, CalendarEntry>>,
  manualYearByDate: Record<string, CalendarEntry>,
  pendingVacationDates: Set<string>,
  getCalendarStatusEntry: CalendarStatusLookup,
): CalendarEntry {
  const dateKey = formatYearDate(year, monthIndex, day);
  const shared = getCalendarStatusEntry(driverId, dateKey);
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

  const manual = manualYearByDate[dateKey];
  if (manual) {
    return manual;
  }

  if (pendingVacationDates.has(dateKey)) {
    return {
      status: 'PENDING_UT',
      notes: 'Urlaubsantrag ausstehend.',
      source: 'request',
      sourceDate: dateKey,
    };
  }

  return localCalendar[monthIndex]?.[day] ?? { status: '', notes: 'Kein Eintrag vorhanden.' };
}

function calculateVacationOverview(
  driver: Driver,
  selectedYear: number,
  localYearCalendar: Record<number, Record<number, CalendarEntry>>,
  manualYearByDate: Record<string, CalendarEntry>,
  pendingVacationDates: Set<string>,
  getCalendarStatusEntry: CalendarStatusLookup,
): VacationOverview {
  let consumed = 0;
  let pending = 0;
  let approved = 0;

  for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
    const days = daysInMonth(selectedYear, monthIndex);
    for (let day = 1; day <= days; day += 1) {
      const entry = resolveCalendarEntry(
        driver.id,
        selectedYear,
        monthIndex,
        day,
        localYearCalendar,
        manualYearByDate,
        pendingVacationDates,
        getCalendarStatusEntry,
      );

      if (entry.status === 'PENDING_UT') {
        pending += 1;
      }

      if (entry.status === 'UT' || entry.status === 'APPROVED_UT') {
        consumed += 1;
        approved += 1;
      }
    }
  }

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

function getTooltipStatusCode(status: CalendarStatus): string {
  if (status === 'PENDING_UT' || status === 'APPROVED_UT') {
    return 'UT';
  }

  return status;
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
  const { t } = useTranslation();
  const {
    getCalendarStatusEntry,
    getAssignmentById,
    drivers: fleetDrivers,
    requests,
    refetchHydrate,
    isHydrating,
  } = useFleetData();
  const yearOptions = useMemo(() => buildYearOptions(), []);
  const [calendarState, setCalendarState] = useState<DriverCalendarData[]>(cloneDriverCalendars);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('ozdemir-hakan');
  const [selectedYear, setSelectedYear] = useState(() => clampYearOption(new Date().getFullYear()));
  const [selectedDay, setSelectedDay] = useState<SelectedDay | null>(null);
  const [pendingAbsenceSelection, setPendingAbsenceSelection] = useState<PendingAbsenceSelection | null>(null);
  const [selectedAbsenceTypeId, setSelectedAbsenceTypeId] = useState<string | null>(null);
  const [hoveredStatusCell, setHoveredStatusCell] = useState<HoveredStatusCell | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [contextMenuMode, setContextMenuMode] = useState<'empty' | 'manual'>('empty');
  const [selectedContextCell, setSelectedContextCell] = useState<SelectedContextCell | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [manualYearByDate, setManualYearByDate] = useState<Record<string, CalendarEntry>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [entitlementOverrides, setEntitlementOverrides] = useState<
    Record<string, { entitlementDays: number; carryOverDays: number }>
  >({});

  const canEditVacationEntitlement = canEditDriverVacationEntitlement(getUser()?.role ?? 'customer');

  const isLiveDriver = useMemo(
    () => fleetDrivers.some((driver) => driver.id === selectedDriverId),
    [fleetDrivers, selectedDriverId],
  );

  const loadManualYearEvents = useCallback(async () => {
    if (!isLiveDriver) {
      setManualYearByDate({});
      return;
    }

    try {
      const events = await calendarApi.list({
        driver_id: selectedDriverId,
        from: `${selectedYear}-01-01`,
        to: `${selectedYear}-12-31`,
      });
      const map: Record<string, CalendarEntry> = {};
      for (const event of events) {
        if (event.source !== 'manual') {
          continue;
        }
        const dateStr = (event.date ?? '').slice(0, 10);
        map[dateStr] = {
          status: fromCalendarApiStatus(event.status, event.uiStatus) as CalendarStatus,
          notes: 'Manuell eingetragen.',
          source: 'manual',
          sourceDate: dateStr,
          eventId: event.id,
        };
      }
      setManualYearByDate(map);
    } catch {
      setManualYearByDate({});
    }
  }, [isLiveDriver, selectedDriverId, selectedYear]);

  useEffect(() => {
    void loadManualYearEvents();
  }, [loadManualYearEvents]);

  const driverOptions = useMemo<Driver[]>(() => {
    if (fleetDrivers.length > 0) {
      return fleetDrivers.map((driver) => {
        const override = entitlementOverrides[driver.id];
        return {
          id: driver.id,
          name: driver.name,
          annualVacationEntitlement:
            override?.entitlementDays ?? driver.vacationEntitlementDays ?? DEFAULT_VACATION_ENTITLEMENT,
          carryOverFromPreviousPeriod:
            override?.carryOverDays ?? driver.vacationCarryOverDays ?? 0,
        };
      });
    }
    return drivers;
  }, [entitlementOverrides, fleetDrivers]);

  const pendingVacationDates = useMemo(
    () =>
      isLiveDriver
        ? buildPendingVacationDateSet(requests, selectedDriverId, selectedYear)
        : new Set<string>(),
    [isLiveDriver, requests, selectedDriverId, selectedYear],
  );

  useEffect(() => {
    if (driverOptions.length === 0) return;
    if (!driverOptions.some((driver) => driver.id === selectedDriverId)) {
      setSelectedDriverId(driverOptions[0].id);
    }
  }, [driverOptions, selectedDriverId]);

  useEffect(() => {
    if (!isRefreshing) return;
    if (!isHydrating) {
      setIsRefreshing(false);
    }
  }, [isRefreshing, isHydrating]);

  const selectedDriver = useMemo(() => {
    return driverOptions.find((driver) => driver.id === selectedDriverId) ?? driverOptions[0];
  }, [driverOptions, selectedDriverId]);

  const selectedCalendar = useMemo(() => {
    return calendarState.find((calendar) => calendar.driverId === selectedDriverId)?.years[selectedYear] ?? {};
  }, [calendarState, selectedDriverId, selectedYear]);

  const selectedAssignment = useMemo(() => {
    if (!selectedDay?.entry.assignmentId) return null;
    return getAssignmentById(selectedDay.entry.assignmentId) ?? null;
  }, [getAssignmentById, selectedDay]);

  const getMergedEntry = useMemo(() => {
    return (monthIndex: number, day: number): CalendarEntry =>
      resolveCalendarEntry(
        selectedDriverId,
        selectedYear,
        monthIndex,
        day,
        selectedCalendar,
        manualYearByDate,
        pendingVacationDates,
        getCalendarStatusEntry,
      );
  }, [
    getCalendarStatusEntry,
    manualYearByDate,
    pendingVacationDates,
    selectedCalendar,
    selectedDriverId,
    selectedYear,
  ]);

  const vacationOverview = useMemo(() => {
    return calculateVacationOverview(
      selectedDriver,
      selectedYear,
      selectedCalendar,
      manualYearByDate,
      pendingVacationDates,
      getCalendarStatusEntry,
    );
  }, [
    getCalendarStatusEntry,
    manualYearByDate,
    pendingVacationDates,
    selectedCalendar,
    selectedDriver,
    selectedYear,
  ]);

  const vacationOverviewRows = [
    { label: 'jk.rowCarryOver', current: formatDays(vacationOverview.currentPeriod.carryOver), next: formatDays(vacationOverview.nextPeriod.carryOver) },
    { label: 'jk.rowEntitlement', current: formatDays(vacationOverview.currentPeriod.entitlement), next: formatDays(vacationOverview.nextPeriod.entitlement) },
    { label: 'jk.rowConsumption', current: formatDays(vacationOverview.currentPeriod.consumed), next: formatDays(vacationOverview.nextPeriod.consumed) },
    { label: 'jk.rowCurrentClaim', current: formatDays(vacationOverview.currentPeriod.currentClaim), next: formatDays(vacationOverview.nextPeriod.currentClaim) },
    { label: 'jk.rowRequested', current: formatDays(vacationOverview.currentPeriod.pending), next: formatDays(vacationOverview.nextPeriod.pending) },
    { label: 'jk.rowApproved', current: formatDays(vacationOverview.currentPeriod.approved), next: formatDays(vacationOverview.nextPeriod.approved) },
    { label: 'jk.rowRemaining', current: formatDays(vacationOverview.currentPeriod.remaining), next: formatDays(vacationOverview.nextPeriod.remaining) },
  ];

  const closeContextMenu = () => {
    setContextMenuPosition(null);
    setSelectedContextCell(null);
    setContextMenuMode('empty');
  };

  const openContextMenu = (
    event: React.MouseEvent<HTMLButtonElement>,
    payload: SelectedContextCell,
    mode: 'empty' | 'manual' = 'empty',
  ) => {
    event.preventDefault();
    setSelectedDay(null);
    setPendingAbsenceSelection(null);
    setSelectedAbsenceTypeId(null);
    setSelectedContextCell(payload);
    setContextMenuMode(mode);
    setContextMenuPosition({ x: event.clientX + 8, y: event.clientY + 8 });
  };

  const deleteManualEntry = async (target: SelectedContextCell) => {
    const sourceDate = formatYearDate(target.year, target.monthIndex, target.day);
    setSaveError(null);

    if (isLiveDriver && target.eventId) {
      setManualYearByDate((current) => {
        const next = { ...current };
        delete next[sourceDate];
        return next;
      });

      try {
        await calendarApi.remove(target.eventId);
        refetchHydrate();
      } catch {
        setSaveError(t('jk.saveError'));
        void loadManualYearEvents();
      }
      return;
    }

    setCalendarState((current) =>
      current.map((calendar) => {
        if (calendar.driverId !== selectedDriverId) return calendar;
        const month = { ...(calendar.years[target.year]?.[target.monthIndex] ?? {}) };
        delete month[target.day];
        return {
          ...calendar,
          years: {
            ...calendar.years,
            [target.year]: {
              ...calendar.years[target.year],
              [target.monthIndex]: month,
            },
          },
        };
      }),
    );
  };

  const applyManualStatus = async (target: SelectedContextCell, status: Exclude<CalendarStatus, ''>) => {
    const sourceDate = formatYearDate(target.year, target.monthIndex, target.day);
    const entry: CalendarEntry = {
      status,
      notes: 'Manuell eingetragen.',
      source: 'manual',
      sourceDate,
    };
    setSaveError(null);

    if (isLiveDriver) {
      setManualYearByDate((current) => ({ ...current, [sourceDate]: entry }));

      try {
        const created = await calendarApi.create({
          driver_id: selectedDriverId,
          date: sourceDate,
          status: toCalendarApiStatus(status),
          ui_status: status,
        });
        setManualYearByDate((current) => ({
          ...current,
          [sourceDate]: { ...entry, eventId: created.id },
        }));
        refetchHydrate();
      } catch {
        setSaveError(t('jk.saveError'));
        setManualYearByDate((current) => {
          const next = { ...current };
          delete next[sourceDate];
          return next;
        });
      }
      return;
    }

    setCalendarState((current) =>
      current.map((calendar) => {
        if (calendar.driverId !== selectedDriverId) return calendar;
        return {
          ...calendar,
          years: {
            ...calendar.years,
            [target.year]: {
              ...calendar.years[target.year],
              [target.monthIndex]: {
                ...(calendar.years[target.year]?.[target.monthIndex] ?? {}),
                [target.day]: entry,
              },
            },
          },
        };
      }),
    );
  };

  const handleContextMenuAction = (action: CalendarCellContextMenuAction) => {
    if (!selectedContextCell) return;

    if (action === 'delete') {
      void deleteManualEntry(selectedContextCell);
      closeContextMenu();
      return;
    }

    if (action === 'change') {
      setPendingAbsenceSelection(selectedContextCell);
      setSelectedAbsenceTypeId(null);
      closeContextMenu();
      return;
    }

    if (action === 'urlaub') {
      void applyManualStatus(selectedContextCell, 'UT');
      closeContextMenu();
      return;
    }

    if (action === 'krank') {
      void applyManualStatus(selectedContextCell, 'KT');
      closeContextMenu();
      return;
    }

    if (absenceTypes.length > 0) {
      setPendingAbsenceSelection(selectedContextCell);
      setSelectedAbsenceTypeId(null);
    } else {
      void applyManualStatus(selectedContextCell, 'SA');
    }

    closeContextMenu();
  };

  const handleRefresh = () => {
    if (!isLiveDriver) {
      setCalendarState(cloneDriverCalendars());
    }
    setSelectedDay(null);
    setPendingAbsenceSelection(null);
    setSelectedAbsenceTypeId(null);
    setHoveredStatusCell(null);
    closeContextMenu();
    setIsRefreshing(true);
    refetchHydrate();
    void loadManualYearEvents();
  };

  return (
    <div className="space-y-5">
      {saveError && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {saveError}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#d4e3f2] bg-[#e8f0f8] text-sm font-bold text-[#1a4d7a]">
              {getInitials(selectedDriver.name)}
            </div>

            <div className="min-w-[260px]">
              <label htmlFor="driver-select" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t('jk.driver')}
              </label>
              <select
                id="driver-select"
                value={selectedDriverId}
                onChange={(event) => {
                  setSelectedDriverId(event.target.value);
                  setSelectedDay(null);
                  setPendingAbsenceSelection(null);
                }}
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-[#1a4d7a] focus:outline-none"
              >
                {driverOptions.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="mt-5 inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleRefresh}
              disabled={isRefreshing || isHydrating}
              aria-label={t('jk.refreshAria')}
              title={t('jk.refreshTitle')}
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing || isHydrating ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="text-sm font-semibold text-slate-900">{t('jk.vacationOverview')}</h2>
            {isLiveDriver && (
              <DriverVacationEntitlementEditor
                driverId={selectedDriverId}
                entitlementDays={selectedDriver.annualVacationEntitlement}
                carryOverDays={selectedDriver.carryOverFromPreviousPeriod}
                canEdit={canEditVacationEntitlement}
                compact
                onSaved={(values) => {
                  setEntitlementOverrides((current) => ({
                    ...current,
                    [selectedDriverId]: values,
                  }));
                  refetchHydrate();
                }}
              />
            )}
          </div>
        </div>

        <div className="overflow-x-auto p-4">
          <table className={cn(FLEET_RAW_TABLE, 'min-w-full border border-slate-200')}>
            <thead className={FLEET_RAW_THEAD}>
              <tr>
                <th className={cn(FLEET_RAW_TH, 'border-r border-slate-200')}>{t('jk.colPosition')}</th>
                <th className={cn(FLEET_RAW_TH, 'border-r border-slate-200')}>{t('jk.colCurrentPeriod')}</th>
                <th className={FLEET_RAW_TH}>{t('jk.colNextPeriod')}</th>
              </tr>
            </thead>
            <tbody className={FLEET_RAW_TBODY}>
              {vacationOverviewRows.map((row) => (
                <tr key={row.label} className={FLEET_RAW_TR}>
                  <td className={cn(FLEET_RAW_TD_PRIMARY, 'border-r border-slate-100')}>{t(row.label)}</td>
                  <td className={cn(FLEET_RAW_TD, 'border-r border-slate-100')}>{row.current}</td>
                  <td className={FLEET_RAW_TD}>{row.next}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <h3 className="text-sm font-semibold text-slate-900">{t('jk.title')}</h3>

          <div className="flex flex-col gap-3 sm:flex-row">
            <select
              value={selectedYear}
              onChange={(event) => {
                setSelectedYear(Number(event.target.value));
                setSelectedDay(null);
                setPendingAbsenceSelection(null);
              }}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-[#1a4d7a] focus:outline-none"
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto p-4">
          <div className="min-w-[1700px]">
            <div className="grid grid-cols-[140px_repeat(31,minmax(42px,1fr))] border border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <div className="border-r border-slate-200 px-3 py-3">{t('jk.month')}</div>
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
                  <div className="border-r border-slate-200 px-3 py-3 text-sm font-medium text-slate-800">{t(`jk.months.${monthIndex}`)}</div>

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
                        onMouseEnter={() => {
                          if (!entry.status) return;
                          setHoveredStatusCell({ year: selectedYear, monthIndex, day, entry });
                        }}
                        onMouseLeave={() => {
                          setHoveredStatusCell((current) => {
                            if (!current) return null;
                            if (current.year !== selectedYear || current.monthIndex !== monthIndex || current.day !== day) {
                              return current;
                            }
                            return null;
                          });
                        }}
                        onContextMenu={(event) => {
                          if (entry.source === 'manual' && entry.eventId && isLiveDriver) {
                            openContextMenu(
                              event,
                              {
                                year: selectedYear,
                                monthIndex,
                                day,
                                eventId: entry.eventId,
                              },
                              'manual',
                            );
                            return;
                          }
                          if (entry.status) return;
                          openContextMenu(event, { year: selectedYear, monthIndex, day });
                        }}
                        onClick={(event) => {
                          if (entry.source === 'manual' && entry.eventId && isLiveDriver) {
                            openContextMenu(
                              event,
                              {
                                year: selectedYear,
                                monthIndex,
                                day,
                                eventId: entry.eventId,
                              },
                              'manual',
                            );
                            return;
                          }

                          if (entry.status) {
                            closeContextMenu();
                            setSelectedDay({ year: selectedYear, monthIndex, day, entry });
                            setPendingAbsenceSelection(null);
                            return;
                          }

                          openContextMenu(event, { year: selectedYear, monthIndex, day });
                        }}
                        className={`${CALENDAR_DAY_CELL_HOVER} ${
                          weekend ? 'bg-slate-100/70' : 'bg-white'
                        } ${isSelected ? 'bg-amber-50' : ''}`}
                      >
                        <div className="relative flex min-h-[44px] flex-col items-center justify-center rounded-sm text-[11px] font-semibold">
                          <CalendarDayHoverPlus />
                          <span
                            className={`${
                              entry.status ? statusTextClasses[entry.status as Exclude<CalendarStatus, ''>] : 'text-slate-300'
                            } ${CALENDAR_DAY_CELL_CONTENT_HOVER} ${!entry.status ? 'group-hover:opacity-0' : ''}`}
                          >
                            {getStatusLabel(entry.status)}
                          </span>
                          <span
                            className={`mt-1 h-1 w-6 rounded-full ${
                              entry.status ? statusAccentClasses[entry.status as Exclude<CalendarStatus, ''>] : 'bg-slate-200'
                            } ${CALENDAR_DAY_CELL_CONTENT_HOVER} ${!entry.status ? 'group-hover:opacity-0' : ''}`}
                          />
                          {entry.status &&
                            hoveredStatusCell?.year === selectedYear &&
                            hoveredStatusCell?.monthIndex === monthIndex &&
                            hoveredStatusCell?.day === day && (
                              <CalendarStatusTooltip
                                date={new Date(selectedYear, monthIndex, day)}
                                status={getTooltipStatusCode(entry.status)}
                                source={entry.source}
                                sourceDate={entry.sourceDate}
                              />
                            )}
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
            <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-pink-400" />{t('jk.legendFT')}</div>
            <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-emerald-500" />{t('jk.legendUT')}</div>
            <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-red-500" />{t('jk.legendKT')}</div>
            <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-[#1a4d7a]" />{t('jk.legendAT')}</div>
            <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-amber-500" />{t('jk.legendPending')}</div>
            <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-emerald-700" />{t('jk.legendApproved')}</div>
            <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm border border-slate-200 bg-white" />{t('jk.legendEmpty')}</div>
          </div>
        </div>
      </div>

      {selectedDay && (
        <>
          <div className="fixed inset-0 z-40 bg-slate-900/25" onClick={() => setSelectedDay(null)} />
          <aside className="fixed right-0 top-0 z-50 h-screen w-full max-w-sm border-l border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h4 className="text-sm font-semibold text-slate-900">{t('jk.details')}</h4>
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                className="rounded-md border border-slate-300 p-2 text-slate-500 hover:bg-slate-50"
                aria-label={t('jk.closeDetails')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">{t('jk.driverName')}</p>
                <p className="mt-1 font-medium text-slate-900">{selectedDriver.name}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">{t('jk.date')}</p>
                <p className="mt-1 font-medium text-slate-900">{`${selectedDay.day}.${String(selectedDay.monthIndex + 1).padStart(2, '0')}.${selectedDay.year}`}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">{t('jk.monthLabel')}</p>
                <p className="mt-1 font-medium text-slate-900">{t(`jk.months.${selectedDay.monthIndex}`)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">{t('jk.dayNumber')}</p>
                <p className="mt-1 font-medium text-slate-900">{selectedDay.day}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">{t('jk.statusAbbr')}</p>
                <p className="mt-1 font-medium text-slate-900">{getStatusLabel(selectedDay.entry.status) || '-'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">{t('jk.fullStatusName')}</p>
                <p className="mt-1 font-medium text-slate-900">
                  {selectedDay.entry.status ? statusNames[selectedDay.entry.status as Exclude<CalendarStatus, ''>] : t('jk.noEntry')}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">{t('jk.notes')}</p>
                <p className="mt-1 rounded-md border border-slate-200 bg-slate-50 p-3 text-slate-700">{selectedDay.entry.notes}</p>
              </div>

              {selectedDay.entry.source === 'manual' && (selectedDay.entry.eventId || !isLiveDriver) && (
                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPendingAbsenceSelection({
                        year: selectedDay.year,
                        monthIndex: selectedDay.monthIndex,
                        day: selectedDay.day,
                      });
                      setSelectedAbsenceTypeId(null);
                      setSelectedDay(null);
                    }}
                    className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {t('jk.changeEntry')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void deleteManualEntry({
                        year: selectedDay.year,
                        monthIndex: selectedDay.monthIndex,
                        day: selectedDay.day,
                        eventId: selectedDay.entry.eventId,
                      });
                      setSelectedDay(null);
                    }}
                    className="rounded-md border border-rose-300 px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50"
                  >
                    {t('jk.deleteEntry')}
                  </button>
                </div>
              )}

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
            </div>
          </aside>
        </>
      )}

      {contextMenuPosition && selectedContextCell && (
        <CalendarCellContextMenu
          x={contextMenuPosition.x}
          y={contextMenuPosition.y}
          mode={contextMenuMode}
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
