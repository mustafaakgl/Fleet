'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Mail, Save } from 'lucide-react';
import { getTodayDate, useFleetData } from '@/context/FleetDataContext';
import { MorningCheckins } from './MorningCheckins';
import { CompanyNotifications } from './CompanyNotifications';
import { VehicleHandovers } from './VehicleHandovers';
import { formatAccidentCountLabel, getDriverRiskBadgeClass, getDriverRiskLabel } from '@/lib/utils';
import { getHandoverLabelByAssignment } from '@/lib/vehicle-handovers';

const COMPANY_REVENUE_MAP: Record<string, number> = {
  DHL: 850,
  Amazon: 1200,
  'DB Schenker': 1050,
  UPS: 900,
  Hermes: 800,
};

const AVAILABILITY_OPTIONS = ['Available', 'Urlaub', 'Krank', 'Feiertag', 'Not Assigned'] as const;
type PlanSubTab = 'planning' | 'morning-checkins' | 'vehicle-handovers' | 'company-notifications';

function currency(value: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
}

export function Tagesplanung() {
  const { assignments, drivers, getDriverAvailability, calculateDailyRevenue, updateAssignment } = useFleetData();
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<PlanSubTab>('planning');
  const [companyEmailAttentionCount, setCompanyEmailAttentionCount] = useState(0);
  const planningDate = getTodayDate();

  const planningRows = useMemo(() => {
    return assignments
      .filter((assignment) => assignment.date === planningDate)
      .map((assignment) => {
        const driver = drivers.find((item) => item.id === assignment.driverId);
        const calendarAvailability = getDriverAvailability(assignment.driverId, planningDate);
        return {
          assignment,
          driverName: driver?.name ?? assignment.driverId,
          effectiveAvailability: calendarAvailability,
          accidentCount: driver?.accidentCount ?? 0,
          riskScore: driver?.riskScore ?? 'green',
        };
      });
  }, [assignments, drivers, getDriverAvailability, planningDate]);

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
      <div>
        <h2 className="text-xl font-bold text-slate-900">Tagesplanung</h2>
        <p className="text-sm text-slate-600">Disposition based on live availability, check-ins, and manual planning.</p>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveSubTab('planning')}
          className={`rounded-t-md border px-4 py-2 text-sm font-semibold ${
            activeSubTab === 'planning'
              ? 'border-blue-700 bg-blue-700 text-white'
              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          Tagesplanung
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('morning-checkins')}
          className={`rounded-t-md border px-4 py-2 text-sm font-semibold ${
            activeSubTab === 'morning-checkins'
              ? 'border-blue-700 bg-blue-700 text-white'
              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          Morning Check-ins
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
          Vehicle Handovers
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
            Company Emails
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

      <section className={activeSubTab === 'planning' ? 'block' : 'hidden'}>
        <>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-7">
        <SummaryCard label="Available Drivers" value={String(availableCount)} tone="text-emerald-700" />
        <SummaryCard label="Drivers on Vacation" value={String(vacationCount)} tone="text-blue-700" />
        <SummaryCard label="Sick Drivers" value={String(sickCount)} tone="text-red-700" />
        <SummaryCard label="Planned Trucks" value={String(plannedTrucks)} tone="text-slate-900" />
        <SummaryCard label="Open Assignments" value={String(openAssignments)} tone="text-amber-700" />
        <SummaryCard label="Expected Daily Revenue" value={currency(expectedDailyRevenue)} tone="text-emerald-700" />
        <SummaryCard label="Lost Revenue Estimate" value={currency(lostRevenueEstimate)} tone="text-red-700" />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-slate-800">Planning Date: {planningDate}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setInfoMessage('Tagesplanung wurde lokal gespeichert.');
                setTimeout(() => setInfoMessage(null), 2200);
              }}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Save className="h-4 w-4" />
              Plan speichern
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveSubTab('company-notifications');
              }}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Mail className="h-4 w-4" />
              Company Emails
              {companyEmailAttentionCount > 0 && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  {companyEmailAttentionCount}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1940px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="border-b border-slate-200 px-3 py-3">Driver</th>
                <th className="border-b border-slate-200 px-3 py-3">Department</th>
                <th className="border-b border-slate-200 px-3 py-3">Availability</th>
                <th className="border-b border-slate-200 px-3 py-3">Vehicle</th>
                <th className="border-b border-slate-200 px-3 py-3">Company</th>
                <th className="border-b border-slate-200 px-3 py-3">Route / Job</th>
                <th className="border-b border-slate-200 px-3 py-3">Start Time</th>
                <th className="border-b border-slate-200 px-3 py-3">End Time</th>
                <th className="border-b border-slate-200 px-3 py-3">Status</th>
                <th className="border-b border-slate-200 px-3 py-3">Source</th>
                <th className="border-b border-slate-200 px-3 py-3">Accidents</th>
                <th className="border-b border-slate-200 px-3 py-3">Risk</th>
                <th className="border-b border-slate-200 px-3 py-3">Handover</th>
                <th className="border-b border-slate-200 px-3 py-3">Expected Revenue</th>
                <th className="border-b border-slate-200 px-3 py-3">Notes</th>
                <th className="border-b border-slate-200 px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {planningRows.map((row) => {
                const disabled = row.effectiveAvailability !== 'Available';
                return (
                  <tr key={row.assignment.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-medium text-slate-900">{row.driverName}</td>
                    <td className="px-3 py-2.5 text-slate-700">{row.assignment.department}</td>
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
                            {option}
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
                        value={row.assignment.routeJob}
                        disabled={disabled}
                        onChange={(event) => updateAssignment(row.assignment.id, { routeJob: event.target.value })}
                        className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 disabled:bg-slate-100"
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
                        {disabled ? 'Unavailable' : row.assignment.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                          row.assignment.source === 'mobile_checkin'
                            ? 'border-blue-200 bg-blue-100 text-blue-700'
                            : 'border-slate-200 bg-slate-100 text-slate-700'
                        }`}
                      >
                        {row.assignment.source === 'mobile_checkin' ? 'Mobile Check-in' : 'Manual'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">{formatAccidentCountLabel(row.accidentCount)}</td>
                    <td className="px-3 py-2.5">
                      <div className="inline-flex items-center gap-2">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getDriverRiskBadgeClass(
                            row.riskScore,
                          )}`}
                        >
                          {getDriverRiskLabel(row.riskScore)}
                        </span>
                        {row.riskScore === 'red' && (
                          <span
                            className="inline-flex items-center text-red-600"
                            title="High risk driver — review before assigning."
                          >
                            <AlertTriangle className="h-4 w-4" />
                          </span>
                        )}
                      </div>
                      {row.riskScore === 'red' && (
                        <p className="mt-1 text-xs text-red-600">High risk driver - review before assigning.</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">
                      {row.assignment.vehicle
                        ? getHandoverLabelByAssignment({
                            driverId: row.assignment.driverId,
                            vehicle: row.assignment.vehicle,
                            date: row.assignment.date,
                          })
                        : 'Not Required'}
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-slate-900">{currency(disabled ? 0 : row.assignment.expectedRevenue)}</td>
                    <td className="px-3 py-2.5">
                      <input
                        value={row.assignment.notes}
                        disabled={disabled}
                        onChange={(event) => updateAssignment(row.assignment.id, { notes: event.target.value })}
                        className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 disabled:bg-slate-100"
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
                        Clear
                      </button>
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

      {infoMessage && (
        <div className="fixed bottom-6 right-6 z-30 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {infoMessage}
        </div>
      )}
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
