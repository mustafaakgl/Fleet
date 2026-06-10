'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { IBM_Plex_Mono, Inter } from 'next/font/google';
import { dashboardApi, messengerApi, onboardingApi } from '@/lib/api';
import { canViewFinancials } from '@/lib/permissions';
import { getUser } from '@/lib/auth';
import {
  conversationTitle,
  driverDisplayName,
  formatMessengerRelativeTime,
  personInitials,
} from '@/lib/messenger-utils';
import { formatDate } from '@/lib/utils';
import type {
  ConversationListItem,
  DashboardFleetWidgets,
  DashboardSummary,
  DashboardVehicleHealthRow,
} from '@/lib/types';
import './dashboard-v2.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-fdb-inter' });
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-fdb-mono',
});

type ViewTab = 'betrieb' | 'analyse';
type PlanTab = 'heute' | 'morgen';

type ActionItem = {
  id: string;
  icon: string;
  tone: 'rot' | 'gelb' | 'blau';
  title: string;
  subtitle: string;
  count: number;
  countTone: 'rot' | 'gelb';
  cta: string;
  href: string;
};

function intlLocale(language: string): string {
  if (language.startsWith('tr')) return 'tr-TR';
  if (language.startsWith('en')) return 'en-US';
  return 'de-DE';
}

function greetingName(fullName: string | undefined, t: TFunction): string {
  if (!fullName) return t('dashboard.v2.greetingFallback');
  const parts = fullName.trim().split(/\s+/);
  const last = parts[parts.length - 1];
  return last ? t('dashboard.v2.greetingHonorific', { lastName: last }) : fullName;
}

function currency(value: number | null | undefined, language: string) {
  if (value === null || value === undefined) {
    return new Intl.NumberFormat(intlLocale(language), {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(0);
  }
  return new Intl.NumberFormat(intlLocale(language), {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
}

function chartHeight(value: number, max: number): string {
  if (max <= 0) return '8%';
  return `${Math.max(8, Math.round((value / max) * 100))}%`;
}

function buildActionItems(summary: DashboardSummary, t: TFunction): ActionItem[] {
  const k = summary.kpis;
  const tp = summary.tomorrowPlanning;
  const fw = summary.fleetWidgets;
  const items: ActionItem[] = [];

  if (tp.missingAssignments > 0) {
    items.push({
      id: 'missing',
      icon: '📅',
      tone: 'rot',
      title: t('dashboard.v2.actions.missing.title'),
      subtitle: t('dashboard.v2.actions.missing.subtitle', {
        available: tp.availableDrivers,
        planned: tp.plannedDrivers,
      }),
      count: tp.missingAssignments,
      countTone: 'rot',
      cta: t('dashboard.openEinsatzplan'),
      href: '/assignments?panel=tagesplanung&view=daily-overview',
    });
  }

  const openIncidents = k.openAccidents + k.cargoDamages;
  if (openIncidents > 0) {
    items.push({
      id: 'incidents',
      icon: '🚨',
      tone: 'rot',
      title: t('dashboard.v2.actions.incidents.title'),
      subtitle: t('dashboard.v2.actions.incidents.subtitle', { cargo: k.cargoDamages }),
      count: openIncidents,
      countTone: 'rot',
      cta: t('dashboard.v2.actions.incidents.cta'),
      href: '/cargo-damage?status=reported,under_review',
    });
  }

  if (k.unsentCompanyEmails > 0) {
    items.push({
      id: 'emails',
      icon: '✉️',
      tone: 'gelb',
      title: t('dashboard.v2.actions.emails.title'),
      subtitle: t('dashboard.v2.actions.emails.subtitle'),
      count: k.unsentCompanyEmails,
      countTone: 'gelb',
      cta: t('dashboard.v2.actions.emails.cta'),
      href: '/assignments',
    });
  }

  if (k.expiringDocuments > 0) {
    items.push({
      id: 'documents',
      icon: '📄',
      tone: 'gelb',
      title: t('dashboard.v2.actions.documents.title'),
      subtitle: t('dashboard.v2.actions.documents.subtitle'),
      count: k.expiringDocuments,
      countTone: 'gelb',
      cta: t('dashboard.view'),
      href: '/documents?status=expiring_soon,expired',
    });
  }

  const serviceTotal = fw
    ? fw.serviceReminders.dueSoon +
      fw.serviceReminders.overdue +
      fw.vehicleRenewals.dueSoon +
      fw.vehicleRenewals.overdue +
      fw.incompleteWorkOrders.open
    : 0;

  if (serviceTotal > 0) {
    items.push({
      id: 'service',
      icon: '🔧',
      tone: 'gelb',
      title: t('dashboard.v2.actions.service.title'),
      subtitle: t('dashboard.v2.actions.service.subtitle', {
        serviceReminders: fw?.serviceReminders.dueSoon ?? 0,
        renewals: fw?.vehicleRenewals.dueSoon ?? 0,
        workOrders: fw?.incompleteWorkOrders.open ?? 0,
      }),
      count: serviceTotal,
      countTone: 'gelb',
      cta: t('dashboard.v2.actions.service.cta'),
      href: '/vehicles',
    });
  }

  return items;
}

function vehicleBadges(row: DashboardVehicleHealthRow, t: TFunction) {
  const badges: { label: string; tone: 'rot' | 'gelb' | 'grau' }[] = [];
  const issue = row.issue.toLowerCase();

  if (row.status === 'maintenance' || issue.includes('werkstatt')) {
    badges.push({ label: t('dashboard.v2.vehicles.badgeInShop'), tone: 'grau' });
  }
  if (issue.includes('tuv') || issue.includes('hu')) {
    badges.push({
      label: issue.includes('overdue')
        ? t('dashboard.v2.vehicles.badgeTuvOverdue')
        : t('dashboard.v2.vehicles.badgeTuvSoon'),
      tone: issue.includes('overdue') ? 'rot' : 'gelb',
    });
  }
  if (issue.includes('sp')) {
    badges.push({
      label: issue.includes('overdue')
        ? t('dashboard.v2.vehicles.badgeSpOverdue')
        : t('dashboard.v2.vehicles.badgeSpSoon'),
      tone: issue.includes('overdue') ? 'rot' : 'gelb',
    });
  }
  if (badges.length === 0 && issue) {
    badges.push({ label: issue.replace(/_/g, ' '), tone: 'gelb' });
  }

  return badges;
}

function dismissStorageKey(tenantId: string) {
  return `onboarding-banner-dismissed:${tenantId}`;
}

export function FleetOperationsDashboard() {
  const { t, i18n } = useTranslation();
  const user = getUser();
  const showFinancials = user ? canViewFinancials(user.role) : false;

  const [viewTab, setViewTab] = useState<ViewTab>('betrieb');
  const [planTab, setPlanTab] = useState<PlanTab>('heute');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [messages, setMessages] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onboarding, setOnboarding] = useState<{
    completed: number;
    total: number;
    tenantId: string;
  } | null>(null);
  const [onbDismissed, setOnbDismissed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, convos, progress] = await Promise.all([
        dashboardApi.getSummary(),
        messengerApi.listConversations().catch(() => [] as ConversationListItem[]),
        user?.role === 'admin' ? onboardingApi.getProgress().catch(() => null) : Promise.resolve(null),
      ]);
      setSummary(data);
      setMessages(convos.slice(0, 2));
      if (progress) {
        const steps = progress.steps.filter((s) => s.id.startsWith('widget_') || s.id.includes('onboarding'));
        const completed = steps.filter((s) => s.complete).length;
        const total = steps.length || progress.steps.length;
        setOnboarding({ completed, total, tenantId: progress.tenant.id });
        setOnbDismissed(localStorage.getItem(dismissStorageKey(progress.tenant.id)) === '1');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('dashboard.loadError'));
    } finally {
      setLoading(false);
    }
  }, [user?.role, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const actions = useMemo(() => (summary ? buildActionItems(summary, t) : []), [summary, t]);
  const attentionCount = actions.length;

  const kpis = useMemo(() => {
    if (!summary) return [];
    const k = summary.kpis;
    const fw: DashboardFleetWidgets | undefined = summary.fleetWidgets;
    const rev = summary.revenueAnalytics;
    const assigned = fw?.vehicleAssignments.assigned ?? k.vehiclesInUse;
    const unassigned = fw?.vehicleAssignments.unassigned ?? 0;
    const totalVehicles = (fw?.vehicleStatus.active ?? 0) + (fw?.vehicleStatus.maintenance ?? 0) + unassigned || 7;

    const lang = i18n.language;

    return [
      {
        id: 'drivers',
        label: t('dashboard.activeDrivers'),
        value: String(k.activeDrivers),
        sub: t('dashboard.v2.kpi.driversSub', { vacation: k.driversOnVacation, sick: k.sickDrivers }),
        subTone: 'neutral' as const,
      },
      {
        id: 'vehicles',
        label: t('dashboard.vehiclesInUse'),
        value: (
          <>
            {k.vehiclesInUse}
            <small> / {totalVehicles}</small>
          </>
        ),
        sub: k.vehiclesInUse === 0 ? t('dashboard.v2.kpi.noAssignmentsPlanned') : t('dashboard.v2.kpi.inUse'),
        subTone: k.vehiclesInUse === 0 ? ('schlecht' as const) : ('neutral' as const),
      },
      {
        id: 'status',
        label: t('dashboard.widgets.vehicleStatus'),
        value: (
          <>
            {fw?.vehicleStatus.active ?? totalVehicles}
            <small> {t('dashboard.v2.kpi.active')}</small>
          </>
        ),
        sub: t('dashboard.v2.kpi.inWorkshop', { count: fw?.vehicleStatus.maintenance ?? 0 }),
        subTone: 'neutral' as const,
      },
      {
        id: 'assign',
        label: t('dashboard.v2.kpi.assignments'),
        value: (
          <>
            {assigned}
            <small> / {assigned + unassigned}</small>
          </>
        ),
        sub: unassigned > 0 ? t('dashboard.v2.kpi.unassignedCount', { count: unassigned }) : t('dashboard.v2.kpi.allAssigned'),
        subTone: unassigned > 0 ? ('schlecht' as const) : ('gut' as const),
      },
      {
        id: 'rev-today',
        label: t('dashboard.v2.kpi.revenueToday'),
        value: currency(rev?.todayRevenue ?? 0, lang),
        sub: t('dashboard.v2.kpi.weekRevenue', { amount: currency(rev?.weeklyRevenue ?? 0, lang) }),
        subTone: 'neutral' as const,
      },
      {
        id: 'rev-month',
        label: t('dashboard.v2.kpi.revenueMonth'),
        value: currency(rev?.monthlyRevenue ?? 0, lang),
        sub: t('dashboard.v2.kpi.monthRunning'),
        subTone: 'gut' as const,
      },
    ];
  }, [summary, t, i18n.language]);

  const showOnboarding =
    user?.role === 'admin' &&
    onboarding &&
    !onbDismissed &&
    onboarding.completed < onboarding.total;

  const monthlyRevenue = summary?.chartAnalytics?.monthlyRevenue ?? [];
  const monthlyAccidents = summary?.chartAnalytics?.monthlyAccidents ?? [];
  const totalCosts = summary?.costAnalytics?.totalCosts ?? [];
  const repairReasons = summary?.costAnalytics?.topRepairReasons ?? [];
  const maxRevenue = Math.max(...monthlyRevenue.map((p) => p.value), 1);
  const maxAccidents = Math.max(...monthlyAccidents.map((p) => p.value), 1);
  const maxCosts = Math.max(...totalCosts.map((p) => p.value), 1);
  const maxRepair = Math.max(...repairReasons.map((r) => r.count), 1);

  const todayOps = summary?.todayOperations ?? [];
  const tomorrow = summary?.tomorrowPlanning;

  return (
    <div className={`fdb ${inter.variable} ${ibmPlexMono.variable}`}>
      {showOnboarding ? (
        <div className="fdb-onb">
          <b>
            {t('dashboard.v2.onboardingSetup', {
              completed: onboarding.completed,
              total: onboarding.total,
            })}
          </b>
          <div className="fdb-fortschritt">
            <i style={{ width: `${Math.round((onboarding.completed / onboarding.total) * 100)}%` }} />
          </div>
          <Link href="/onboarding">{t('dashboard.v2.onboardingContinue')}</Link>
          <button
            type="button"
            className="fdb-onb-schliessen"
            aria-label={t('dashboard.v2.dismiss')}
            onClick={() => {
              localStorage.setItem(dismissStorageKey(onboarding.tenantId), '1');
              setOnbDismissed(true);
            }}
          >
            ✕
          </button>
        </div>
      ) : null}

      <div className="fdb-gruss">
        <div>
          <h1>{t('dashboard.v2.greeting', { name: greetingName(user?.name, t) })}</h1>
          <p>
            {attentionCount > 0
              ? t(attentionCount === 1 ? 'dashboard.v2.attentionOne' : 'dashboard.v2.attentionMany', {
                  count: attentionCount,
                })
              : t('dashboard.v2.attentionNone')}
          </p>
        </div>
        {showFinancials ? (
          <div className="fdb-ansicht" role="tablist">
            <button
              type="button"
              className={viewTab === 'betrieb' ? 'fdb-aktiv' : undefined}
              onClick={() => setViewTab('betrieb')}
            >
              {t('dashboard.v2.tabOperations')}
            </button>
            <button
              type="button"
              className={viewTab === 'analyse' ? 'fdb-aktiv' : undefined}
              onClick={() => setViewTab('analyse')}
            >
              {t('dashboard.v2.tabAnalysis')}
            </button>
          </div>
        ) : null}
      </div>

      {error ? <div className="fdb-error">{error}</div> : null}

      <div className={`fdb-seite${viewTab === 'betrieb' ? ' fdb-aktiv' : ''}`} id="s-betrieb">
        <section className="fdb-handeln">
          <div className="fdb-handeln-kopf">
            <h2>{t('dashboard.v2.actionRequired')}</h2>
            <span className="fdb-zahl">{attentionCount}</span>
          </div>
          {loading ? (
            <p className="fdb-loading" style={{ padding: '12px 22px' }}>
              {t('dashboard.v2.loading')}
            </p>
          ) : actions.length === 0 ? (
            <p className="fdb-loading" style={{ padding: '12px 22px' }}>
              {t('dashboard.v2.noUrgentTasks')}
            </p>
          ) : (
            actions.map((item) => (
              <div key={item.id} className="fdb-aufgabe">
                <div className={`fdb-a-ico fdb-a-ico-${item.tone}`}>{item.icon}</div>
                <div className="fdb-a-text">
                  <b>{item.title}</b>
                  <span>{item.subtitle}</span>
                </div>
                <span className={`fdb-a-zahl fdb-a-zahl-${item.countTone}`}>{item.count}</span>
                <Link href={item.href} className="fdb-a-btn">
                  {item.cta}
                </Link>
              </div>
            ))
          )}
        </section>

        <section className="fdb-kpis">
          {kpis.map((kpi) => (
            <div key={kpi.id} className="fdb-kpi">
              <div className="fdb-k-label">{kpi.label}</div>
              <div className="fdb-k-wert">{kpi.value}</div>
              <div className={`fdb-k-sub fdb-k-sub-${kpi.subTone}`}>{kpi.sub}</div>
            </div>
          ))}
        </section>

        <div className="fdb-reihe3">
          <section className="fdb-karte">
            <div className="fdb-k-kopf">
              <h3>{t('dashboard.v2.planning.title')}</h3>
              <div className="fdb-plan-tabs">
                <button
                  type="button"
                  className={planTab === 'heute' ? 'fdb-aktiv' : undefined}
                  onClick={() => setPlanTab('heute')}
                >
                  {t('dashboard.v2.planning.today')}
                </button>
                <button
                  type="button"
                  className={planTab === 'morgen' ? 'fdb-aktiv' : undefined}
                  onClick={() => setPlanTab('morgen')}
                >
                  {t('dashboard.v2.planning.tomorrow')}
                </button>
              </div>
            </div>
            <div className="fdb-k-body">
              <div className={`fdb-plan-panel${planTab === 'heute' ? ' fdb-aktiv' : ''}`}>
                {todayOps.length === 0 ? (
                  <div className="fdb-leer-hinweis">
                    {t('dashboard.v2.planning.noToday')}
                    <br />
                    <Link href="/assignments?panel=tagesplanung&view=planning" className="fdb-a-btn">
                      {t('dashboard.v2.planning.createAssignment')}
                    </Link>
                  </div>
                ) : (
                  <div className="fdb-leer-hinweis">
                    {t('dashboard.v2.planning.assignmentsToday', { count: todayOps.length })}
                    <br />
                    <Link href="/assignments?panel=tagesplanung&view=daily-overview" className="fdb-a-btn">
                      {t('dashboard.openEinsatzplan')}
                    </Link>
                  </div>
                )}
              </div>
              <div className={`fdb-plan-panel${planTab === 'morgen' ? ' fdb-aktiv' : ''}`}>
                {tomorrow ? (
                  <>
                    <div className="fdb-plan-stat">
                      <div>
                        <b className={tomorrow.plannedDrivers === 0 ? 'fdb-rot' : undefined}>
                          {tomorrow.plannedDrivers}
                        </b>
                        <span>{t('dashboard.v2.planning.planned')}</span>
                      </div>
                      <div>
                        <b>{tomorrow.availableDrivers}</b>
                        <span>{t('dashboard.v2.planning.available')}</span>
                      </div>
                      <div>
                        <b className={tomorrow.missingAssignments > 0 ? 'fdb-rot' : undefined}>
                          {tomorrow.missingAssignments}
                        </b>
                        <span>{t('dashboard.v2.planning.missing')}</span>
                      </div>
                      <div>
                        <b>{tomorrow.unavailableDrivers.length}</b>
                        <span>{t('dashboard.v2.planning.absent')}</span>
                      </div>
                    </div>
                    <div className="fdb-leer-hinweis">
                      {tomorrow.missingAssignments > 0
                        ? t('dashboard.v2.planning.driversWaiting', { count: tomorrow.missingAssignments })
                        : t('dashboard.v2.planning.tomorrowGood')}
                      <br />
                      <Link href="/assignments?panel=tagesplanung&view=daily-overview" className="fdb-a-btn">
                        {t('dashboard.openEinsatzplan')}
                      </Link>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </section>

          <section className="fdb-karte">
            <div className="fdb-k-kopf">
              <h3>{t('dashboard.vehicleHealth')}</h3>
              <Link href="/vehicles">{t('dashboard.v2.vehicles.all')}</Link>
            </div>
            <div className="fdb-k-body">
              {(summary?.vehicleHealth ?? []).slice(0, 4).map((row) => (
                <div key={`${row.vehicleId}-${row.issue}`} className="fdb-fz-zeile">
                  <div>
                    <div className="fdb-kz">{row.plateNumber}</div>
                    <div className="fdb-termine">
                      {t('dashboard.v2.vehicles.inspectionDates', {
                        tuv: formatDate(row.tuvExpiryDate),
                        sp: formatDate(row.spExpiryDate),
                      })}
                    </div>
                  </div>
                  <div className="fdb-badges">
                    {vehicleBadges(row, t).map((badge) => (
                      <span key={badge.label} className={`fdb-badge fdb-badge-${badge.tone}`}>
                        {badge.label}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {!loading && (summary?.vehicleHealth.length ?? 0) === 0 ? (
                <p className="fdb-loading">{t('dashboard.v2.vehicles.noDeadlines')}</p>
              ) : null}
            </div>
          </section>

          <div className="fdb-stack">
            <section className="fdb-karte">
              <div className="fdb-k-kopf">
                <h3>{t('dashboard.driverRiskOverview')}</h3>
                <Link href="/drivers">{t('dashboard.v2.drivers.all')}</Link>
              </div>
              <div className="fdb-k-body">
                {(summary?.driverRiskOverview ?? []).slice(0, 5).map((row) => (
                  <div key={row.driverId} className="fdb-risiko-zeile">
                    <span className={`fdb-ampel fdb-ampel-${row.riskLevel === 'red' ? 'rot' : row.riskLevel === 'yellow' ? 'gelb' : 'gruen'}`} />
                    {row.driverName}
                    <span className="fdb-unfaelle">{t('dashboard.accidents', { count: row.accidentCount })}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="fdb-karte">
              <div className="fdb-k-kopf">
                <h3>{t('dashboard.v2.messages.title')}</h3>
                <Link href="/messenger">{t('dashboard.v2.messages.messenger')}</Link>
              </div>
              <div className="fdb-k-body">
                {messages.length === 0 ? (
                  <p className="fdb-loading">{t('dashboard.v2.messages.empty')}</p>
                ) : (
                  messages.map((conversation) => (
                    <div key={conversation.id} className="fdb-msg-zeile">
                      <div className="fdb-msg-avatar">
                        {personInitials(driverDisplayName(conversation))}
                      </div>
                      <div className="fdb-mz-t">
                        <b>{conversationTitle(conversation)}</b>
                        <p>
                          {conversation.lastMessage?.translatedText ??
                            conversation.lastMessage?.originalText ??
                            '—'}
                        </p>
                      </div>
                      <span className="fdb-zeit">
                        {conversation.lastMessageAt
                          ? formatMessengerRelativeTime(conversation.lastMessageAt, i18n.language)
                          : '—'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </div>

      {showFinancials ? (
        <div className={`fdb-seite${viewTab === 'analyse' ? ' fdb-aktiv' : ''}`} id="s-analyse">
          <div className="fdb-analyse-grid">
            <section className="fdb-karte">
              <div className="fdb-k-kopf">
                <h3>{t('dashboard.v2.analyse.revenue')}</h3>
                <Link href="/reports">{t('dashboard.v2.analyse.report')}</Link>
              </div>
              <div className="fdb-k-body">
                <div className="fdb-umsatz-stat">
                  <div>
                    <b>{currency(summary?.revenueAnalytics?.todayRevenue, i18n.language)}</b>
                    <span>{t('dashboard.revToday')}</span>
                  </div>
                  <div>
                    <b>{currency(summary?.revenueAnalytics?.weeklyRevenue, i18n.language)}</b>
                    <span>{t('dashboard.revWeek')}</span>
                  </div>
                  <div>
                    <b>{currency(summary?.revenueAnalytics?.monthlyRevenue, i18n.language)}</b>
                    <span>{t('dashboard.revMonth')}</span>
                  </div>
                </div>
                <div className="fdb-chart" aria-hidden="true">
                  {monthlyRevenue.map((point, index) => (
                    <div key={point.label} className="fdb-saeule">
                      <div
                        className={`fdb-balken${index === monthlyRevenue.length - 1 ? ' fdb-balken-akzent' : ''}`}
                        style={{ height: chartHeight(point.value, maxRevenue) }}
                      />
                      <span className="fdb-tag">{point.shortLabel ?? point.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="fdb-karte">
              <div className="fdb-k-kopf">
                <h3>{t('dashboard.v2.analyse.accidents')}</h3>
                <Link href="/cargo-damage">{t('dashboard.v2.analyse.incidents')}</Link>
              </div>
              <div className="fdb-k-body">
                <div className="fdb-chart" aria-hidden="true">
                  {monthlyAccidents.map((point) => (
                    <div key={point.label} className="fdb-saeule">
                      <div
                        className="fdb-balken fdb-balken-rot"
                        style={{ height: chartHeight(point.value, maxAccidents) }}
                      />
                      <span className="fdb-tag">{point.shortLabel ?? point.label}</span>
                    </div>
                  ))}
                </div>
                <div className="fdb-chart-fuss">
                  <span>
                    {t('dashboard.v2.analyse.open')}: <b>{summary?.kpis.openAccidents ?? 0}</b>
                  </span>
                  <span>
                    {t('dashboard.v2.analyse.cargoDamages')}: <b>{summary?.kpis.cargoDamages ?? 0}</b>
                  </span>
                </div>
              </div>
            </section>

            <section className="fdb-karte">
              <div className="fdb-k-kopf">
                <h3>{t('dashboard.costCharts.totalCosts')}</h3>
                <Link href="/reports">{t('dashboard.v2.analyse.costReport')}</Link>
              </div>
              <div className="fdb-k-body">
                <div className="fdb-chart" aria-hidden="true">
                  {totalCosts.map((point, index) => (
                    <div key={point.shortLabel} className="fdb-saeule">
                      <div
                        className={`fdb-balken${index === totalCosts.length - 1 ? ' fdb-balken-akzent' : ''}`}
                        style={{ height: chartHeight(point.value, maxCosts) }}
                      />
                      <span className="fdb-tag">{point.shortLabel}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="fdb-karte">
              <div className="fdb-k-kopf">
                <h3>{t('dashboard.costCharts.topRepairReasons')}</h3>
                <Link href="/vehicles">{t('dashboard.v2.analyse.serviceHistory')}</Link>
              </div>
              <div className="fdb-k-body">
                {repairReasons.slice(0, 4).map((reason) => (
                  <div key={reason.id} className="fdb-grund-zeile">
                    <span style={{ minWidth: 150 }}>{reason.label}</span>
                    <div className="fdb-grund-balken">
                      <i style={{ width: `${Math.round((reason.count / maxRepair) * 100)}%` }} />
                    </div>
                    <span className="fdb-anzahl">{reason.count}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
