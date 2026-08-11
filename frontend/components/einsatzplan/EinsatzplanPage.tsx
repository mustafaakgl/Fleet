'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useTranslation } from 'react-i18next';
import {
  CalendarDays,
  Gauge,
  Mail,
  Wallet,
  ClipboardCheck,
  Sun,
  Sunrise,
  Truck,
  Plus,
} from 'lucide-react';
import { getUser } from '@/lib/auth';
import { dashboardApi } from '@/lib/api';
import type { DashboardKpis } from '@/lib/types';
import { getTomorrowDate, useFleetData } from '@/context/FleetDataContext';
import { EinsatzplanOfficeView } from './EinsatzplanOfficeView';
import { CompanyAssignmentBoard } from './CompanyAssignmentBoard';
import { groupAssignmentsByCompany } from './companyBoard';
import { BRAND_HERO, BRAND_TAB_ACTIVE } from '@/lib/brand-colors';
import { FLEET_LIST_CARD } from '@/lib/fleet-table';
import { cn } from '@/lib/utils';

const Tagesplanung = dynamic(
  () => import('./Tagesplanung').then((mod) => mod.Tagesplanung),
  { loading: () => <div className="text-sm text-slate-500">...</div> },
);
const RevenueSummary = dynamic(
  () => import('./RevenueSummary').then((mod) => mod.RevenueSummary),
  { loading: () => <div className="text-sm text-slate-500">...</div> },
);
const UrlaubsplanerPanel = dynamic(
  () => import('./UrlaubsplanerPanel').then((mod) => mod.UrlaubsplanerPanel),
  { loading: () => <div className="text-sm text-slate-500">...</div> },
);

type UrlaubSubtab = 'jahreskalender' | 'abteilungskalender' | 'antragsverwaltung';
type PlanningSubtab = 'daily-overview' | 'planning' | 'morning-checkins' | 'vehicle-handovers' | 'company-notifications';
type TopTab = PlanningSubtab | 'vacation-planner' | 'revenue-summary' | 'overview';

const PLANNING_TABS: readonly string[] = [
  'daily-overview',
  'planning',
  'morning-checkins',
  'vehicle-handovers',
  'company-notifications',
];

function isPlanningTab(tab: TopTab): tab is PlanningSubtab {
  return PLANNING_TABS.includes(tab);
}

type TopTabDef = { id: TopTab; labelKey: string; ns: 'common' | 'einsatzplan'; icon: typeof Gauge };

const TAB_DEFS: Record<TopTab, TopTabDef> = {
  'daily-overview': { id: 'daily-overview', labelKey: 'nav.assignments.dailyOverview', ns: 'common', icon: CalendarDays },
  planning: { id: 'planning', labelKey: 'nav.assignments.planning', ns: 'common', icon: ClipboardCheck },
  'morning-checkins': { id: 'morning-checkins', labelKey: 'nav.assignments.morningCheckins', ns: 'common', icon: Sunrise },
  'vehicle-handovers': { id: 'vehicle-handovers', labelKey: 'nav.assignments.vehicleHandovers', ns: 'common', icon: Truck },
  'company-notifications': { id: 'company-notifications', labelKey: 'nav.assignments.companyNotifications', ns: 'common', icon: Mail },
  'vacation-planner': { id: 'vacation-planner', labelKey: 'nav.assignments.vacationPlanner', ns: 'common', icon: Sun },
  'revenue-summary': { id: 'revenue-summary', labelKey: 'nav.assignments.revenueSummary', ns: 'common', icon: Wallet },
  overview: { id: 'overview', labelKey: 'einsatzplan.dashboard', ns: 'einsatzplan', icon: Gauge },
};

/**
 * Sekme sirasi role gore. Sira rastgele degil, gunluk isin sirasi.
 *
 * Yonetim once parayi gorur (gelir ozeti), muhasebe gormez. Arac devirleri
 * yonetimde YOK: operasyonel bir ekran ve muhasebe/office'te kaliyor. Sayfaya
 * dogrudan adresle hala ulasilabilir, sekme cubugunda gorunmuyor.
 */
const MANAGEMENT_TABS: TopTab[] = [
  'revenue-summary',
  'daily-overview',
  'planning',
  'vacation-planner',
  'company-notifications',
  'morning-checkins',
  'overview',
];

const ACCOUNTING_TABS: TopTab[] = [
  'daily-overview',
  'planning',
  'vacation-planner',
  'company-notifications',
  'morning-checkins',
  'vehicle-handovers',
];

function tabsForRole(role?: string): TopTabDef[] {
  const ids = role === 'accounting' ? ACCOUNTING_TABS : MANAGEMENT_TABS;
  return ids.map((id) => TAB_DEFS[id]);
}

export function EinsatzplanPage() {
  const user = getUser();
  if (user?.role === 'office') {
    return <EinsatzplanOfficeView />;
  }
  return <EinsatzplanFullView />;
}

function EinsatzplanFullView() {
  const role = getUser()?.role;
  const topTabs = useMemo(() => tabsForRole(role), [role]);
  const { t } = useTranslation('einsatzplan');
  const { t: tCommon } = useTranslation('common');
  const router = useRouter();
  const pathname = usePathname();
  const { assignments, drivers } = useFleetData();
  const searchParams = useSearchParams();
  const tomorrowDate = getTomorrowDate();

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
      { label: tCommon('einsatzplan.kpi.activeDrivers'), value: kpis?.activeDrivers },
      { label: tCommon('einsatzplan.kpi.vehiclesInUse'), value: kpis?.vehiclesInUse },
      { label: tCommon('einsatzplan.kpi.driversOnVacation'), value: kpis?.driversOnVacation },
      { label: tCommon('einsatzplan.kpi.sickDrivers'), value: kpis?.sickDrivers },
    ],
    [kpis, tCommon],
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
    if (panelFromQuery === 'revenue') return 'revenue-summary';
    if (panelFromQuery === 'urlaubsplaner') return 'vacation-planner';
    if (panelFromQuery === 'company_notifications') return 'company-notifications';
    if (viewFromQuery && PLANNING_TABS.includes(viewFromQuery)) return viewFromQuery as PlanningSubtab;
    return 'daily-overview';
  }, [panelFromQuery, viewFromQuery]);

  const initialUrlaubSubtab = useMemo<UrlaubSubtab | undefined>(() => {
    if (viewFromQuery === 'jahreskalender') return 'jahreskalender';
    if (viewFromQuery === 'antragsverwaltung') return 'antragsverwaltung';
    if (viewFromQuery === 'abteilungskalender') return 'abteilungskalender';
    return undefined;
  }, [viewFromQuery]);

  const [activeTab, setActiveTab] = useState<TopTab>(initialTopTab);

  const handlePlanningSubTabChange = useCallback((tab: PlanningSubtab) => {
    setActiveTab(tab);
  }, []);

  useEffect(() => {
    if (panelFromQuery !== 'users') return;
    router.replace(`/settings/users?from=${encodeURIComponent(pathname)}`);
  }, [panelFromQuery, pathname, router]);

  return (
    <div className="space-y-5 bg-surface">
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
                {tab.ns === 'common' ? tCommon(tab.labelKey) : t(tab.labelKey)}
              </button>
            );
          })}
        </div>

        <div className="p-4 sm:p-5">
          {activeTab === 'overview' && (
            <div className="space-y-4 sm:space-y-5">
              <div className={cn('flex flex-col gap-3 rounded-lg border border-slate-200 p-5 text-white shadow-sm lg:flex-row lg:items-center lg:justify-between', BRAND_HERO)}>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-blue-100">Fleet ERP</p>
                  <h1 className="mt-2 text-2xl font-bold">{tCommon('einsatzplan.title')}</h1>
                  <p className="mt-1 text-sm text-blue-100">{tCommon('einsatzplan.subtitle')}</p>
                </div>
                <Link
                  href="/assignments/new"
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-white/30 bg-white px-4 py-2 text-sm font-semibold text-brand-primary hover:bg-surface"
                >
                  <Plus className="h-4 w-4" />
                  {tCommon('assignmentForm.title')}
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
                  <h2 className="text-sm font-semibold text-slate-900">{tCommon('einsatzplan.tomorrowTitle')}</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {tCommon('einsatzplan.tomorrowHint')}
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

          {activeTab === 'vacation-planner' && (
            <UrlaubsplanerPanel initialSubtab={initialUrlaubSubtab} initialAbsenceFocus={absenceFromQuery === 'UT' || absenceFromQuery === 'KT' ? absenceFromQuery : undefined} />
          )}

          {isPlanningTab(activeTab) && (
            <Tagesplanung subTab={activeTab} onSubTabChange={handlePlanningSubTabChange} />
          )}

          {activeTab === 'revenue-summary' && <RevenueSummary />}
        </div>
      </div>
    </div>
  );
}
