'use client';

import Link from 'next/link';
import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardCheck, Sun, Truck } from 'lucide-react';
import { getTomorrowDate, useFleetData } from '@/context/FleetDataContext';
import { usePlanningDate } from '@/hooks/usePlanningDate';
import {
  resolveOfficeTabFromQuery,
  vehicleAssignmentsHref,
  type EinsatzplanView,
  type OfficeEinsatzTab,
} from '@/lib/office-deep-links';
import { CompanyAssignmentBoard } from './CompanyAssignmentBoard';
import { groupAssignmentsByCompany } from './companyBoard';
import { BRAND_LINK, BRAND_TAB_ACTIVE } from '@/lib/brand-colors';
import { cn } from '@/lib/utils';
import { Tagesplanung } from './Tagesplanung';

export function EinsatzplanOfficeView() {
  const { t } = useTranslation('einsatzplan');
  const { t: tCommon } = useTranslation('common');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { assignments, drivers, isHydrating, hydrateError, refetchHydrate } = useFleetData();
  const { planningDate, today, shiftPlanningDate, isToday, setPlanningDate } = usePlanningDate();
  const tomorrowDate = getTomorrowDate();

  const activeTab = useMemo(
    () => resolveOfficeTabFromQuery(searchParams),
    [searchParams],
  );

  const setActiveTab = useCallback(
    (tab: OfficeEinsatzTab, view?: EinsatzplanView) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', tab);
      if (view) {
        params.set('view', view);
      } else if (tab === 'morgen') {
        params.delete('view');
        params.delete('transport');
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const tomorrowCompanyGroups = useMemo(() => {
    const tomorrowAssignments = assignments.filter((a) => a.date === tomorrowDate);
    return groupAssignmentsByCompany(tomorrowAssignments);
  }, [assignments, tomorrowDate]);

  const viewFromQuery = searchParams.get('view') as EinsatzplanView | null;
  const initialPlanningSubtab =
    viewFromQuery === 'company-notifications'
      ? ('company-notifications' as const)
      : viewFromQuery === 'morning-checkins'
        ? ('morning-checkins' as const)
        : viewFromQuery === 'vehicle-handovers'
          ? ('vehicle-handovers' as const)
          : viewFromQuery === 'planning'
            ? ('planning' as const)
            : ('daily-overview' as const);

  const tabs: Array<{ id: OfficeEinsatzTab; labelKey: string; icon: typeof Sun }> = [
    { id: 'heute', labelKey: 'office.tab.today', icon: Sun },
    { id: 'morgen', labelKey: 'office.tab.tomorrow', icon: CalendarDays },
    { id: 'betrieb', labelKey: 'office.tab.operations', icon: ClipboardCheck },
  ];

  return (
    <div className="space-y-5 bg-surface">
      <div className="rounded-xl border border-slate-300 bg-white shadow-sm">
        <div className="flex items-stretch gap-1 overflow-x-auto border-b border-slate-300 bg-slate-100 p-2">
          {tabs.map((tab) => {
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
                {t(tab.labelKey)}
              </button>
            );
          })}
        </div>

        <div className="p-4 sm:p-5">
          {isHydrating ? (
            <p className="text-sm text-slate-500">{t('office.loading')}</p>
          ) : null}
          {hydrateError ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <span>{t('office.partialLoad', { sections: hydrateError })}</span>
              <button
                type="button"
                onClick={() => refetchHydrate()}
                className={cn('font-medium underline', BRAND_LINK)}
              >
                {tCommon('errors.retry')}
              </button>
            </div>
          ) : null}

          {activeTab === 'heute' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => shiftPlanningDate(-1)}
                  className="rounded-md border border-slate-300 p-2 hover:bg-slate-50"
                  aria-label={t('office.prevDay')}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <input
                  type="date"
                  value={planningDate}
                  onChange={(e) => setPlanningDate(e.target.value)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => shiftPlanningDate(1)}
                  className="rounded-md border border-slate-300 p-2 hover:bg-slate-50"
                  aria-label={t('office.nextDay')}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                {!isToday ? (
                  <button
                    type="button"
                    onClick={() => setPlanningDate(today)}
                    className={cn('text-sm font-medium', BRAND_LINK)}
                  >
                    {t('office.backToToday')}
                  </button>
                ) : null}
                <Link
                  href={vehicleAssignmentsHref(planningDate)}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Truck className="h-4 w-4" />
                  {tCommon('vehicleAssignments.title')}
                </Link>
              </div>
              <Tagesplanung
                initialSubTab={initialPlanningSubtab}
                planningDate={planningDate}
                officeMode
              />
            </div>
          ) : null}

          {activeTab === 'morgen' ? (
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-slate-900">{t('office.tomorrowTitle')}</h2>
              <p className="text-sm text-slate-600">{t('office.tomorrowHint')}</p>
              <CompanyAssignmentBoard
                groups={tomorrowCompanyGroups}
                drivers={drivers}
                emptyMessage={t('office.tomorrowEmpty')}
              />
            </div>
          ) : null}

          {activeTab === 'betrieb' ? (
            <Tagesplanung
              initialSubTab={initialPlanningSubtab}
              planningDate={planningDate}
              officeMode
              operationsOnly
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
