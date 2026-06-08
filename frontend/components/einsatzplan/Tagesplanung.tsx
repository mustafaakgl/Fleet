'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Mail, Save, Search, Truck, X } from 'lucide-react';
import { getTodayDate, useFleetData } from '@/context/FleetDataContext';
import { createPlanningPlaceholder } from '@/lib/planning-assignment';
import { vehicleAssignmentsHref } from '@/lib/office-deep-links';
import { MorningCheckins } from './MorningCheckins';
import { CompanyNotifications } from './CompanyNotifications';
import { VehicleHandovers } from './VehicleHandovers';
import { TagesuebersichtTab } from './TagesuebersichtTab';

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
  const planningDate = planningDateProp ?? getTodayDate();
  const transportStatusLabel = (status: string) =>
    ['approved', 'rejected', 'needs_review', 'pending'].includes(status)
      ? t(`planning.tstatus.${status}`)
      : status;

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
              ? 'border-blue-700 bg-blue-700 text-white'
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
              ? 'border-blue-700 bg-blue-700 text-white'
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
              ? 'border-blue-700 bg-blue-700 text-white'
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
              ? 'border-blue-700 bg-blue-700 text-white'
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
              ? 'border-blue-700 bg-blue-700 text-white'
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
              ? 'border-blue-700 bg-blue-700 text-white'
              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          <span className="inline-flex items-center gap-2">
            {t('subtab.companyEmails')}
            {companyEmailAttentionCount > 0 && (
              <span
                className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-bold ${
                  activeSubTab === 'company-notifications' ? 'bg-white text-blue-700' : 'bg-amber-100 text-amber-700'
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
        <SummaryCard label={t('planning.kpiAvailable')} value={String(availableCount)} tone="text-emerald-700" />
        <SummaryCard label={t('planning.kpiVacation')} value={String(vacationCount)} tone="text-blue-700" />
        <SummaryCard label={t('planning.kpiSick')} value={String(sickCount)} tone="text-red-700" />
        <SummaryCard label={t('planning.kpiPlannedTrucks')} value={String(plannedTrucks)} tone="text-slate-900" />
        <SummaryCard label={t('planning.kpiOpenAssignments')} value={String(openAssignments)} tone="text-amber-700" />
        <SummaryCard label={t('planning.kpiExpectedRevenue')} value={currency(expectedDailyRevenue)} tone="text-emerald-700" />
        <SummaryCard label={t('planning.kpiLostRevenue')} value={currency(lostRevenueEstimate)} tone="text-red-700" />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
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
                  className="h-9 w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-9 text-sm text-slate-900 outline-none focus:border-blue-500"
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
          <table className="min-w-[1400px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="border-b border-slate-200 px-3 py-3">{t('planning.colDriver')}</th>
                <th className="border-b border-slate-200 px-3 py-3">{t('planning.colAvailability')}</th>
                <th className="border-b border-slate-200 px-3 py-3">{t('planning.colVehicle')}</th>
                <th className="border-b border-slate-200 px-3 py-3">{t('planning.colCompany')}</th>
                <th className="border-b border-slate-200 px-3 py-3">{t('planning.colFrom')}</th>
                <th className="border-b border-slate-200 px-3 py-3">{t('planning.colTo')}</th>
                <th className="border-b border-slate-200 px-3 py-3">{t('planning.colStartTime')}</th>
                <th className="border-b border-slate-200 px-3 py-3">{t('planning.colEndTime')}</th>
                <th className="border-b border-slate-200 px-3 py-3">{t('planning.colStatus')}</th>
                <th className="border-b border-slate-200 px-3 py-3">{t('planning.colExpectedRevenue')}</th>
                <th className="border-b border-slate-200 px-3 py-3">{t('planning.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredPlanningRows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-sm text-slate-500">
                    {t('planning.driverSearchEmpty')}
                  </td>
                </tr>
              ) : null}
              {filteredPlanningRows.map((row) => {
                const disabled = row.effectiveAvailability !== 'Available';
                return (
                  <tr key={row.assignment.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-medium text-slate-900">{row.driverName}</td>
                    <td className="px-3 py-2.5">
                      <select
                        value={row.effectiveAvailability}
                        onChange={(event) => {
                          const nextAvailability = event.target.value as (typeof AVAILABILITY_OPTIONS)[number];
                          updateAssignment(row.assignment.id, {
                            availability: nextAvailability,
                            expectedRevenue: nextAvailability === 'Available' ? row.assignment.expectedRevenue || 900 : 0,
                          });
                        }}
                        className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900"
                      >
                        {AVAILABILITY_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {t(AVAILABILITY_KEY[option])}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        value={row.assignment.vehicle}
                        disabled={disabled}
                        onChange={(event) => updateAssignment(row.assignment.id, { vehicle: event.target.value })}
                        className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 disabled:bg-slate-100"
                      />
                    </td>
                    <td className="px-3 py-2.5">
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
                        className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 disabled:bg-slate-100"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        value={row.assignment.pickupAddress ?? ''}
                        disabled={disabled}
                        placeholder={t('planning.pickupPh')}
                        onChange={(event) =>
                          updateAssignment(row.assignment.id, { pickupAddress: event.target.value })
                        }
                        className="h-9 w-full min-w-[140px] rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 disabled:bg-slate-100"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        value={row.assignment.deliveryAddress ?? ''}
                        disabled={disabled}
                        placeholder={t('planning.deliveryPh')}
                        onChange={(event) =>
                          updateAssignment(row.assignment.id, { deliveryAddress: event.target.value })
                        }
                        className="h-9 w-full min-w-[140px] rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 disabled:bg-slate-100"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        value={row.assignment.startTime}
                        disabled={disabled}
                        onChange={(event) => updateAssignment(row.assignment.id, { startTime: event.target.value })}
                        className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 disabled:bg-slate-100"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        value={row.assignment.endTime}
                        disabled={disabled}
                        onChange={(event) => updateAssignment(row.assignment.id, { endTime: event.target.value })}
                        className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 disabled:bg-slate-100"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          disabled
                            ? 'bg-slate-200 text-slate-700'
                            : row.assignment.status === 'In Progress'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {disabled ? t('planning.unavailable') : row.assignment.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
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
                        className="h-9 w-full min-w-[100px] rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 disabled:bg-slate-100"
                        aria-label={`${t('planning.colExpectedRevenue')} — ${row.driverName}`}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        onClick={() => {
                          updateAssignment(row.assignment.id, {
                            availability: 'Not Assigned',
                          });
                        }}
                      >
                        {t('planning.clear')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-base font-semibold text-slate-900">{t('planning.transportTitle')}</h3>
          <p className="text-sm text-slate-600">{t('planning.transportSubtitle')}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1600px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="border-b border-slate-200 px-3 py-3">{t('planning.colDriver')}</th>
                <th className="border-b border-slate-200 px-3 py-3">{t('planning.colDate')}</th>
                <th className="border-b border-slate-200 px-3 py-3">{t('planning.colVehicle')}</th>
                <th className="border-b border-slate-200 px-3 py-3">{t('planning.colCompany')}</th>
                <th className="border-b border-slate-200 px-3 py-3">{t('planning.colCargo')}</th>
                <th className="border-b border-slate-200 px-3 py-3">{t('planning.colPickup')}</th>
                <th className="border-b border-slate-200 px-3 py-3">{t('planning.colDelivery')}</th>
                <th className="border-b border-slate-200 px-3 py-3">{t('planning.colStart')}</th>
                <th className="border-b border-slate-200 px-3 py-3">{t('planning.colEnd')}</th>
                <th className="border-b border-slate-200 px-3 py-3">{t('planning.colStatus')}</th>
                <th className="border-b border-slate-200 px-3 py-3">{t('planning.colConflict')}</th>
                <th className="border-b border-slate-200 px-3 py-3">{t('planning.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {transportRequests.map((request) => {
                const driver = drivers.find((item) => item.id === request.driverId);
                const canDecide = request.status !== 'approved' && request.status !== 'rejected';

                return (
                  <tr key={request.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-medium text-slate-900">{driver?.name ?? request.driverId}</td>
                    <td className="px-3 py-2.5 text-slate-700">{request.date}</td>
                    <td className="px-3 py-2.5 text-slate-700">{request.vehicleId}</td>
                    <td className="px-3 py-2.5 text-slate-700">{request.companyId}</td>
                    <td className="px-3 py-2.5 text-slate-700">{request.cargoName}</td>
                    <td className="px-3 py-2.5 text-slate-700">{request.pickupAddress}</td>
                    <td className="px-3 py-2.5 text-slate-700">{request.deliveryAddress}</td>
                    <td className="px-3 py-2.5 text-slate-700">{request.startTime}</td>
                    <td className="px-3 py-2.5 text-slate-700">{request.endTime ?? '-'}</td>
                    <td className="px-3 py-2.5">
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
                    <td className="px-3 py-2.5 text-slate-700">{request.conflictReason ?? '-'}</td>
                    <td className="px-3 py-2.5">
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
                          className="rounded-md border border-blue-300 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
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
