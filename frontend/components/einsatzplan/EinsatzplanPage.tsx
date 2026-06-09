'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import {
  Gauge,
  Wallet,
  ClipboardCheck,
  Sun,
  Users,
  X,
  Plus,
} from 'lucide-react';
import { getUser } from '@/lib/auth';
import { dashboardApi } from '@/lib/api';
import type { DashboardKpis } from '@/lib/types';
import { getTomorrowDate, useFleetData } from '@/context/FleetDataContext';
import { EinsatzplanOfficeView } from './EinsatzplanOfficeView';
import { Benutzerverwaltung } from './Benutzerverwaltung';
import { CompanyAssignmentBoard } from './CompanyAssignmentBoard';
import { groupAssignmentsByCompany } from './companyBoard';
import { RevenueSummary } from './RevenueSummary';
import { Tagesplanung } from './Tagesplanung';
import { BRAND_HERO, BRAND_TAB_ACTIVE } from '@/lib/brand-colors';
import { FLEET_LIST_CARD } from '@/lib/fleet-table';
import { cn } from '@/lib/utils';
import { UrlaubsplanerPanel } from './UrlaubsplanerPanel';

type TopTab = 'dashboard' | 'urlaub' | 'tagesplanung' | 'revenue' | 'users';
type UrlaubSubtab = 'jahreskalender' | 'abteilungskalender' | 'antragsverwaltung';
type PlanningSubtab = 'daily-overview' | 'planning' | 'morning-checkins' | 'vehicle-handovers' | 'company-notifications';

const baseTopTabs: Array<{ id: TopTab; label: string; icon: typeof Gauge }> = [
  { id: 'dashboard', label: 'Dashboard', icon: Gauge },
  { id: 'urlaub', label: 'Urlaubsplaner', icon: Sun },
  { id: 'tagesplanung', label: 'Tagesplanung', icon: ClipboardCheck },
  { id: 'revenue', label: 'Revenue Summary', icon: Wallet },
];

const adminTab: { id: TopTab; label: string; icon: typeof Gauge } = {
  id: 'users',
  label: 'Benutzerverwaltung',
  icon: Users,
};

export function EinsatzplanPage() {
  const user = getUser();
  if (user?.role === 'office') {
    return <EinsatzplanOfficeView />;
  }
  return <EinsatzplanFullView />;
}

function EinsatzplanFullView() {
  const { t } = useTranslation();
  const { assignments, drivers } = useFleetData();
  const searchParams = useSearchParams();
  const tomorrowDate = getTomorrowDate();

  const isAdmin = getUser()?.role === 'admin';
  const topTabs = useMemo(
    () => (isAdmin ? [...baseTopTabs, adminTab] : baseTopTabs),
    [isAdmin],
  );

  const [kpis, setKpis] = useState<DashboardKpis | null>(null);

  useEffect(() => {
    let active = true;
    dashboardApi
      .getSummary()
      .then((summary) => {
        if (active) setKpis(summary.kpis);
      })
      .catch(() => {
        if (active) setKpis(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const summaryCards = useMemo(
    () => [
      { label: t('einsatzplan.kpi.activeDrivers'), value: kpis?.activeDrivers },
      { label: t('einsatzplan.kpi.vehiclesInUse'), value: kpis?.vehiclesInUse },
      { label: t('einsatzplan.kpi.driversOnVacation'), value: kpis?.driversOnVacation },
      { label: t('einsatzplan.kpi.sickDrivers'), value: kpis?.sickDrivers },
    ],
    [kpis, t],
  );

  const tomorrowCompanyGroups = useMemo(() => {
    const tomorrowAssignments = assignments.filter((assignment) => {
      if (assignment.date !== tomorrowDate) return false;
      return ['manual', 'mobile_checkin', 'transport_request'].includes(assignment.source);
    });
    return groupAssignmentsByCompany(tomorrowAssignments);
  }, [assignments, tomorrowDate]);

  const panelFromQuery = searchParams.get('panel');
  const viewFromQuery = searchParams.get('view');
  const absenceFromQuery = searchParams.get('absence');

  const initialTopTab = useMemo<TopTab>(() => {
    if (panelFromQuery === 'users') return 'users';
    if (panelFromQuery === 'urlaubsplaner') return 'urlaub';
    if (panelFromQuery === 'tagesplanung' || panelFromQuery === 'company_notifications') return 'tagesplanung';
    return 'dashboard';
  }, [panelFromQuery]);

  const initialUrlaubSubtab = useMemo<UrlaubSubtab | undefined>(() => {
    if (viewFromQuery === 'jahreskalender') return 'jahreskalender';
    if (viewFromQuery === 'antragsverwaltung') return 'antragsverwaltung';
    if (viewFromQuery === 'abteilungskalender') return 'abteilungskalender';
    return undefined;
  }, [viewFromQuery]);

  const initialPlanningSubtab = useMemo<PlanningSubtab | undefined>(() => {
    if (panelFromQuery === 'company_notifications') return 'company-notifications';
    if (viewFromQuery === 'company-notifications') return 'company-notifications';
    if (viewFromQuery === 'morning-checkins') return 'morning-checkins';
    if (viewFromQuery === 'vehicle-handovers') return 'vehicle-handovers';
    if (viewFromQuery === 'planning') return 'planning';
    if (viewFromQuery === 'daily-overview' || panelFromQuery === 'tagesplanung') return 'daily-overview';
    return undefined;
  }, [panelFromQuery, viewFromQuery]);

  const [activeTab, setActiveTab] = useState<TopTab>(initialTopTab);

  return (
    <div className="space-y-5 bg-[#f5f7fb]">
      <div className="rounded-xl border border-slate-300 bg-white shadow-sm">
        <div className="flex items-stretch gap-1 overflow-x-auto border-b border-slate-300 bg-slate-100 p-2">
          {topTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex min-w-fit items-center gap-2 rounded-t-md border px-4 py-2 text-sm font-semibold transition-colors',
                  isActive ? BRAND_TAB_ACTIVE : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}

          <div className="ml-auto flex items-center pr-2">
            <button
              type="button"
              className="rounded border border-slate-300 bg-white p-2 text-slate-500 hover:bg-slate-50"
              aria-label="Close tab bar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {activeTab === 'dashboard' && (
            <div className="space-y-4 sm:space-y-5">
              <div className={cn('flex flex-col gap-3 rounded-lg border border-slate-200 p-5 text-white shadow-sm lg:flex-row lg:items-center lg:justify-between', BRAND_HERO)}>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-blue-100">Fleet ERP</p>
                  <h1 className="mt-2 text-2xl font-bold">{t('einsatzplan.title')}</h1>
                  <p className="mt-1 text-sm text-blue-100">{t('einsatzplan.subtitle')}</p>
                </div>
                <Link
                  href="/assignments/new"
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-white/30 bg-white px-4 py-2 text-sm font-semibold text-[#1a4d7a] hover:bg-[#e8f0f8]"
                >
                  <Plus className="h-4 w-4" />
                  {t('assignmentForm.title')}
                </Link>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {summaryCards.map((card) => (
                  <div key={card.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-wide text-slate-500">{card.label}</p>
                    <p className="mt-2 text-3xl font-bold text-slate-900">
                      {card.value ?? '—'}
                    </p>
                  </div>
                ))}
              </div>

              <div className={cn(FLEET_LIST_CARD, 'bg-white')}>
                <div className="border-b border-slate-200 px-3 py-2">
                  <h2 className="text-sm font-semibold text-slate-900">{t('einsatzplan.tomorrowTitle')}</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {t('einsatzplan.tomorrowHint')}
                  </p>
                </div>
                <div className="p-3">
                  <CompanyAssignmentBoard
                    groups={tomorrowCompanyGroups}
                    drivers={drivers}
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'urlaub' && (
            <UrlaubsplanerPanel initialSubtab={initialUrlaubSubtab} initialAbsenceFocus={absenceFromQuery === 'UT' || absenceFromQuery === 'KT' ? absenceFromQuery : undefined} />
          )}

          {activeTab === 'tagesplanung' && <Tagesplanung initialSubTab={initialPlanningSubtab} />}

          {activeTab === 'revenue' && <RevenueSummary />}

          {activeTab === 'users' && (
            <Benutzerverwaltung />
          )}
        </div>
      </div>
    </div>
  );
}
