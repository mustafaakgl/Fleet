'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Mail, Save, Search, Truck, X } from 'lucide-react';
import { getTodayDate, useFleetData } from '@/context/FleetDataContext';
import { createPlanningPlaceholder } from '@/lib/planning-assignment';
import { vehicleAssignmentsHref } from '@/lib/office-deep-links';
import { companiesApi, vehiclesApi } from '@/lib/api';
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
import { buildAssignmentRouteName } from '@/lib/address-format';
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
};

type VehicleOption = {
  plate: string;
  status: 'active' | 'maintenance' | 'broken' | 'inactive' | string;
};

function isAssignableAvailability(value: string): boolean {
  return value === 'Available' || value === 'Not Assigned';
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
  const planningDate = planningDateProp ?? getTodayDate();
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

  const canQuickAssign = useCallback((row: (typeof planningRows)[number]) => {
    if (!isAssignableAvailability(row.effectiveAvailability)) return false;
    return !(row.assignment.company.trim() && row.assignment.vehicle.trim());
  }, []);

  const openQuickAssign = useCallback((assignmentId: string) => {
    const row = planningRows.find((item) => item.assignment.id === assignmentId);
    if (!row || !canQuickAssign(row)) return;
    setQuickAssignAssignmentId(assignmentId);
    setQuickAssign({
      driverId: row.assignment.driverId,
      company: row.assignment.company,
      vehicle: row.assignment.vehicle,
      startTime: row.assignment.startTime || '07:00',
      endTime: row.assignment.endTime || '15:00',
    });
  }, [canQuickAssign, planningRows]);

  const availableCount = planningRows.filter((row) => row.effectiveAvailability === 'Available').length;
  const vacationCount = planningRows.filter((row) => row.effectiveAvailability === 'Urlaub').length;
  const sickCount = planningRows.filter((row) => row.effectiveAvailability === 'Krank').length;
  const plannedTrucks = planningRows.filter((row) => row.assignment.vehicle).length;
  const openAssignments = planningRows.filter(
    (row) => row.effectiveAvailability === 'Available' && (!row.assignment.vehicle || !row.assignment.company),
  ).length;
  const expectedDailyRevenue = calculateDailyRevenue(planningDate);
  const unavailableCount = planningRows.filter((row) => row.effectiveAvailability !== 'Available').length;
  const lostRevenueEstimate = unavailableCount * 900;

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

    updateAssignment(quickAssignAssignmentId, {
      company,
      vehicle,
      startTime: quickAssign.startTime,
      endTime: quickAssign.endTime,
      expectedRevenue: COMPANY_REVENUE_MAP[company] ?? quickAssignRow.assignment.expectedRevenue,
      availability: 'Available',
      status: 'Planned',
    });

    setQuickAssignAssignmentId(null);
    setQuickAssign(null);
    setInfoMessage(t('planning.quickAssignSaved', { driver: quickAssignRow.driverName }));
    setTimeout(() => setInfoMessage(null), 2200);
  }, [quickAssignAssignmentId, quickAssign, quickAssignRow, t, updateAssignment]);

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
        <SummaryCard label={t('planning.kpiAvailable')} value={String(availableCount)} tone={BRAND_KPI} />
        <SummaryCard label={t('planning.kpiVacation')} value={String(vacationCount)} tone={BRAND_KPI} />
        <SummaryCard label={t('planning.kpiSick')} value={String(sickCount)} tone="text-red-700" />
        <SummaryCard label={t('planning.kpiPlannedTrucks')} value={String(plannedTrucks)} tone="text-slate-900" />
        <SummaryCard label={t('planning.kpiOpenAssignments')} value={String(openAssignments)} tone="text-amber-700" />
        <SummaryCard label={t('planning.kpiExpectedRevenue')} value={currency(expectedDailyRevenue)} tone={BRAND_KPI} />
        <SummaryCard label={t('planning.kpiLostRevenue')} value={currency(lostRevenueEstimate)} tone="text-red-700" />
      </div>

      <div className={cn(FLEET_LIST_CARD, 'bg-white')}>
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <p className="text-sm font-semibold text-slate-800 sm:pb-2">
              {t('planning.planningDate', { date: planningDate })}
            </p>
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
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setInfoMessage(t('planning.savedToast'));
                setTimeout(() => setInfoMessage(null), 2200);
              }}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Save className="h-4 w-4" />
              {t('planning.savePlan')}
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveSubTab('company-notifications');
              }}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Mail className="h-4 w-4" />
              {t('planning.companyEmails')}
              {companyEmailAttentionCount > 0 && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  {companyEmailAttentionCount}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className={cn(FLEET_RAW_TABLE, 'min-w-[1400px]')}>
            <thead className={FLEET_RAW_THEAD}>
              <tr>
                <th className={FLEET_RAW_TH}>{t('planning.colDriver')}</th>
                <th className={FLEET_RAW_TH}>{t('planning.colAvailability')}</th>
                <th className={FLEET_RAW_TH}>{t('planning.colVehicle')}</th>
                <th className={FLEET_RAW_TH}>{t('planning.colCompany')}</th>
                <th className={FLEET_RAW_TH}>{t('planning.colFrom')}</th>
                <th className={FLEET_RAW_TH}>{t('planning.colTo')}</th>
                <th className={FLEET_RAW_TH}>{t('planning.colStartTime')}</th>
                <th className={FLEET_RAW_TH}>{t('planning.colEndTime')}</th>
                <th className={FLEET_RAW_TH}>{t('planning.colStatus')}</th>
                <th className={FLEET_RAW_TH}>{t('planning.colExpectedRevenue')}</th>
                <th className={FLEET_RAW_TH}>{t('planning.colActions')}</th>
              </tr>
            </thead>
            <tbody className={FLEET_RAW_TBODY}>
              {filteredPlanningRows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-sm text-slate-500">
                    {t('planning.driverSearchEmpty')}
                  </td>
                </tr>
              ) : null}
              {filteredPlanningRows.map((row) => {
                const disabled = !isAssignableAvailability(row.effectiveAvailability);
                const isQuickRow = quickAssignAssignmentId === row.assignment.id;
                const rowCanQuickAssign = canQuickAssign(row);
                const rowClassName = cn(
                  FLEET_RAW_TR,
                  rowCanQuickAssign && 'cursor-pointer hover:bg-blue-50/50',
                  isQuickRow && 'bg-blue-50/40',
                );

                return [
                  <tr
                    key={row.assignment.id}
                    className={rowClassName}
                    onClick={() => {
                      if (rowCanQuickAssign) {
                        openQuickAssign(row.assignment.id);
                      }
                    }}
                  >
                    <td className={FLEET_RAW_TD_PRIMARY}>{row.driverName}</td>
                    <td className={FLEET_RAW_TD}>
                      <select
                        value={row.effectiveAvailability}
                        onChange={(event) => {
                          const nextAvailability = event.target.value as (typeof AVAILABILITY_OPTIONS)[number];
                          updateAssignment(row.assignment.id, {
                            availability: nextAvailability,
                            expectedRevenue: nextAvailability === 'Available' ? row.assignment.expectedRevenue || 900 : 0,
                          });
                        }}
                        className={cn('w-full rounded-md border border-slate-300 bg-white px-2 text-slate-900', FLEET_FILTER_INPUT)}
                      >
                        {AVAILABILITY_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {t(AVAILABILITY_KEY[option])}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={FLEET_RAW_TD}>
                      <input
                        value={row.assignment.vehicle}
                        disabled={disabled}
                        onChange={(event) => updateAssignment(row.assignment.id, { vehicle: event.target.value })}
                        className={cn('w-full rounded-md border border-slate-300 bg-white px-2 text-slate-900 disabled:bg-slate-100', FLEET_FILTER_INPUT)}
                      />
                    </td>
                    <td className={FLEET_RAW_TD}>
                      <input
                        value={row.assignment.company}
                        disabled={disabled}
                        onChange={(event) => {
                          const nextCompany = event.target.value;
                          updateAssignment(row.assignment.id, {
                            company: nextCompany,
                            expectedRevenue: disabled ? 0 : COMPANY_REVENUE_MAP[nextCompany] ?? row.assignment.expectedRevenue,
                          });
                        }}
                        className={cn('w-full rounded-md border border-slate-300 bg-white px-2 text-slate-900 disabled:bg-slate-100', FLEET_FILTER_INPUT)}
                      />
                    </td>
                    <td className={FLEET_RAW_TD}>
                      <StructuredAddressCell
                        value={row.assignment.pickupAddress ?? ''}
                        disabled={disabled}
                        onChange={(pickupAddress) =>
                          updateAssignment(row.assignment.id, {
                            pickupAddress,
                            routeName: buildAssignmentRouteName(
                              pickupAddress,
                              row.assignment.deliveryAddress ?? '',
                            ),
                          })
                        }
                      />
                    </td>
                    <td className={FLEET_RAW_TD}>
                      <StructuredAddressCell
                        value={row.assignment.deliveryAddress ?? ''}
                        disabled={disabled}
                        onChange={(deliveryAddress) =>
                          updateAssignment(row.assignment.id, {
                            deliveryAddress,
                            routeName: buildAssignmentRouteName(
                              row.assignment.pickupAddress ?? '',
                              deliveryAddress,
                            ),
                          })
                        }
                      />
                    </td>
                    <td className={FLEET_RAW_TD}>
                      <input
                        value={row.assignment.startTime}
                        disabled={disabled}
                        onChange={(event) => updateAssignment(row.assignment.id, { startTime: event.target.value })}
                        className={cn('w-full rounded-md border border-slate-300 bg-white px-2 text-slate-900 disabled:bg-slate-100', FLEET_FILTER_INPUT)}
                      />
                    </td>
                    <td className={FLEET_RAW_TD}>
                      <input
                        value={row.assignment.endTime}
                        disabled={disabled}
                        onChange={(event) => updateAssignment(row.assignment.id, { endTime: event.target.value })}
                        className={cn('w-full rounded-md border border-slate-300 bg-white px-2 text-slate-900 disabled:bg-slate-100', FLEET_FILTER_INPUT)}
                      />
                    </td>
                    <td className={FLEET_RAW_TD}>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          disabled
                            ? 'bg-slate-200 text-slate-700'
                            : row.assignment.status === 'In Progress'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-[#e8f0f8] text-[#1a4d7a]'
                        }`}
                      >
                        {disabled ? t('planning.unavailable') : row.assignment.status}
                      </span>
                    </td>
                    <td className={FLEET_RAW_TD}>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={disabled ? 0 : row.assignment.expectedRevenue}
                        disabled={disabled}
                        onChange={(event) => {
                          const nextRevenue = Math.max(0, Number.parseFloat(event.target.value) || 0);
                          updateAssignment(row.assignment.id, { expectedRevenue: nextRevenue });
                        }}
                        className={cn('w-full min-w-[100px] rounded-md border border-slate-300 bg-white px-2 text-slate-900 disabled:bg-slate-100', FLEET_FILTER_INPUT)}
                        aria-label={`${t('planning.colExpectedRevenue')} — ${row.driverName}`}
                      />
                    </td>
                    <td className={FLEET_RAW_TD}>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (rowCanQuickAssign) {
                            openQuickAssign(row.assignment.id);
                            return;
                          }
                          updateAssignment(row.assignment.id, {
                            availability: 'Not Assigned',
                          });
                        }}
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        {rowCanQuickAssign ? t('planning.quickAssignOpen') : t('planning.clear')}
                      </button>
                    </td>
                  </tr>,
                  isQuickRow && quickAssign ? (
                    <tr key={`${row.assignment.id}-quick`} className="border-b border-blue-100 bg-blue-50/50">
                      <td colSpan={11} className="px-4 py-3">
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
                              onChange={(event) =>
                                setQuickAssign((current) =>
                                  current
                                    ? {
                                        ...current,
                                        company: event.target.value,
                                      }
                                    : current,
                                )
                              }
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

                          <div className="flex items-end gap-2">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleQuickAssignSave();
                              }}
                              className={cn('h-9 rounded-md px-3 text-sm font-semibold', BRAND_BTN_OUTLINE)}
                            >
                              {t('planning.quickAssignSave')}
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
              })}
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

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}
