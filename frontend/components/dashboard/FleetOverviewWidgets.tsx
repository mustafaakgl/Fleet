'use client';

import Link from 'next/link';
import { MoreHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { DashboardFleetWidgets } from '@/lib/types';
import { cn } from '@/lib/utils';

type MetricTone = 'red' | 'orange' | 'blue' | 'teal';

interface SplitMetric {
  label: string;
  value: number;
  tone: MetricTone;
  href: string;
}

interface StatusMetric {
  label: string;
  value: number;
  dotClass: string;
  pillClass: string;
  href: string;
}

const METRIC_TONE_CLASS: Record<MetricTone, string> = {
  red: 'text-red-600',
  orange: 'text-orange-500',
  blue: 'text-blue-600',
  teal: 'text-teal-600',
};

function WidgetCard({
  title,
  children,
  loading,
}: {
  title: string;
  children?: React.ReactNode;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <Card className="rounded-lg border-slate-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 px-4 pb-2 pt-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-4 rounded" />
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-lg border-slate-200 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 px-4 pb-2 pt-4">
        <CardTitle className="text-sm font-semibold text-slate-900">{title}</CardTitle>
        <MoreHorizontal className="h-4 w-4 text-slate-400" aria-hidden />
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">{children}</CardContent>
    </Card>
  );
}

function SplitMetricBlock({ left, right }: { left: SplitMetric; right: SplitMetric }) {
  return (
    <div className="grid grid-cols-2 divide-x divide-slate-100">
      {[left, right].map((metric) => (
        <Link
          key={metric.label}
          href={metric.href}
          className="group flex flex-col items-center px-2 py-1 text-center transition hover:bg-slate-50"
        >
          <span
            className={cn(
              'text-3xl font-semibold leading-none transition group-hover:underline',
              METRIC_TONE_CLASS[metric.tone],
            )}
          >
            {metric.value}
          </span>
          <span className="mt-2 text-xs text-slate-500">{metric.label}</span>
        </Link>
      ))}
    </div>
  );
}

function StatusList({ items }: { items: StatusMetric[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label}>
          <Link
            href={item.href}
            className="group flex items-center justify-between rounded-md px-1 py-0.5 transition hover:bg-slate-50"
          >
            <span className="flex items-center gap-2 text-sm text-slate-700">
              <span className={cn('h-2.5 w-2.5 rounded-full', item.dotClass)} aria-hidden />
              {item.label}
            </span>
            <span
              className={cn(
                'min-w-[2rem] rounded-full px-2 py-0.5 text-center text-xs font-semibold',
                item.pillClass,
              )}
            >
              {item.value}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function FleetOverviewWidgets({
  widgets,
  loading,
}: {
  widgets?: DashboardFleetWidgets | null;
  loading?: boolean;
}) {
  const { t } = useTranslation();

  const splitCards: Array<{ id: string; title: string; left: SplitMetric; right: SplitMetric }> =
    widgets
      ? [
          {
            id: 'service-reminders',
            title: t('dashboard.widgets.serviceReminders'),
            left: {
              label: t('dashboard.widgets.overdue'),
              value: widgets.serviceReminders.overdue,
              tone: 'red',
              href: '/reminders/service?tab=overdue',
            },
            right: {
              label: t('dashboard.widgets.dueSoon'),
              value: widgets.serviceReminders.dueSoon,
              tone: 'orange',
              href: '/reminders/service?tab=due_soon',
            },
          },
          {
            id: 'open-issues',
            title: t('dashboard.widgets.openIssues'),
            left: {
              label: t('dashboard.widgets.open'),
              value: widgets.openIssues.open,
              tone: 'orange',
              href: '/accidents?status=reported',
            },
            right: {
              label: t('dashboard.widgets.overdue'),
              value: widgets.openIssues.overdue,
              tone: 'blue',
              href: '/accidents?status=under_review',
            },
          },
          {
            id: 'vehicle-renewals',
            title: t('dashboard.widgets.vehicleRenewals'),
            left: {
              label: t('dashboard.widgets.overdue'),
              value: widgets.vehicleRenewals.overdue,
              tone: 'red',
              href: '/reminders/vehicle?urgency=overdue&status=open',
            },
            right: {
              label: t('dashboard.widgets.dueSoon'),
              value: widgets.vehicleRenewals.dueSoon,
              tone: 'orange',
              href: '/reminders/vehicle?urgency=due_soon&status=open',
            },
          },
          {
            id: 'contact-renewals',
            title: t('dashboard.widgets.contactRenewals'),
            left: {
              label: t('dashboard.widgets.overdue'),
              value: widgets.contactRenewals.overdue,
              tone: 'red',
              href: '/reminders/contact?urgency=overdue&status=open',
            },
            right: {
              label: t('dashboard.widgets.dueSoon'),
              value: widgets.contactRenewals.dueSoon,
              tone: 'orange',
              href: '/reminders/contact?urgency=due_soon&status=open',
            },
          },
          {
            id: 'vehicle-assignments',
            title: t('dashboard.widgets.vehicleAssignments'),
            left: {
              label: t('dashboard.widgets.assigned'),
              value: widgets.vehicleAssignments.assigned,
              tone: 'blue',
              href: '/vehicles/assignments',
            },
            right: {
              label: t('dashboard.widgets.unassigned'),
              value: widgets.vehicleAssignments.unassigned,
              tone: 'orange',
              href: '/vehicles/assignments',
            },
          },
        ]
      : [];

  const statusCards: Array<{ id: string; title: string; items: StatusMetric[] }> = widgets
    ? [
        {
          id: 'incomplete-work-orders',
          title: t('dashboard.widgets.incompleteWorkOrders'),
          items: [
            {
              label: t('dashboard.widgets.open'),
              value: widgets.incompleteWorkOrders.open,
              dotClass: 'bg-teal-500',
              pillClass: 'bg-teal-50 text-teal-700',
              href: '/vehicles?status=maintenance',
            },
            {
              label: t('dashboard.widgets.pending'),
              value: widgets.incompleteWorkOrders.pending,
              dotClass: 'bg-orange-500',
              pillClass: 'bg-orange-50 text-orange-700',
              href: '/vehicles?status=broken',
            },
          ],
        },
        {
          id: 'vehicle-status',
          title: t('dashboard.widgets.vehicleStatus'),
          items: [
            {
              label: t('dashboard.widgets.statusActive'),
              value: widgets.vehicleStatus.active,
              dotClass: 'bg-emerald-500',
              pillClass: 'bg-emerald-50 text-emerald-700',
              href: '/vehicles?status=active',
            },
            {
              label: t('dashboard.widgets.statusInShop'),
              value: widgets.vehicleStatus.maintenance,
              dotClass: 'bg-orange-500',
              pillClass: 'bg-orange-50 text-orange-700',
              href: '/vehicles?status=maintenance',
            },
            {
              label: t('dashboard.widgets.statusInactive'),
              value: widgets.vehicleStatus.inactive,
              dotClass: 'bg-blue-500',
              pillClass: 'bg-blue-50 text-blue-700',
              href: '/vehicles?status=inactive',
            },
            {
              label: t('dashboard.widgets.statusOutOfService'),
              value: widgets.vehicleStatus.broken,
              dotClass: 'bg-red-500',
              pillClass: 'bg-red-50 text-red-700',
              href: '/vehicles?status=broken',
            },
          ],
        },
      ]
    : [];

  const skeletonCount = 7;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-slate-900">{t('dashboard.fleetOverview')}</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {loading
          ? Array.from({ length: skeletonCount }).map((_, index) => (
              <WidgetCard key={`widget-skel-${index}`} title="" loading />
            ))
          : null}
        {!loading &&
          splitCards.map((card) => (
            <WidgetCard key={card.id} title={card.title}>
              <SplitMetricBlock left={card.left} right={card.right} />
            </WidgetCard>
          ))}
        {!loading &&
          statusCards.map((card) => (
            <WidgetCard key={card.id} title={card.title}>
              <StatusList items={card.items} />
            </WidgetCard>
          ))}
      </div>
    </section>
  );
}
