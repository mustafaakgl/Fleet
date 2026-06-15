import type { TFunction } from 'i18next';
import {
  dashboardApi,
  leaveRequestsApi,
  morningCheckinsApi,
  transportRequestsApi,
  vehicleHandoversApi,
} from '@/lib/api';
import type { DashboardCriticalAlert } from '@/lib/types';
import { einsatzplanHref } from './office-deep-links';
import { criticalAlertHref } from './incident-routes';

export type OfficeQueueCategory =
  | 'all'
  | 'alert'
  | 'transport'
  | 'checkin'
  | 'handover'
  | 'request'
  | 'document'
  | 'email';

export type OfficeQueuePriority = 'critical' | 'high' | 'medium' | 'low';

export interface OfficeQueueItem {
  id: string;
  category: Exclude<OfficeQueueCategory, 'all'>;
  priority: OfficeQueuePriority;
  title: string;
  subtitle?: string;
  href: string;
  sortKey: number;
}

function alertPriority(p: DashboardCriticalAlert['priority']): OfficeQueuePriority {
  return p;
}

function alertHref(alert: DashboardCriticalAlert): string {
  return criticalAlertHref(alert, true);
}

function priorityWeight(p: OfficeQueuePriority): number {
  if (p === 'critical') return 0;
  if (p === 'high') return 1;
  if (p === 'medium') return 2;
  return 3;
}

export function sortOfficeQueueItems(items: OfficeQueueItem[]): OfficeQueueItem[] {
  return [...items].sort((a, b) => priorityWeight(a.priority) - priorityWeight(b.priority) || a.sortKey - b.sortKey);
}

export function filterOfficeQueueByCategory(
  items: OfficeQueueItem[],
  category: OfficeQueueCategory,
): OfficeQueueItem[] {
  if (category === 'all') return items;
  return items.filter((item) => item.category === category);
}

export async function fetchOfficeQueueItems(t: TFunction): Promise<OfficeQueueItem[]> {
  const items: OfficeQueueItem[] = [];
  let sort = 0;

  const push = (item: Omit<OfficeQueueItem, 'sortKey'> & { sortKey?: number }) => {
    items.push({ ...item, sortKey: item.sortKey ?? sort++ });
  };

  try {
    const summary = await dashboardApi.getSummary();
    for (const alert of summary.criticalAlerts ?? []) {
      push({
        id: `alert-${alert.id}`,
        category: 'alert',
        priority: alertPriority(alert.priority),
        title: alert.message,
        href: alertHref(alert),
      });
    }
    if (summary.kpis.expiringDocuments > 0) {
      push({
        id: 'kpi-documents',
        category: 'document',
        priority: summary.kpis.expiringDocuments > 3 ? 'high' : 'medium',
        title: t('office.queue.item.expiringDocuments', { count: summary.kpis.expiringDocuments }),
        href: '/documents?status=expiring_soon,expired',
      });
    }
    if (summary.kpis.unsentCompanyEmails > 0) {
      push({
        id: 'kpi-emails',
        category: 'email',
        priority: 'medium',
        title: t('office.queue.item.pendingEmails', { count: summary.kpis.unsentCompanyEmails }),
        href: einsatzplanHref({ office: true, tab: 'betrieb', view: 'company-notifications' }),
      });
    }
    if (summary.tomorrowPlanning.missingAssignments > 0) {
      push({
        id: 'kpi-missing-assignments',
        category: 'alert',
        priority: 'high',
        title: t('office.queue.item.missingTomorrow', {
          count: summary.tomorrowPlanning.missingAssignments,
        }),
        href: einsatzplanHref({ office: true, tab: 'morgen' }),
      });
    }
  } catch {
    // Dashboard slice optional for queue page
  }

  try {
    const transports = await transportRequestsApi.list();
    for (const transport of transports) {
      if (transport.status !== 'pending' && transport.status !== 'needs_review') continue;
      push({
        id: `transport-${transport.id}`,
        category: 'transport',
        priority: transport.status === 'needs_review' ? 'high' : 'medium',
        title: t('office.queue.item.transport', { cargo: transport.cargoName }),
        subtitle: transport.conflictReason ?? undefined,
        href: einsatzplanHref({
          office: true,
          tab: 'betrieb',
          view: 'planning',
          transportId: transport.id,
        }),
      });
    }
  } catch {
    // skip
  }

  try {
    const checkins = await morningCheckinsApi.list({ date: new Date().toISOString().slice(0, 10) });
    for (const c of checkins) {
      if (c.status !== 'waiting_for_review' && c.status !== 'conflict') continue;
      push({
        id: `checkin-${c.id}`,
        category: 'checkin',
        priority: c.status === 'conflict' ? 'high' : 'medium',
        title: t('office.queue.item.checkin', { plate: c.vehicle_plate || '—' }),
        subtitle: c.company_name ?? undefined,
        href: einsatzplanHref({ office: true, tab: 'betrieb', view: 'morning-checkins' }),
      });
    }
  } catch {
    // skip
  }

  try {
    const handovers = await vehicleHandoversApi.list();
    for (const h of handovers) {
      if (h.status !== 'pending') continue;
      const plate = h.vehicle?.plateNumber ?? h.vehicleId;
      push({
        id: `handover-${h.id}`,
        category: 'handover',
        priority: h.photoStatus === 'missing' ? 'high' : 'medium',
        title: t('office.queue.item.handover', { plate }),
        subtitle: h.handoverType,
        href: einsatzplanHref({ office: true, tab: 'betrieb', view: 'vehicle-handovers' }),
      });
    }
  } catch {
    // skip
  }

  try {
    const leave = await leaveRequestsApi.list();
    for (const r of leave) {
      if (r.status !== 'pending' && r.status !== 'needs_review') continue;
      const name = r.driver ? `${r.driver.firstName} ${r.driver.lastName}` : r.driverId;
      push({
        id: `request-${r.id}`,
        category: 'request',
        priority: r.status === 'needs_review' ? 'high' : 'medium',
        title: t('office.queue.item.leave', { name }),
        subtitle: r.type,
        href: '/requests',
      });
    }
  } catch {
    // skip
  }

  return sortOfficeQueueItems(items);
}
