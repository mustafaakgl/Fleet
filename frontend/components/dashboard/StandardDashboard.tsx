'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ChevronRight, Printer, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { getUser } from '@/lib/auth';
import { dashboardApi } from '@/lib/api';
import { canViewFinancials } from '@/lib/permissions';
import { formatDate, statusColor } from '@/lib/utils';
import { DashboardCharts } from '@/components/dashboard/DashboardCharts';
import type {
  AuthUser,
  DashboardSummary,
  DashboardCriticalAlert,
} from '@/lib/types';

interface KpiTile {
  id: string;
  label: string;
  value: string;
  href?: string;
}

function alertClass(priority: DashboardCriticalAlert['priority']) {
  if (priority === 'critical') return 'border-red-300 bg-red-50 text-red-800';
  if (priority === 'high') return 'border-orange-300 bg-orange-50 text-orange-800';
  if (priority === 'medium') return 'border-yellow-300 bg-yellow-50 text-yellow-800';
  return 'border-blue-300 bg-blue-50 text-blue-800';
}

function alertHref(alert: DashboardCriticalAlert): string {
  if (alert.relatedEntityType === 'document') return '/documents?status=expiring_soon,expired';
  if (alert.relatedEntityType === 'accident') return '/cargo-damage?status=reported,under_review';
  if (alert.relatedEntityType === 'vehicle_handover') return '/assignments';
  if (alert.relatedEntityType === 'company_email') return '/assignments';
  return '/dashboard';
}

function riskTone(level: 'green' | 'yellow' | 'red') {
  if (level === 'red') return 'bg-red-500';
  if (level === 'yellow') return 'bg-yellow-500';
  return 'bg-green-500';
}

function vehicleIssueLabel(issue: string): string {
  return issue.replace(/_/g, ' ');
}

function currency(value?: number | null) {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
}

export function StandardDashboard() {
  const router = useRouter();
  const { t } = useTranslation();
  const [user] = useState<AuthUser | null>(() => getUser());
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    dashboardApi
      .getSummary()
      .then((data) => {
        if (mounted) setSummary(data);
      })
      .catch((e) => {
        if (mounted) setError(e instanceof Error ? e.message : 'Failed to load dashboard');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const showFinancials = user ? canViewFinancials(user.role) : false;

  const kpiTiles: KpiTile[] = summary
    ? [
        { id: 'k1', label: t('dashboard.activeDrivers'), value: String(summary.kpis.activeDrivers), href: '/drivers?status=active' },
        { id: 'k2', label: t('dashboard.driversVacation'), value: String(summary.kpis.driversOnVacation), href: '/assignments' },
        { id: 'k3', label: t('dashboard.sickDrivers'), value: String(summary.kpis.sickDrivers), href: '/drivers?status=sick' },
        { id: 'k4', label: t('dashboard.vehiclesInUse'), value: String(summary.kpis.vehiclesInUse), href: '/vehicles?status=active' },
        { id: 'k5', label: t('dashboard.openAccidents'), value: String(summary.kpis.openAccidents), href: '/cargo-damage' },
        { id: 'k6', label: t('dashboard.cargoDamages'), value: String(summary.kpis.cargoDamages), href: '/cargo-damage?status=reported,under_review' },
        { id: 'k7', label: t('dashboard.expiringDocuments'), value: String(summary.kpis.expiringDocuments), href: '/documents?status=expiring_soon,expired' },
        { id: 'k8', label: t('dashboard.unsentCompanyEmails'), value: String(summary.kpis.unsentCompanyEmails), href: '/assignments' },
      ]
    : [];

  return (
    <div className="space-y-6 bg-white pb-6">
      <div className="sticky top-0 z-20 -mx-1 flex items-center justify-between border-b border-slate-200 bg-white px-1 py-3">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">{t('dashboard.title')}</h1>
        </div>
        <button
          type="button"
          className="rounded border border-slate-300 p-2 text-slate-600 hover:bg-slate-50"
          aria-label="Print dashboard"
          onClick={() => window.print()}
        >
          <Printer className="h-4 w-4" />
        </button>
      </div>

      {error && (
        <Card>
          <CardContent className="p-4">
            <EmptyState
              icon={AlertTriangle}
              title="Failed to load dashboard"
              subtitle={error}
              actionLabel="Retry"
              onAction={() => window.location.reload()}
            />
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">{t('dashboard.criticalAlerts')}</h2>
        {loading ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={`alert-skel-${i}`} className="h-12" />
            ))}
          </div>
        ) : !summary || summary.criticalAlerts.length === 0 ? (
          <p className="text-sm text-gray-500">No critical alerts.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {summary.criticalAlerts.map((alert) => (
              <Link
                key={alert.id}
                href={alertHref(alert)}
                className={`rounded-lg border px-4 py-3 text-sm shadow-sm transition hover:shadow ${alertClass(alert.priority)}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="h-4 w-4" />
                    {alert.message}
                  </span>
                  <ChevronRight className="h-4 w-4" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">{t('dashboard.kpiCards')}</h2>
        {loading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <Card key={`kpi-skeleton-${index}`}>
                <CardContent className="space-y-2 p-3">
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-7 w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {kpiTiles.map((item) => (
              <KpiCard key={item.id} item={item} onClick={() => item.href && router.push(item.href)} />
            ))}
          </div>
        )}
      </section>

      {showFinancials && summary?.chartAnalytics ? (
        <DashboardCharts analytics={summary.chartAnalytics} />
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">{t('dashboard.todayOperations')}</h2>
        <Card>
          {loading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          ) : !summary || summary.todayOperations.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={TrendingUp}
                title="No assignments today"
                subtitle="No assignments available for selected date."
                actionLabel="Create Assignment"
                onAction={() => router.push('/assignments/new')}
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('dashboard.driver')}</TableHead>
                  <TableHead>{t('dashboard.vehicle')}</TableHead>
                  <TableHead>{t('dashboard.company')}</TableHead>
                  <TableHead>{t('dashboard.startTime')}</TableHead>
                  <TableHead>End time</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.todayOperations.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.driverName}</TableCell>
                    <TableCell>{row.vehiclePlate}</TableCell>
                    <TableCell>{row.companyName}</TableCell>
                    <TableCell>{row.startTime}</TableCell>
                    <TableCell>{row.endTime}</TableCell>
                    <TableCell>
                      <Badge className={statusColor(row.status)}>{row.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">{t('dashboard.tomorrowPlanning')}</h2>
        {loading ? (
          <Skeleton className="h-20" />
        ) : summary ? (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label={t('dashboard.plannedDrivers')} value={String(summary.tomorrowPlanning.plannedDrivers)} />
              <StatCard label={t('dashboard.availableDrivers')} value={String(summary.tomorrowPlanning.availableDrivers)} />
              <StatCard label={t('dashboard.missingAssignments')} value={String(summary.tomorrowPlanning.missingAssignments)} />
              <StatCard
                label="Unavailable drivers"
                value={String(summary.tomorrowPlanning.unavailableDrivers.length)}
              />
            </div>
            {summary.tomorrowPlanning.unavailableDrivers.length > 0 && (
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs font-semibold uppercase text-slate-500 mb-2">Unavailable</p>
                  <div className="flex flex-wrap gap-2 text-sm">
                    {summary.tomorrowPlanning.unavailableDrivers.map((d) => (
                      <Link
                        key={d.driverId}
                        href={`/drivers/${d.driverId}`}
                        className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 hover:bg-slate-100"
                      >
                        {d.driverName}{' '}
                        <span className="text-xs text-slate-500">({d.status})</span>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            <Button asChild>
              <Link href="/assignments?panel=tagesplanung&view=daily-overview">
                {t('dashboard.openEinsatzplan')}
              </Link>
            </Button>
          </>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">{t('dashboard.vehicleHealth')}</h2>
        {loading ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : !summary || summary.vehicleHealth.length === 0 ? (
          <p className="text-sm text-gray-500">No vehicles require attention.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {summary.vehicleHealth.map((v) => (
              <Link key={`${v.vehicleId}-${v.issue}`} href={`/vehicles/${v.vehicleId}`} className="block">
                <Card className="cursor-pointer border-yellow-200 transition hover:shadow-sm">
                  <CardContent className="space-y-1 p-4 text-sm">
                    <p className="font-semibold text-slate-900">{v.plateNumber}</p>
                    <p className="text-slate-700">TUV: {formatDate(v.tuvExpiryDate)}</p>
                    <p className="text-slate-700">SP: {formatDate(v.spExpiryDate)}</p>
                    <p className="font-medium text-yellow-700">{vehicleIssueLabel(v.issue)}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {showFinancials && summary?.revenueAnalytics && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">{t('dashboard.revenueAnalytics')}</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <RevenueCard title="Today" value={currency(summary.revenueAnalytics.todayRevenue)} />
            <RevenueCard title="This week" value={currency(summary.revenueAnalytics.weeklyRevenue)} />
            <RevenueCard title="This month" value={currency(summary.revenueAnalytics.monthlyRevenue)} />
          </div>
          {summary.revenueAnalytics.revenueByCompany && summary.revenueAnalytics.revenueByCompany.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Revenue by company</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Company</TableHead>
                      <TableHead>Assignments</TableHead>
                      <TableHead>Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.revenueAnalytics.revenueByCompany.map((row) => (
                      <TableRow key={row.companyId}>
                        <TableCell>
                          <Link
                            href={`/companies/${row.companyId}`}
                            className="text-blue-600 hover:underline"
                          >
                            {row.companyName}
                          </Link>
                        </TableCell>
                        <TableCell>{row.assignments}</TableCell>
                        <TableCell>{currency(row.revenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Driver Risk Overview</h2>
        <Card>
          <CardContent className="space-y-2 p-4">
            {loading ? (
              <>
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </>
            ) : !summary || summary.driverRiskOverview.length === 0 ? (
              <p className="text-sm text-gray-500">No risk data.</p>
            ) : (
              summary.driverRiskOverview.slice(0, 5).map((r) => (
                <Link
                  key={r.driverId}
                  href={`/drivers/${r.driverId}`}
                  className="flex cursor-pointer items-center justify-between rounded border border-slate-200 px-3 py-2 text-sm transition hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-900">{r.driverName}</span>
                  <span className="inline-flex items-center gap-2 font-semibold capitalize">
                    <span className={`h-2.5 w-2.5 rounded-full ${riskTone(r.riskLevel)}`} />
                    {r.riskLevel}
                    <span className="text-xs text-gray-500 ml-2">({r.accidentCount} accidents)</span>
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function KpiCard({ item, onClick }: { item: KpiTile; onClick: () => void }) {
  return (
    <button type="button" className="text-left" onClick={onClick}>
      <Card className="cursor-pointer rounded-lg shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
        <CardContent className="p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">{item.label}</p>
          <div className="mt-1 flex items-center justify-between">
            <p className="text-xl font-bold text-slate-900">{item.value}</p>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600">
              View
              <ChevronRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="rounded-lg shadow-sm">
      <CardContent className="p-3">
        <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
      </CardContent>
    </Card>
  );
}

function RevenueCard({ title, value }: { title: string; value: string }) {
  return (
    <Card className="rounded-lg">
      <CardContent className="p-3">
        <p className="text-xs uppercase tracking-wide text-slate-500">{title}</p>
        <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
      </CardContent>
    </Card>
  );
}
