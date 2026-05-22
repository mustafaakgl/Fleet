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
import { canViewFinancials } from '@/lib/permissions';
import { getExpiringDocuments } from '@/lib/documents';
import type { AuthUser } from '@/lib/types';

interface CriticalAlert {
  id: string;
  text: string;
  tone: 'warning' | 'critical' | 'info';
  href: string;
}

interface KpiItem {
  id: string;
  label: string;
  value: string;
  href?: string;
  toastOnly?: boolean;
}

interface OperationRow {
  id: string;
  driver: string;
  vehicle: string;
  company: string;
  startTime: string;
  status: 'Active' | 'Away';
}

const criticalAlerts: CriticalAlert[] = [
  { id: 'a1', text: 'AP-101 TUV expires in 7 days', tone: 'warning', href: '/vehicles/veh-001' },
  { id: 'a2', text: 'Thomas Scharein missing handover photo', tone: 'critical', href: '/assignments' },
  { id: 'a3', text: 'Sita Diallo is marked Krank but assigned tomorrow', tone: 'critical', href: '/assignments' },
  { id: 'a4', text: '2 company emails waiting', tone: 'info', href: '/assignments' },
];

const kpiRowOne: KpiItem[] = [
  { id: 'k1', label: 'Active Drivers', value: '48', href: '/drivers?status=active' },
  { id: 'k2', label: 'Drivers on Vacation', value: '3', href: '/assignments?panel=urlaubsplaner&view=abteilungskalender&absence=UT' },
  { id: 'k3', label: 'Sick Drivers', value: '2', href: '/assignments?panel=urlaubsplaner&view=abteilungskalender&absence=KT' },
  { id: 'k4', label: 'Vehicles in Use', value: '31', href: '/vehicles?status=in_use' },
];

const todayOperations: OperationRow[] = [
  { id: 'o1', driver: 'Ilker Cukur', vehicle: 'AP-101', company: 'DHL', startTime: '07:00', status: 'Active' },
  { id: 'o2', driver: 'Thomas Scharein', vehicle: 'AP-102', company: 'Amazon', startTime: '06:30', status: 'Active' },
  { id: 'o3', driver: 'Sita Diallo', vehicle: '-', company: 'Urlaub', startTime: '-', status: 'Away' },
  { id: 'o4', driver: 'Andrii Dudiak', vehicle: '-', company: 'Krank', startTime: '-', status: 'Away' },
];

const cityFleet = [
  { city: 'Berlin', value: 12 },
  { city: 'Hamburg', value: 8 },
  { city: 'Munchen', value: 4 },
  { city: 'Leipzig', value: 3 },
  { city: 'Frankfurt', value: 4 },
];

function alertClass(tone: CriticalAlert['tone']) {
  if (tone === 'critical') return 'border-red-300 bg-red-50 text-red-800';
  if (tone === 'warning') return 'border-yellow-300 bg-yellow-50 text-yellow-800';
  return 'border-blue-300 bg-blue-50 text-blue-800';
}

export default function DashboardPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [user] = useState<AuthUser | null>(() => getUser());
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timeout = window.setTimeout(() => setIsLoading(false), 500);
    return () => window.clearTimeout(timeout);
  }, []);

  const showFinancials = user ? canViewFinancials(user.role) : false;
  const expiringDocumentCount = getExpiringDocuments(90).length;
  const kpiRowTwo: KpiItem[] = [
    { id: 'k5', label: t('dashboard.openAccidents'), value: '1', href: '/requests?type=Unfall%20melden' },
    { id: 'k6', label: t('dashboard.cargoDamages'), value: '2', href: '/cargo-damage?status=pending,under_review' },
    { id: 'k7', label: t('dashboard.expiringDocuments'), value: String(expiringDocumentCount), href: '/documents?status=expiring_soon,expired' },
    { id: 'k8', label: t('dashboard.unsentCompanyEmails'), value: '3', href: '/assignments?panel=company_notifications&view=company-notifications' },
  ];

  const kpiRowOneLocalized: KpiItem[] = [
    { ...kpiRowOne[0], label: t('dashboard.activeDrivers') },
    { ...kpiRowOne[1], label: t('dashboard.driversVacation') },
    { ...kpiRowOne[2], label: t('dashboard.sickDrivers') },
    { ...kpiRowOne[3], label: t('dashboard.vehiclesInUse') },
  ];

  function openKpi(item: KpiItem) {
    setToastMessage('Opening related page...');
    if (!item.href || item.toastOnly) {
      window.setTimeout(() => setToastMessage(null), 1200);
      return;
    }

    router.push(item.href);
    window.setTimeout(() => setToastMessage(null), 1200);
  }

  return (
    <div className="space-y-6 bg-white pb-6">
      {toastMessage && (
        <div className="fixed right-4 top-4 z-50 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-lg">
          {toastMessage}
        </div>
      )}

      <div className="sticky top-0 z-20 -mx-1 flex items-center justify-between border-b border-slate-200 bg-white px-1 py-3">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">{t('dashboard.title')}</h1>
        </div>
        <button type="button" className="rounded border border-slate-300 p-2 text-slate-600 hover:bg-slate-50" aria-label="Print dashboard">
          <Printer className="h-4 w-4" />
        </button>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">{t('dashboard.criticalAlerts')}</h2>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {criticalAlerts.map((alert) => (
            <Link key={alert.id} href={alert.href} className={`rounded-lg border px-4 py-3 text-sm shadow-sm transition hover:shadow ${alertClass(alert.tone)}`}>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4" />
                  {alert.text}
                </span>
                <ChevronRight className="h-4 w-4" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">{t('dashboard.kpiCards')}</h2>
        {isLoading ? (
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
          <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {kpiRowOneLocalized.map((item) => (
              <KpiCard key={item.id} item={item} onClick={openKpi} />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {kpiRowTwo.map((item) => (
              <KpiCard key={item.id} item={item} onClick={openKpi} />
            ))}
          </div>
          </>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">{t('dashboard.todayOperations')}</h2>
        <Card>
          {todayOperations.length === 0 ? (
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
                <TableHead>{t('common.status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {todayOperations.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.driver}</TableCell>
                  <TableCell>{row.vehicle}</TableCell>
                  <TableCell>{row.company}</TableCell>
                  <TableCell>{row.startTime}</TableCell>
                  <TableCell>
                    <Badge className={row.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}>
                      {row.status}
                    </Badge>
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
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label={t('dashboard.plannedDrivers')} value="31" />
          <StatCard label={t('dashboard.availableDrivers')} value="36" />
          <StatCard label={t('dashboard.missingAssignments')} value="5" />
          {showFinancials ? <StatCard label={t('dashboard.expectedRevenue')} value="EUR 11,400" /> : <StatCard label={t('dashboard.dispatchReadiness')} value="Ready" />}
        </div>
        <Button asChild>
          <Link href="/assignments?panel=tagesplanung&view=daily-overview">{t('dashboard.openEinsatzplan')}</Link>
        </Button>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">{t('dashboard.vehicleHealth')}</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Link href="/vehicles/veh-001" className="block">
          <Card className="cursor-pointer border-green-200 transition hover:shadow-sm">
            <CardContent className="space-y-1 p-4 text-sm">
              <p className="font-semibold text-slate-900">Vehicle AP-101</p>
              <p className="text-slate-700">TUV: 7 days</p>
              <p className="text-slate-700">SP: 28 days</p>
              <p className="font-medium text-green-700">Status: Active</p>
            </CardContent>
          </Card>
          </Link>
          <Link href="/vehicles/veh-005" className="block">
          <Card className="cursor-pointer border-yellow-200 transition hover:shadow-sm">
            <CardContent className="space-y-1 p-4 text-sm">
              <p className="font-semibold text-slate-900">Vehicle AP-105</p>
              <p className="font-medium text-yellow-700">Service Required</p>
            </CardContent>
          </Card>
          </Link>
          <Link href="/vehicles/veh-002" className="block">
          <Card className="cursor-pointer border-red-200 transition hover:shadow-sm">
            <CardContent className="space-y-1 p-4 text-sm">
              <p className="font-semibold text-slate-900">Vehicle AP-102</p>
              <p className="font-medium text-red-700">Status: In Use</p>
            </CardContent>
          </Card>
          </Link>
        </div>
      </section>

      {showFinancials && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Revenue Analytics</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <RevenuePlaceholder title="Daily Revenue" value="EUR 8,450" />
            <RevenuePlaceholder title="Weekly Revenue" value="EUR 52,000" />
            <RevenuePlaceholder title="Monthly Revenue" value="EUR 214,000" />
            <RevenuePlaceholder title="Revenue by Company" value="Mock Split" />
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Fleet Overview</h2>
        <Card>
          <CardContent className="space-y-4 p-4">
            {cityFleet.length === 0 ? (
              <EmptyState
                icon={TrendingUp}
                title="No fleet data"
                subtitle="No live fleet metrics are available right now."
              />
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
                Map Placeholder - 31 active vehicles
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-5">
              {cityFleet.map((item) => (
                <div key={item.city} className="rounded border border-slate-200 px-3 py-2">
                  <p className="text-slate-600">{item.city}</p>
                  <p className="font-semibold text-slate-900">{item.value}</p>
                </div>
              ))}
            </div>
            <Button asChild variant="outline">
              <Link href="/flottenmonitor?tab=overview">{t('dashboard.openFlottenmonitor')}</Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Driver Risk Overview</h2>
        <Card>
          <CardContent className="space-y-2 p-4">
            <RiskRow driver="Sita Diallo" level="High" tone="red" href="/drivers/sita-diallo" />
            <RiskRow driver="Thomas Scharein" level="Medium" tone="yellow" href="/drivers/thomas-scharein" />
            <RiskRow driver="Ilker Cukur" level="Low" tone="green" href="/drivers/ilker-cukur" />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function KpiCard({ item, onClick }: { item: KpiItem; onClick: (item: KpiItem) => void }) {
  return (
    <button type="button" className="text-left" onClick={() => onClick(item)}>
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

function RevenuePlaceholder({ title, value }: { title: string; value: string }) {
  return (
    <Card className="rounded-lg">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        <div className="h-20 rounded-md border border-dashed border-slate-300 bg-slate-50" />
        <p className="text-sm font-semibold text-slate-800">{value}</p>
      </CardContent>
    </Card>
  );
}

function RiskRow({
  driver,
  level,
  tone,
  href,
}: {
  driver: string;
  level: 'Low' | 'Medium' | 'High';
  tone: 'green' | 'yellow' | 'red';
  href: string;
}) {
  const style = tone === 'green' ? 'text-green-700' : tone === 'yellow' ? 'text-yellow-700' : 'text-red-700';
  const dot = tone === 'green' ? 'bg-green-500' : tone === 'yellow' ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <Link href={href} className="flex cursor-pointer items-center justify-between rounded border border-slate-200 px-3 py-2 text-sm transition hover:bg-slate-50">
      <span className="font-medium text-slate-900">{driver}</span>
      <span className={`inline-flex items-center gap-2 font-semibold ${style}`}>
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        {level}
      </span>
    </Link>
  );
}
