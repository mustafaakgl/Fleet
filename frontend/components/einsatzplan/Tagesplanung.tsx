'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Check, ChevronLeft, ChevronRight, Copy, Loader2, Mail, Search, Truck, X } from 'lucide-react';
import { getTodayDate, useFleetData } from '@/context/FleetDataContext';
import { createPlanningPlaceholder } from '@/lib/planning-assignment';
import { vehicleAssignmentsHref } from '@/lib/office-deep-links';
import { assignmentsApi, companiesApi, vehiclesApi } from '@/lib/api';
import { MorningCheckins } from './MorningCheckins';
import { CompanyNotifications } from './CompanyNotifications';
import { VehicleHandovers } from './VehicleHandovers';
import { TagesuebersichtTab } from './TagesuebersichtTab';
import {
  FLEET_FILTER_INPUT,
  FLEET_LIST_CARD,
  FLEET_RAW_TABLE,
  FLEET_RAW_TBODY,
  FLEET_RAW_TD,
  FLEET_RAW_TD_MUTED,
  FLEET_RAW_TD_PRIMARY,
  FLEET_RAW_TH,
  FLEET_RAW_THEAD,
  FLEET_RAW_TR,
} from '@/lib/fleet-table';
import { BRAND_BTN_OUTLINE, BRAND_FOCUS, BRAND_KPI, BRAND_TAB_ACTIVE_PLAIN, BRAND_TAB_BADGE } from '@/lib/brand-colors';
import { StructuredAddressCell } from '@/components/shared/StructuredAddressCell';
import { buildAssignmentRouteName, parseFormattedAddress } from '@/lib/address-format';
import { cn } from '@/lib/utils';

const COMPANY_REVENUE_MAP: Record<string, number> = {
  DHL: 850,
  Amazon: 1200,
  'DB Schenker': 1050,
  UPS: 900,
  Hermes: 800,
};

const AVAILABILITY_OPTIONS = ['Available', 'Urlaub', 'Krank', 'Feiertag', 'Not Assigned'] as const;
const AVAILABILITY_KEY: Record<string, string> = {
  Available: 'planning.avail.Available',
  Urlaub: 'planning.avail.Urlaub',
  Krank: 'planning.avail.Krank',
  Feiertag: 'planning.avail.Feiertag',
  'Not Assigned': 'planning.avail.notAssigned',
};
type PlanSubTab = 'daily-overview' | 'planning' | 'morning-checkins' | 'vehicle-handovers' | 'company-notifications';

type QuickAssignState = {
  driverId: string;
  company: string;
  vehicle: string;
  startTime: string;
  endTime: string;
  pickupAddress: string;
  deliveryAddress: string;
  expectedRevenue: number;
};

type RowKind = 'open' | 'planned' | 'unavailable';

type KpiFilter = 'all' | 'available' | 'vacation' | 'sick' | 'planned' | 'open';

const KIND_BAR: Record<RowKind, string> = {
  open: 'border-l-4 border-l-amber-400',
  planned: 'border-l-4 border-l-brand-primary',
  unavailable: 'border-l-4 border-l-slate-300',
};

type VehicleOption = {
  plate: string;
  status: 'active' | 'maintenance' | 'broken' | 'inactive' | string;
};

function isAssignableAvailability(value: string): boolean {
  return value === 'Available' || value === 'Not Assigned';
}

function shiftDate(date: string, deltaDays: number): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  parsed.setDate(parsed.getDate() + deltaDays);
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shortAddress(formatted: string): string {
  const trimmed = formatted.trim();
  if (!trimmed) return '';
  const parts = parseFormattedAddress(trimmed);
  return parts.city || parts.street;
}

function currency(value: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
}

export function Tagesplanung({
  initialSubTab,
  planningDate: planningDateProp,
  officeMode = false,
  operationsOnly = false,
}: {
  initialSubTab?: PlanSubTab;
  planningDate?: string;
  officeMode?: boolean;
  operationsOnly?: boolean;
}) {
  const { t } = useTranslation('einsatzplan');
  const { t: tCommon } = useTranslation('common');
  const searchParams = useSearchParams();
  const {
    assignments,
    drivers,
    transportRequests,
    getDriverAvailability,
    calculateDailyRevenue,
    updateAssignment,
    approveTransportRequest,
    rejectTransportRequest,
    refetchHydrate,
  } = useFleetData();
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const defaultSubTab: PlanSubTab = operationsOnly
    ? (initialSubTab && initialSubTab !== 'daily-overview' ? initialSubTab : 'morning-checkins')
    : (initialSubTab ?? 'daily-overview');
  const [activeSubTab, setActiveSubTab] = useState<PlanSubTab>(defaultSubTab);
  const [companyEmailAttentionCount, setCompanyEmailAttentionCount] = useState(0);
  const [selectedTransportRequestId, setSelectedTransportRequestId] = useState<string | null>(null);
  const [driverSearch, setDriverSearch] = useState('');
  const [quickAssignAssignmentId, setQuickAssignAssignmentId] = useState<string | null>(null);
  const [quickAssign, setQuickAssign] = useState<QuickAssignState | null>(null);
  const [vehicleOptions, setVehicleOptions] = useState<VehicleOption[]>([]);
  const [companyOptions, setCompanyOptions] = useState<string[]>([]);
  const [internalDate, setInternalDate] = useState<string>(() => planningDateProp ?? getTodayDate());
  const [kpiFilter, setKpiFilter] = useState<KpiFilter>('all');
  const [copying, setCopying] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveIndicatorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const planningDate = planningDateProp ?? internalDate;
  const dateNavEnabled = !planningDateProp;

  const trackUpdate = useCallback(
    (assignmentId: string, patch: Parameters<typeof updateAssignment>[1]) => {
      updateAssignment(assignmentId, patch);
      setSaveState('saving');
      if (saveIndicatorTimer.current) clearTimeout(saveIndicatorTimer.current);
      saveIndicatorTimer.current = setTimeout(() => setSaveState('saved'), 1400);
    },
    [updateAssignment],
  );

  useEffect(() => {
    return () => {
      if (saveIndicatorTimer.current) clearTimeout(saveIndicatorTimer.current);
    };
  }, []);
  const transportStatusLabel = (status: string) =>
    ['approved', 'rejected', 'needs_review', 'pending'].includes(status)
      ? t(`planning.tstatus.${status}`)
      : status;

  useEffect(() => {
    let cancelled = false;

    async function loadSelectorData() {
      try {
        const [vehiclesRes, companiesRes] = await Promise.all([
          vehiclesApi.list({ limit: 250 }),
          companiesApi.list({ limit: 250 }),
        ]);
        if (cancelled) return;

        const vehiclesFromApi = vehiclesRes.data
          .map((vehicle) => ({ plate: vehicle.plate_number, status: vehicle.status }))
          .filter((vehicle) => vehicle.plate.trim().length > 0);
        setVehicleOptions(vehiclesFromApi);

        const companyNames = companiesRes.data
          .map((company) => company.name.trim())
          .filter((name) => name.length > 0)
          .sort((a, b) => a.localeCompare(b, 'de'));
        setCompanyOptions(companyNames);
      } catch {
        if (!cancelled) {
          setVehicleOptions([]);
          setCompanyOptions([]);
        }
      }
    }

    void loadSelectorData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const transportId = searchParams.get('transport');
    if (transportId) {
      setSelectedTransportRequestId(transportId);
      setActiveSubTab('planning');
    }
  }, [searchParams]);

  const selectedTransportRequest = useMemo(
    () => transportRequests.find((request) => request.id === selectedTransportRequestId) ?? null,
    [selectedTransportRequestId, transportRequests],
  );

  const planningRows = useMemo(() => {
    const assignmentsForDate = assignments.filter((assignment) => assignment.date === planningDate);
    const assignmentByDriverId = new Map(
      assignmentsForDate.map((assignment) => [assignment.driverId, assignment]),
    );

    return drivers.map((driver) => {
      const assignment =
        assignmentByDriverId.get(driver.id)
        ?? createPlanningPlaceholder(driver.id, planningDate, driver.department);
      const calendarAvailability = getDriverAvailability(driver.id, planningDate);

      return {
        assignment,
        driverName: driver.name,
        effectiveAvailability: calendarAvailability,
      };
    });
  }, [assignments, drivers, getDriverAvailability, planningDate]);

  const filteredPlanningRows = useMemo(() => {
    const needle = driverSearch.trim().toLowerCase();
    if (!needle) return planningRows;
    return planningRows.filter((row) => row.driverName.toLowerCase().includes(needle));
  }, [driverSearch, planningRows]);

  const assignedDriverIds = useMemo(() => {
    const set = new Set<string>();
    for (const row of planningRows) {
      if (row.assignment.company.trim() && row.assignment.vehicle.trim()) {
        set.add(row.assignment.driverId);
      }
    }
    return set;
  }, [planningRows]);

  const assignedVehiclePlates = useMemo(() => {
    const set = new Set<string>();
    for (const row of planningRows) {
      const plate = row.assignment.vehicle.trim();
      if (plate.length > 0 && row.assignment.company.trim()) {
        set.add(plate);
      }
    }
    return set;
  }, [planningRows]);

  const mergedCompanyOptions = useMemo(() => {
    const set = new Set(companyOptions);
    for (const row of planningRows) {
      const company = row.assignment.company.trim();
      if (company.length > 0) set.add(company);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'de'));
  }, [companyOptions, planningRows]);

  const mergedVehicleOptions = useMemo(() => {
    const options = new Map<string, VehicleOption>();
    for (const option of vehicleOptions) {
      options.set(option.plate, option);
    }
    for (const row of planningRows) {
      const plate = row.assignment.vehicle.trim();
      if (plate.length > 0 && !options.has(plate)) {
        options.set(plate, { plate, status: 'active' });
      }
    }
    return Array.from(options.values()).sort((a, b) => a.plate.localeCompare(b.plate, 'de'));
  }, [planningRows, vehicleOptions]);

  const rowKindOf = useCallback((row: (typeof planningRows)[number]): RowKind => {
    if (!isAssignableAvailability(row.effectiveAvailability)) return 'unavailable';
    return row.assignment.company.trim() && row.assignment.vehicle.trim() ? 'planned' : 'open';
  }, []);

  const visibleRows = useMemo(() => {
    if (kpiFilter === 'all') return filteredPlanningRows;
    return filteredPlanningRows.filter((row) => {
      switch (kpiFilter) {
        case 'available':
          return row.effectiveAvailability === 'Available';
        case 'vacation':
          return row.effectiveAvailability === 'Urlaub';
        case 'sick':
          return row.effectiveAvailability === 'Krank';
        case 'planned':
          return rowKindOf(row) === 'planned';
        case 'open':
          return rowKindOf(row) === 'open';
        default:
          return true;
      }
    });
  }, [filteredPlanningRows, kpiFilter, rowKindOf]);

  const rowGroups = useMemo(() => {
    const groups: { kind: RowKind; labelKey: string; rows: typeof visibleRows }[] = [
      { kind: 'open', labelKey: 'planning.groupOpen', rows: [] },
      { kind: 'planned', labelKey: 'planning.groupPlanned', rows: [] },
      { kind: 'unavailable', labelKey: 'planning.groupUnavailable', rows: [] },
    ];
    for (const row of visibleRows) {
      const group = groups.find((item) => item.kind === rowKindOf(row));
      group?.rows.push(row);
    }
    return groups.filter((group) => group.rows.length > 0);
  }, [rowKindOf, visibleRows]);

  const openQuickAssign = useCallback((assignmentId: string) => {
    const row = planningRows.find((item) => item.assignment.id === assignmentId);
    if (!row || !isAssignableAvailability(row.effectiveAvailability)) return;
    setQuickAssignAssignmentId(assignmentId);
    setQuickAssign({
      driverId: row.assignment.driverId,
      company: row.assignment.company,
      vehicle: row.assignment.vehicle,
      startTime: row.assignment.startTime || '07:00',
      endTime: row.assignment.endTime || '15:00',
      pickupAddress: row.assignment.pickupAddress ?? '',
      deliveryAddress: row.assignment.deliveryAddress ?? '',
      expectedRevenue: row.assignment.expectedRevenue || 0,
    });
  }, [planningRows]);

  const changePlanningDate = useCallback((nextDate: string) => {
    setInternalDate(nextDate);
    setQuickAssignAssignmentId(null);
    setQuickAssign(null);
  }, []);

  const handleCopyYesterday = useCallback(async () => {
    if (copying) return;
    setCopying(true);
    try {
      const result = await assignmentsApi.copyDay(shiftDate(planningDate, -1), planningDate);
      refetchHydrate();
      setInfoMessage(
        result.total === 0
          ? tCommon('dashboard.v2.planning.copyNothing')
          : tCommon('dashboard.v2.planning.copyDone', { created: result.created, skipped: result.skipped }),
      );
    } catch {
      setInfoMessage(t('planning.copyError'));
    } finally {
      setCopying(false);
      setTimeout(() => setInfoMessage(null), 3200);
    }
  }, [copying, planningDate, refetchHydrate, t, tCommon]);

  const availableCount = planningRows.filter((row) => row.effectiveAvailability === 'Available').length;
  const vacationCount = planningRows.filter((row) => row.effectiveAvailability === 'Urlaub').length;
  const sickCount = planningRows.filter((row) => row.effectiveAvailability === 'Krank').length;
  const plannedTrucks = planningRows.filter((row) => row.assignment.vehicle).length;
  const openAssignments = planningRows.filter((row) => rowKindOf(row) === 'open').length;
  const expectedDailyRevenue = calculateDailyRevenue(planningDate);
  const absentCount = planningRows.filter((row) =>
    ['Urlaub', 'Krank', 'Feiertag'].includes(row.effectiveAvailability),
  ).length;
  const lostRevenueEstimate = absentCount * 900;

  const assignableTotal = planningRows.filter((row) => isAssignableAvailability(row.effectiveAvailability)).length;
  const plannedDrivers = planningRows.filter((row) => rowKindOf(row) === 'planned').length;
  const progressPercent = assignableTotal > 0 ? Math.round((plannedDrivers / assignableTotal) * 100) : 0;

  const toggleKpiFilter = useCallback((filter: KpiFilter) => {
    setKpiFilter((current) => (current === filter ? 'all' : filter));
  }, []);

  const quickAssignRow = quickAssignAssignmentId
    ? planningRows.find((row) => row.assignment.id === quickAssignAssignmentId) ?? null
    : null;

  const handleQuickAssignSave = useCallback(() => {
    if (!quickAssignAssignmentId || !quickAssign || !quickAssignRow) return;

    const company = quickAssign.company.trim();
    const vehicle = quickAssign.vehicle.trim();
    if (!company || !vehicle) {
      setInfoMessage(t('planning.quickAssignValidation'));
      setTimeout(() => setInfoMessage(null), 2200);
      return;
    }

    trackUpdate(quickAssignAssignmentId, {
      company,
      vehicle,
      startTime: quickAssign.startTime,
      endTime: quickAssign.endTime,
      pickupAddress: quickAssign.pickupAddress,
      deliveryAddress: quickAssign.deliveryAddress,
      routeName: buildAssignmentRouteName(quickAssign.pickupAddress, quickAssign.deliveryAddress),
      expectedRevenue:
        quickAssign.expectedRevenue > 0
          ? quickAssign.expectedRevenue
          : COMPANY_REVENUE_MAP[company] ?? quickAssignRow.assignment.expectedRevenue,
      availability: 'Available',
      status: 'Planned',
    });

    setQuickAssignAssignmentId(null);
    setQuickAssign(null);
    setInfoMessage(t('planning.quickAssignSaved', { driver: quickAssignRow.driverName }));
    setTimeout(() => setInfoMessage(null), 2200);
  }, [quickAssignAssignmentId, quickAssign, quickAssignRow, t, trackUpdate]);

  const driverReasonLabel = useCallback((driverId: string) => {
    const row = planningRows.find((item) => item.assignment.driverId === driverId);
    if (!row) return '';
    if (row.effectiveAvailability === 'Urlaub') return t('planning.selector.driverVacation');
    if (row.effectiveAvailability === 'Krank') return t('planning.selector.driverSick');
    if (row.effectiveAvailability === 'Feiertag') return t('planning.selector.driverHoliday');
    if (assignedDriverIds.has(driverId)) return t('planning.selector.driverAssigned');
    return '';
  }, [assignedDriverIds, planningRows, t]);

  const vehicleReasonLabel = useCallback((plate: string, status: string) => {
    if (status === 'maintenance' || status === 'broken') {
      return t('planning.selector.vehicleInShop');
    }
    if (status === 'inactive') {
      return t('planning.selector.vehicleInactive');
    }
    if (assignedVehiclePlates.has(plate)) {
      return t('planning.selector.vehicleAssigned');
    }
    return '';
  }, [assignedVehiclePlates, t]);

  return (
    <div className="space-y-4">
      {!operationsOnly ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {officeMode ? t('planning.titleOffice') : t('planning.title')}
            </h2>
            <p className="text-sm text-slate-600">{t('planning.subtitle')}</p>
          </div>
          <Link
            href={vehicleAssignmentsHref(planningDate)}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Truck className="h-4 w-4" />
            {tCommon('vehicleAssignments.title')}
          </Link>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        {!operationsOnly ? (
        <button
          type="button"
          onClick={() => setActiveSubTab('daily-overview')}
          className={`rounded-t-md border px-4 py-2 text-sm font-semibold ${
            activeSubTab === 'daily-overview'
              ? BRAND_TAB_ACTIVE_PLAIN
              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          {t('subtab.dailyOverview')}
        </button>
        ) : null}
        {!operationsOnly ? (
        <button
          type="button"
          onClick={() => setActiveSubTab('planning')}
          className={`rounded-t-md border px-4 py-2 text-sm font-semibold ${
            activeSubTab === 'planning'
              ? BRAND_TAB_ACTIVE_PLAIN
              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          {t('subtab.planning')}
        </button>
        ) : (
        <button
          type="button"
          onClick={() => setActiveSubTab('planning')}
          className={`rounded-t-md border px-4 py-2 text-sm font-semibold ${
            activeSubTab === 'planning'
              ? BRAND_TAB_ACTIVE_PLAIN
              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          {t('subtab.transportRequests')}
        </button>
        )}
        <button
          type="button"
          onClick={() => setActiveSubTab('morning-checkins')}
          className={`rounded-t-md border px-4 py-2 text-sm font-semibold ${
            activeSubTab === 'morning-checkins'
              ? BRAND_TAB_ACTIVE_PLAIN
              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          {t('subtab.morningCheckins')}
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('vehicle-handovers')}
          className={`rounded-t-md border px-4 py-2 text-sm font-semibold ${
            activeSubTab === 'vehicle-handovers'
              ? BRAND_TAB_ACTIVE_PLAIN
              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          {t('subtab.vehicleHandovers')}
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('company-notifications')}
          className={`rounded-t-md border px-4 py-2 text-sm font-semibold ${
            activeSubTab === 'company-notifications'
              ? BRAND_TAB_ACTIVE_PLAIN
              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          <span className="inline-flex items-center gap-2">
            {t('subtab.companyEmails')}
            {companyEmailAttentionCount > 0 && (
              <span
                className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-bold ${
                  activeSubTab === 'company-notifications' ? BRAND_TAB_BADGE : 'bg-amber-100 text-amber-700'
                }`}
              >
                {companyEmailAttentionCount}
              </span>
            )}
          </span>
        </button>
      </div>

      <section className={activeSubTab === 'morning-checkins' ? 'block' : 'hidden'}>
        <MorningCheckins />
      </section>

      <section className={activeSubTab === 'daily-overview' ? 'block' : 'hidden'}>
        <TagesuebersichtTab planningDate={planningDate} />
      </section>

      <section className={activeSubTab === 'planning' ? 'block' : 'hidden'}>
        <>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-7">
        <SummaryCard
          label={t('planning.kpiAvailable')}
          value={String(availableCount)}
          tone={BRAND_KPI}
          onClick={() => toggleKpiFilter('available')}
          active={kpiFilter === 'available'}
        />
        <SummaryCard
          label={t('planning.kpiVacation')}
          value={String(vacationCount)}
          tone={BRAND_KPI}
          onClick={() => toggleKpiFilter('vacation')}
          active={kpiFilter === 'vacation'}
        />
        <SummaryCard
          label={t('planning.kpiSick')}
          value={String(sickCount)}
          tone="text-red-700"
          onClick={() => toggleKpiFilter('sick')}
          active={kpiFilter === 'sick'}
        />
        <SummaryCard
          label={t('planning.kpiPlannedTrucks')}
          value={String(plannedTrucks)}
          tone="text-slate-900"
          onClick={() => toggleKpiFilter('planned')}
          active={kpiFilter === 'planned'}
        />
        <SummaryCard
          label={t('planning.kpiOpenAssignments')}
          value={String(openAssignments)}
          tone="text-amber-700"
          onClick={() => toggleKpiFilter('open')}
          active={kpiFilter === 'open'}
        />
        <SummaryCard label={t('planning.kpiExpectedRevenue')} value={currency(expectedDailyRevenue)} tone={BRAND_KPI} />
        <SummaryCard label={t('planning.kpiLostRevenue')} value={currency(lostRevenueEstimate)} tone="text-red-700" />
      </div>

      <div className={cn(FLEET_LIST_CARD, 'bg-white')}>
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            {dateNavEnabled ? (
              <div className="flex flex-wrap items-center gap-1.5 sm:pb-1">
                <button
                  type="button"
                  onClick={() => changePlanningDate(shiftDate(planningDate, -1))}
                  aria-label={t('planning.datePrev')}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <input
                  type="date"
                  value={planningDate}
                  onChange={(event) => {
                    if (event.target.value) changePlanningDate(event.target.value);
                  }}
                  className={cn('h-9 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 outline-none', BRAND_FOCUS)}
                />
                <button
                  type="button"
                  onClick={() => changePlanningDate(shiftDate(planningDate, 1))}
                  aria-label={t('planning.dateNext')}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => changePlanningDate(getTodayDate())}
                  disabled={planningDate === getTodayDate()}
                  className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t('planning.dateToday')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyYesterday()}
                  disabled={copying}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Copy className="h-4 w-4" />
                  {copying
                    ? tCommon('dashboard.v2.planning.copying')
                    : tCommon('dashboard.v2.planning.copyYesterday')}
                </button>
              </div>
            ) : (
              <p className="text-sm font-semibold text-slate-800 sm:pb-2">
                {t('planning.planningDate', { date: planningDate })}
              </p>
            )}
            <div className="min-w-[220px] flex-1 sm:max-w-md">
              <label
                htmlFor="planning-driver-search"
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
              >
                {t('planning.driverSearchLabel')}
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  id="planning-driver-search"
                  type="search"
                  list="planning-driver-suggestions"
                  value={driverSearch}
                  onChange={(event) => setDriverSearch(event.target.value)}
                  placeholder={t('planning.driverSearchPlaceholder')}
                  className={cn('h-9 w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-9 text-sm text-slate-900 outline-none', BRAND_FOCUS)}
                />
                {driverSearch.trim().length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setDriverSearch('')}
                    className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:bg-slate-100"
                    aria-label={t('planning.driverSearchClear')}
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
              <datalist id="planning-driver-suggestions">
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.name} />
                ))}
              </datalist>
              <p className="mt-1 text-xs text-slate-500">
                {driverSearch.trim().length > 0
                  ? t('planning.driverSearchCount', {
                      shown: filteredPlanningRows.length,
                      total: planningRows.length,
                    })
                  : t('planning.driverSearchHint', { total: planningRows.length })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {saveState !== 'idle' ? (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 text-xs font-medium',
                  saveState === 'saving' ? 'text-slate-500' : 'text-emerald-600',
                )}
              >
                {saveState === 'saving' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                {saveState === 'saving' ? t('planning.autoSaving') : t('planning.autoSaved')}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setActiveSubTab('company-notifications');
              }}
              className={cn('inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold', BRAND_BTN_OUTLINE)}
            >
              <Mail className="h-4 w-4" />
              {t('planning.finishPlan')}
              {companyEmailAttentionCount > 0 && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  {companyEmailAttentionCount}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50/60 px-4 py-2">
          <p className="text-xs font-semibold text-slate-600">
            {t('planning.progressLabel', { done: plannedDrivers, total: assignableTotal })}
          </p>
          <div className="h-1.5 w-full max-w-xs flex-1 overflow-hidden rounded-full bg-slate-200">
            <div
              className={cn('h-full rounded-full transition-all', progressPercent === 100 ? 'bg-emerald-500' : 'bg-brand-primary')}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          {kpiFilter !== 'all' ? (
            <button
              type="button"
              onClick={() => setKpiFilter('all')}
              className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              <X className="h-3 w-3" />
              {t('planning.kpiFilterReset')}
            </button>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          <table className={cn(FLEET_RAW_TABLE, 'min-w-[980px]')}>
            <thead className={FLEET_RAW_THEAD}>
              <tr>
                <th className={FLEET_RAW_TH}>{t('planning.colDriver')}</th>
                <th className={FLEET_RAW_TH}>{t('planning.colAvailability')}</th>
                <th className={FLEET_RAW_TH}>{t('planning.colAssignment')}</th>
                <th className={FLEET_RAW_TH}>{t('planning.colTime')}</th>
                <th className={FLEET_RAW_TH}>{t('planning.colStatus')}</th>
                <th className={FLEET_RAW_TH}>{t('planning.colExpectedRevenue')}</th>
                <th className={FLEET_RAW_TH}>{t('planning.colActions')}</th>
              </tr>
            </thead>
            <tbody className={FLEET_RAW_TBODY}>
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                    {t('planning.driverSearchEmpty')}
                  </td>
                </tr>
              ) : null}
              {rowGroups.map((group) => [
                <tr key={`group-${group.kind}`} className="bg-slate-100/70">
                  <td colSpan={7} className="px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                    {t(group.labelKey, { count: group.rows.length })}
                  </td>
                </tr>,
                ...group.rows.flatMap((row) => {
                  const kind = rowKindOf(row);
                  const editable = kind !== 'unavailable';
                  const isQuickRow = quickAssignAssignmentId === row.assignment.id;
                  const fromShort = shortAddress(row.assignment.pickupAddress ?? '');
                  const toShort = shortAddress(row.assignment.deliveryAddress ?? '');
                  const routeSummary = fromShort && toShort ? `${fromShort} → ${toShort}` : fromShort || toShort;
                  const rowClassName = cn(
                    FLEET_RAW_TR,
                    editable && 'cursor-pointer hover:bg-blue-50/50',
                    isQuickRow && 'bg-blue-50/40',
                  );

                  return [
                  <tr
                    key={row.assignment.id}
                    className={rowClassName}
                    onClick={() => {
                      if (editable) {
                        openQuickAssign(row.assignment.id);
                      }
                    }}
                  >
                    <td className={cn(FLEET_RAW_TD_PRIMARY, KIND_BAR[kind])}>{row.driverName}</td>
                    <td className={FLEET_RAW_TD}>
                      <select
                        value={row.effectiveAvailability}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => {
                          const nextAvailability = event.target.value as (typeof AVAILABILITY_OPTIONS)[number];
                          trackUpdate(row.assignment.id, {
                            availability: nextAvailability,
                            expectedRevenue: nextAvailability === 'Available' ? row.assignment.expectedRevenue || 900 : 0,
                          });
                        }}
                        className={cn('w-36 rounded-md border border-slate-300 bg-white px-2 text-slate-900', FLEET_FILTER_INPUT)}
                      >
                        {AVAILABILITY_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {t(AVAILABILITY_KEY[option])}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={FLEET_RAW_TD}>
                      {kind === 'planned' ? (
                        <div className="min-w-[200px]">
                          <p className="text-sm font-medium text-slate-900">
                            {row.assignment.vehicle} · {row.assignment.company}
                          </p>
                          {routeSummary ? <p className="text-xs text-slate-500">{routeSummary}</p> : null}
                        </div>
                      ) : kind === 'open' ? (
                        <span className="text-sm italic text-slate-400">{t('planning.noAssignment')}</span>
                      ) : (
                        <span className="text-sm text-slate-400">—</span>
                      )}
                    </td>
                    <td className={FLEET_RAW_TD_MUTED}>
                      {kind === 'unavailable' ? '—' : `${row.assignment.startTime}–${row.assignment.endTime}`}
                    </td>
                    <td className={FLEET_RAW_TD}>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          !editable
                            ? 'bg-slate-200 text-slate-700'
                            : kind === 'open'
                            ? 'bg-amber-50 text-amber-700'
                            : row.assignment.status === 'In Progress'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-surface text-brand-primary'
                        }`}
                      >
                        {!editable
                          ? t('planning.unavailable')
                          : kind === 'open'
                          ? t('planning.tstatus.pending')
                          : row.assignment.status}
                      </span>
                    </td>
                    <td className={FLEET_RAW_TD_MUTED}>
                      {kind === 'unavailable' ? '—' : currency(row.assignment.expectedRevenue || 0)}
                    </td>
                    <td className={FLEET_RAW_TD}>
                      <div className="flex gap-2">
                        {editable ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openQuickAssign(row.assignment.id);
                            }}
                            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            {kind === 'open' ? t('planning.quickAssignOpen') : t('planning.editAssignment')}
                          </button>
                        ) : null}
                        {kind !== 'open' ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              trackUpdate(row.assignment.id, {
                                availability: 'Not Assigned',
                                company: '',
                                vehicle: '',
                                expectedRevenue: 0,
                              });
                            }}
                            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            {t('planning.clear')}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>,
                  isQuickRow && quickAssign ? (
                    <tr key={`${row.assignment.id}-quick`} className="border-b border-blue-100 bg-blue-50/50">
                      <td colSpan={7} className="px-4 py-3">
                        <div className="grid gap-3 lg:grid-cols-6">
                          <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                              {t('planning.quickAssignDriver')}
                            </label>
                            <select
                              value={quickAssign.driverId}
                              onChange={(event) => {
                                const nextDriverId = event.target.value;
                                const target = planningRows.find((item) => item.assignment.driverId === nextDriverId);
                                if (!target) return;
                                setQuickAssignAssignmentId(target.assignment.id);
                                setQuickAssign((current) =>
                                  current
                                    ? {
                                        ...current,
                                        driverId: nextDriverId,
                                      }
                                    : current,
                                );
                              }}
                              className={cn('w-full rounded-md border border-slate-300 bg-white px-2 text-slate-900', FLEET_FILTER_INPUT)}
                            >
                              {planningRows.map((driverRow) => {
                                const reason = driverReasonLabel(driverRow.assignment.driverId);
                                const isCurrentDriver = driverRow.assignment.driverId === quickAssign.driverId;
                                const blocked = Boolean(reason) && !isCurrentDriver;
                                return (
                                  <option key={driverRow.assignment.driverId} value={driverRow.assignment.driverId} disabled={blocked}>
                                    {reason
                                      ? `${driverRow.driverName} - ${reason}`
                                      : driverRow.driverName}
                                  </option>
                                );
                              })}
                            </select>
                          </div>

                          <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                              {t('planning.quickAssignCompany')}
                            </label>
                            <select
                              value={quickAssign.company}
                              onChange={(event) => {
                                const nextCompany = event.target.value;
                                setQuickAssign((current) =>
                                  current
                                    ? {
                                        ...current,
                                        company: nextCompany,
                                        expectedRevenue: COMPANY_REVENUE_MAP[nextCompany] ?? current.expectedRevenue,
                                      }
                                    : current,
                                );
                              }}
                              className={cn('w-full rounded-md border border-slate-300 bg-white px-2 text-slate-900', FLEET_FILTER_INPUT)}
                            >
                              <option value="">{t('planning.quickAssignSelectCompany')}</option>
                              {mergedCompanyOptions.map((companyName) => (
                                <option key={companyName} value={companyName}>
                                  {companyName}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                              {t('planning.quickAssignVehicle')}
                            </label>
                            <select
                              value={quickAssign.vehicle}
                              onChange={(event) =>
                                setQuickAssign((current) =>
                                  current
                                    ? {
                                        ...current,
                                        vehicle: event.target.value,
                                      }
                                    : current,
                                )
                              }
                              className={cn('w-full rounded-md border border-slate-300 bg-white px-2 text-slate-900', FLEET_FILTER_INPUT)}
                            >
                              <option value="">{t('planning.quickAssignSelectVehicle')}</option>
                              {mergedVehicleOptions.map((vehicle) => {
                                const reason = vehicleReasonLabel(vehicle.plate, vehicle.status);
                                const isCurrentVehicle = vehicle.plate === quickAssign.vehicle;
                                const blocked = Boolean(reason) && !isCurrentVehicle;
                                return (
                                  <option key={vehicle.plate} value={vehicle.plate} disabled={blocked}>
                                    {reason ? `${vehicle.plate} - ${reason}` : vehicle.plate}
                                  </option>
                                );
                              })}
                            </select>
                          </div>

                          <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                              {t('planning.colStartTime')}
                            </label>
                            <input
                              type="time"
                              value={quickAssign.startTime}
                              onChange={(event) =>
                                setQuickAssign((current) =>
                                  current
                                    ? {
                                        ...current,
                                        startTime: event.target.value,
                                      }
                                    : current,
                                )
                              }
                              className={cn('w-full rounded-md border border-slate-300 bg-white px-2 text-slate-900', FLEET_FILTER_INPUT)}
                              placeholder="07:00"
                            />
                          </div>

                          <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                              {t('planning.colEndTime')}
                            </label>
                            <input
                              type="time"
                              value={quickAssign.endTime}
                              onChange={(event) =>
                                setQuickAssign((current) =>
                                  current
                                    ? {
                                        ...current,
                                        endTime: event.target.value,
                                      }
                                    : current,
                                )
                              }
                              className={cn('w-full rounded-md border border-slate-300 bg-white px-2 text-slate-900', FLEET_FILTER_INPUT)}
                              placeholder="15:00"
                            />
                          </div>

                          <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                              {t('planning.colExpectedRevenue')}
                            </label>
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              value={quickAssign.expectedRevenue}
                              onChange={(event) =>
                                setQuickAssign((current) =>
                                  current
                                    ? {
                                        ...current,
                                        expectedRevenue: Math.max(0, Number.parseFloat(event.target.value) || 0),
                                      }
                                    : current,
                                )
                              }
                              className={cn('w-full rounded-md border border-slate-300 bg-white px-2 text-slate-900', FLEET_FILTER_INPUT)}
                            />
                          </div>
                        </div>

                        <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
                          <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                              {t('planning.colFrom')}
                            </label>
                            <StructuredAddressCell
                              value={quickAssign.pickupAddress}
                              onChange={(pickupAddress) =>
                                setQuickAssign((current) => (current ? { ...current, pickupAddress } : current))
                              }
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                              {t('planning.colTo')}
                            </label>
                            <StructuredAddressCell
                              value={quickAssign.deliveryAddress}
                              onChange={(deliveryAddress) =>
                                setQuickAssign((current) => (current ? { ...current, deliveryAddress } : current))
                              }
                            />
                          </div>
                          <div className="flex items-end gap-2">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleQuickAssignSave();
                              }}
                              className={cn('h-9 rounded-md px-3 text-sm font-semibold', BRAND_BTN_OUTLINE)}
                            >
                              {t('planning.editorSave')}
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setQuickAssignAssignmentId(null);
                                setQuickAssign(null);
                              }}
                              className="h-9 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
                            >
                              {t('planning.quickAssignCancel')}
                            </button>
                          </div>
                        </div>
                        <p className="mt-2 text-xs text-slate-500">{t('planning.quickAssignHint')}</p>
                      </td>
                    </tr>
                  ) : null,
                  ];
                }),
              ])}
            </tbody>
          </table>
        </div>
      </div>

      <div className={cn(FLEET_LIST_CARD, 'bg-white')}>
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-base font-semibold text-slate-900">{t('planning.transportTitle')}</h3>
          <p className="text-sm text-slate-600">{t('planning.transportSubtitle')}</p>
        </div>
        <div className="overflow-x-auto">
          <table className={cn(FLEET_RAW_TABLE, 'min-w-[1600px]')}>
            <thead className={FLEET_RAW_THEAD}>
              <tr>
                <th className={FLEET_RAW_TH}>{t('planning.colDriver')}</th>
                <th className={FLEET_RAW_TH}>{t('planning.colDate')}</th>
                <th className={FLEET_RAW_TH}>{t('planning.colVehicle')}</th>
                <th className={FLEET_RAW_TH}>{t('planning.colCompany')}</th>
                <th className={FLEET_RAW_TH}>{t('planning.colCargo')}</th>
                <th className={FLEET_RAW_TH}>{t('planning.colPickup')}</th>
                <th className={FLEET_RAW_TH}>{t('planning.colDelivery')}</th>
                <th className={FLEET_RAW_TH}>{t('planning.colStart')}</th>
                <th className={FLEET_RAW_TH}>{t('planning.colEnd')}</th>
                <th className={FLEET_RAW_TH}>{t('planning.colStatus')}</th>
                <th className={FLEET_RAW_TH}>{t('planning.colConflict')}</th>
                <th className={FLEET_RAW_TH}>{t('planning.colActions')}</th>
              </tr>
            </thead>
            <tbody className={FLEET_RAW_TBODY}>
              {transportRequests.map((request) => {
                const driver = drivers.find((item) => item.id === request.driverId);
                const canDecide = request.status !== 'approved' && request.status !== 'rejected';

                return (
                  <tr key={request.id} className={FLEET_RAW_TR}>
                    <td className={FLEET_RAW_TD_PRIMARY}>{driver?.name ?? request.driverId}</td>
                    <td className={FLEET_RAW_TD_MUTED}>{request.date}</td>
                    <td className={FLEET_RAW_TD_MUTED}>{request.vehicleId}</td>
                    <td className={FLEET_RAW_TD_MUTED}>{request.companyId}</td>
                    <td className={FLEET_RAW_TD_MUTED}>{request.cargoName}</td>
                    <td className={FLEET_RAW_TD_MUTED}>{request.pickupAddress}</td>
                    <td className={FLEET_RAW_TD_MUTED}>{request.deliveryAddress}</td>
                    <td className={FLEET_RAW_TD_MUTED}>{request.startTime}</td>
                    <td className={FLEET_RAW_TD_MUTED}>{request.endTime ?? '-'}</td>
                    <td className={FLEET_RAW_TD}>
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                          request.status === 'approved'
                            ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                            : request.status === 'rejected'
                            ? 'border-rose-200 bg-rose-100 text-rose-700'
                            : request.status === 'needs_review'
                            ? 'border-amber-200 bg-amber-100 text-amber-700'
                            : 'border-slate-200 bg-slate-100 text-slate-700'
                        }`}
                      >
                        {transportStatusLabel(request.status)}
                      </span>
                    </td>
                    <td className={FLEET_RAW_TD_MUTED}>{request.conflictReason ?? '-'}</td>
                    <td className={FLEET_RAW_TD}>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedTransportRequestId(request.id)}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          {t('planning.view')}
                        </button>
                        <button
                          type="button"
                          disabled={!canDecide}
                          onClick={() => {
                            const result = approveTransportRequest(request.id);
                            if (result.success) {
                              setInfoMessage(t('planning.approveToast'));
                            } else {
                              setInfoMessage(result.message);
                            }
                            setTimeout(() => setInfoMessage(null), 2200);
                          }}
                          className={cn('rounded-md px-2 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50', BRAND_BTN_OUTLINE)}
                        >
                          {t('planning.approve')}
                        </button>
                        <button
                          type="button"
                          disabled={!canDecide}
                          onClick={() => {
                            rejectTransportRequest(request.id);
                            setInfoMessage(t('planning.rejectToast'));
                            setTimeout(() => setInfoMessage(null), 2200);
                          }}
                          className="rounded-md border border-rose-300 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {t('planning.reject')}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

        </>
      </section>

      <section className={activeSubTab === 'vehicle-handovers' ? 'block' : 'hidden'}>
        <VehicleHandovers />
      </section>

      <section className={activeSubTab === 'company-notifications' ? 'block' : 'hidden'}>
        <CompanyNotifications onAttentionCountChange={setCompanyEmailAttentionCount} />
      </section>

      {selectedTransportRequest && (
        <>
          <div className="fixed inset-0 z-30 bg-black/30" onClick={() => setSelectedTransportRequestId(null)} />
          <aside className="fixed right-0 top-0 z-40 h-full w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white shadow-xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-lg font-bold text-slate-900">{t('planning.transportDetailTitle')}</h3>
            </div>

            <div className="space-y-3 px-5 py-4 text-sm">
              <DetailRow label={t('planning.colDriver')} value={drivers.find((item) => item.id === selectedTransportRequest.driverId)?.name ?? selectedTransportRequest.driverId} />
              <DetailRow label={t('planning.colDate')} value={selectedTransportRequest.date} />
              <DetailRow label={t('planning.submittedAt')} value={selectedTransportRequest.submittedAt} />
              <DetailRow label={t('planning.colVehicle')} value={selectedTransportRequest.vehicleId} />
              <DetailRow label={t('planning.colCompany')} value={selectedTransportRequest.companyId} />
              <DetailRow label={t('planning.colCargo')} value={selectedTransportRequest.cargoName} />
              <DetailRow label={t('planning.cargoOwner')} value={selectedTransportRequest.cargoOwner} />
              <DetailRow label={t('planning.pickupAddress')} value={selectedTransportRequest.pickupAddress} />
              <DetailRow label={t('planning.deliveryAddress')} value={selectedTransportRequest.deliveryAddress} />
              <DetailRow label={t('planning.colStartTime')} value={selectedTransportRequest.startTime} />
              <DetailRow label={t('planning.colEndTime')} value={selectedTransportRequest.endTime ?? '-'} />
              <DetailRow label={t('planning.routeName')} value={selectedTransportRequest.routeName ?? '-'} />
              <DetailRow label={t('planning.colStatus')} value={transportStatusLabel(selectedTransportRequest.status)} />
              <DetailRow label={t('planning.colConflict')} value={selectedTransportRequest.conflictReason ?? '-'} />
              <DetailRow label={t('planning.source')} value={t('planning.sourceMobile')} />
              <DetailRow label={t('planning.notes')} value={selectedTransportRequest.notes ?? '-'} />
            </div>

            <div className="sticky bottom-0 border-t border-slate-200 bg-white px-5 py-4">
              <button
                type="button"
                onClick={() => setSelectedTransportRequestId(null)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                {t('planning.close')}
              </button>
            </div>
          </aside>
        </>
      )}

      {infoMessage && (
        <div className="fixed bottom-6 right-6 z-30 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {infoMessage}
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-slate-100 pb-2 sm:grid-cols-[180px_1fr]">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm text-slate-900">{value}</p>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  onClick,
  active = false,
}: {
  label: string;
  value: string;
  tone: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const content = (
    <>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tone}`}>{value}</p>
    </>
  );

  if (!onClick) {
    return <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-lg border bg-white p-3 text-left shadow-sm transition',
        active
          ? 'border-brand-primary ring-2 ring-brand-primary/25'
          : 'border-slate-200 hover:border-slate-300 hover:shadow',
      )}
    >
      {content}
    </button>
  );
}
