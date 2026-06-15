'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useFleetData } from '@/context/FleetDataContext';
import { getUser } from '@/lib/auth';
import { dashboardApi, notificationsApi } from '@/lib/api';
import { canViewCriticalAlerts } from '@/lib/permissions';
import { einsatzplanHref, officeQueueHref } from '@/lib/office-deep-links';
import { criticalAlertHref, storedNotificationIncidentHref } from '@/lib/incident-routes';
import { cn } from '@/lib/utils';
import type { DashboardCriticalAlert } from '@/lib/types';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

type NotificationType =
  | 'transport_request'
  | 'absence_request'
  | 'missing_handover'
  | 'expiring_document'
  | 'expired_document'
  | 'accident'
  | 'cargo_damage'
  | 'company_email'
  | 'other';

type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';
type NotificationStatus = 'unread' | 'read';

interface FleetNotification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  priority: NotificationPriority;
  status: NotificationStatus;
  createdAt: string;
  relatedPage?: string;
  relatedEntityId?: string;
}

function parseDate(value: string) {
  if (!value) return null;
  if (value.includes('T')) {
    const iso = new Date(value);
    if (!Number.isNaN(iso.getTime())) return iso;
  }
  const normalized = value.includes(' ') ? value.replace(' ', 'T') : `${value}T00:00:00`;
  const parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  return null;
}

function formatTimeAgo(createdAt: string, t: (key: string, options?: Record<string, unknown>) => string) {
  const created = parseDate(createdAt);
  if (!created) return createdAt;
  const diffMs = Date.now() - created.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / (1000 * 60)));
  if (diffMinutes < 1) return t('notifications.justNow');
  if (diffMinutes < 60) return t('notifications.minutesAgo', { count: diffMinutes });
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return t('notifications.hoursAgo', { count: diffHours });
  const diffDays = Math.floor(diffHours / 24);
  return t('notifications.daysAgo', { count: diffDays });
}

function priorityDotClass(priority: NotificationPriority) {
  if (priority === 'critical') return 'bg-red-500';
  if (priority === 'high') return 'bg-orange-500';
  if (priority === 'medium') return 'bg-yellow-500';
  return 'bg-blue-500';
}

function mapAlertType(type: string): NotificationType {
  if (type === 'missing_handover_photo') return 'missing_handover';
  if (type === 'expiring_document') return 'expiring_document';
  if (type === 'expired_document') return 'expired_document';
  if (type === 'open_vehicle_accident') return 'accident';
  if (type === 'open_cargo_damage') return 'cargo_damage';
  if (type === 'failed_company_email') return 'company_email';
  return 'other';
}

function mapStoredNotificationType(type: string): NotificationType {
  if (type === 'accident') return 'accident';
  if (type === 'cargo_damage') return 'cargo_damage';
  if (type === 'transport_request') return 'transport_request';
  if (type === 'request') return 'absence_request';
  if (type === 'company_email') return 'company_email';
  if (type === 'document') return 'expiring_document';
  if (type === 'handover') return 'missing_handover';
  return 'other';
}

function storedNotificationRoute(
  type: string,
  relatedEntityType: string | null | undefined,
  relatedEntityId: string | null | undefined,
  office: boolean,
): string | undefined {
  const incidentHref = storedNotificationIncidentHref(type, relatedEntityId);
  if (incidentHref) return incidentHref;
  if (type === 'transport_request' && relatedEntityId) {
    return office
      ? einsatzplanHref({
          office: true,
          tab: 'betrieb',
          view: 'planning',
          transportId: relatedEntityId,
        })
      : '/assignments?panel=tagesplanung&view=planning';
  }
  if (type === 'request') return '/requests';
  if (type === 'company_email') {
    return office
      ? einsatzplanHref({ office: true, tab: 'betrieb', view: 'company-notifications' })
      : '/assignments?panel=company_notifications&view=company-notifications';
  }
  if (relatedEntityType === 'document') return '/documents?status=expiring_soon,expired';
  return undefined;
}

function alertRoute(alert: DashboardCriticalAlert, office = false): string {
  return criticalAlertHref(alert, office);
}

type OfficeNotifFilter = 'all' | 'action' | 'handover' | 'documents' | 'requests';

const ACTION_TYPES: NotificationType[] = [
  'missing_handover',
  'expiring_document',
  'expired_document',
  'accident',
  'cargo_damage',
  'company_email',
];

function matchesOfficeFilter(type: NotificationType, filter: OfficeNotifFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'action') return ACTION_TYPES.includes(type);
  if (filter === 'handover') return type === 'missing_handover';
  if (filter === 'documents') return type === 'expiring_document' || type === 'expired_document';
  if (filter === 'requests') {
    return type === 'transport_request' || type === 'absence_request';
  }
  return true;
}

export function NotificationCenter() {
  const { t } = useTranslation();
  const router = useRouter();
  const { requests, transportRequests, companyEmailDrafts } = useFleetData();
  const [user] = useState(() => getUser());
  const isOffice = user?.role === 'office';
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [alerts, setAlerts] = useState<DashboardCriticalAlert[]>([]);
  const [storedNotifications, setStoredNotifications] = useState<
    Awaited<ReturnType<typeof notificationsApi.list>>
  >([]);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [filter, setFilter] = useState<OfficeNotifFilter>('action');
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const user = getUser();
    if (!user || !canViewCriticalAlerts(user.role)) {
      setAlerts([]);
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    Promise.all([
      dashboardApi.getSummary(),
      notificationsApi.list('unread').catch(() => []),
    ])
      .then(([data, stored]) => {
        if (!cancelled) {
          setAlerts(data.criticalAlerts ?? []);
          setStoredNotifications(stored);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAlerts([]);
          setStoredNotifications([]);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const notifications = useMemo<FleetNotification[]>(() => {
    const base: FleetNotification[] = [];

    for (const n of storedNotifications) {
      base.push({
        id: `db-${n.id}`,
        title: n.title,
        message: n.message,
        type: mapStoredNotificationType(n.type),
        priority: n.priority,
        status: n.status,
        createdAt: n.createdAt,
        relatedPage: storedNotificationRoute(n.type, n.relatedEntityType, n.relatedEntityId, isOffice),
        relatedEntityId: n.relatedEntityId ?? undefined,
      });
    }

    // Backend-driven critical alerts (expired docs, missing handover, open accidents, failed emails)
    for (const a of alerts) {
      base.push({
        id: `alert-${a.id}`,
        title: a.title,
        message: a.message,
        type: mapAlertType(a.type),
        priority: a.priority,
        status: 'unread',
        createdAt: new Date().toISOString(),
        relatedPage: alertRoute(a, isOffice),
        relatedEntityId: a.relatedEntityId,
      });
    }

    // Context-driven: pending transport request
    const pendingTransport = transportRequests.find((item) => item.status === 'pending');
    if (pendingTransport) {
      base.push({
        id: `notif-transport-${pendingTransport.id}`,
        title: t('notifications.newTransport'),
        message: t('notifications.transportMsg', { pickup: pendingTransport.pickupAddress, delivery: pendingTransport.deliveryAddress }),
        type: 'transport_request',
        priority: 'high',
        status: 'unread',
        createdAt: pendingTransport.submittedAt,
        relatedPage: isOffice
          ? einsatzplanHref({
              office: true,
              tab: 'betrieb',
              view: 'planning',
              transportId: pendingTransport.id,
            })
          : '/assignments?panel=tagesplanung&view=planning',
        relatedEntityId: pendingTransport.id,
      });
    }

    // Context-driven: pending absence/sick request
    const pendingAbsence = requests.find(
      (item) =>
        item.status === 'Pending' &&
        (item.type === 'Krankheit melden' || item.type === 'Urlaub beantragen'),
    );
    if (pendingAbsence) {
      const isSick = pendingAbsence.type === 'Krankheit melden';
      base.push({
        id: `notif-absence-${pendingAbsence.id}`,
        title: t('notifications.absencePending', {
          name: pendingAbsence.driverName,
          kind: isSick ? t('notifications.kindSick') : t('notifications.kindVacation'),
        }),
        message: t('notifications.absenceMsg', {
          type: pendingAbsence.type,
          from: pendingAbsence.dateFrom ?? '-',
          to: pendingAbsence.dateTo ?? '-',
        }),
        type: 'absence_request',
        priority: isSick ? 'high' : 'medium',
        status: 'unread',
        createdAt: pendingAbsence.submittedAt,
        relatedPage: isOffice ? '/requests' : '/assignments?panel=urlaubsplaner&view=abteilungskalender',
        relatedEntityId: pendingAbsence.id,
      });
    }

    // Context-driven: unsent company email draft
    const unsentEmail = companyEmailDrafts.find(
      (item) => item.status === 'draft_ready' || item.status === 'needs_review',
    );
    if (unsentEmail) {
      base.push({
        id: `notif-company-email-${unsentEmail.id}`,
        title: t('notifications.companyEmailPending'),
        message: t('notifications.companyEmailMsg', { subject: unsentEmail.subject || t('notifications.dispatchSummary') }),
        type: 'company_email',
        priority: 'medium',
        status: 'unread',
        createdAt: unsentEmail.lastUpdatedAt,
        relatedPage: isOffice
          ? einsatzplanHref({ office: true, tab: 'betrieb', view: 'company-notifications' })
          : '/assignments?panel=company_notifications&view=company-notifications',
        relatedEntityId: unsentEmail.id,
      });
    }

    return base.sort((a, b) => {
      const dateA = parseDate(a.createdAt)?.getTime() ?? 0;
      const dateB = parseDate(b.createdAt)?.getTime() ?? 0;
      return dateB - dateA;
    });
  }, [alerts, companyEmailDrafts, isOffice, requests, storedNotifications, transportRequests, t]);

  const notificationsWithStatus = useMemo(
    () =>
      notifications.map((item) => ({
        ...item,
        status: (readIds.includes(item.id) ? 'read' : 'unread') as NotificationStatus,
      })),
    [notifications, readIds],
  );

  const filteredNotifications = useMemo(() => {
    if (!isOffice || filter === 'all') return notificationsWithStatus;
    return notificationsWithStatus.filter((item) => matchesOfficeFilter(item.type, filter));
  }, [filter, isOffice, notificationsWithStatus]);

  const unreadCount = filteredNotifications.filter((item) => item.status === 'unread').length;

  const officeFilters: { id: OfficeNotifFilter; labelKey: string }[] = [
    { id: 'action', labelKey: 'notifications.filter.action' },
    { id: 'handover', labelKey: 'notifications.filter.handover' },
    { id: 'documents', labelKey: 'notifications.filter.documents' },
    { id: 'requests', labelKey: 'notifications.filter.requests' },
    { id: 'all', labelKey: 'notifications.filter.all' },
  ];

  useEffect(() => {
    if (!isOpen) return;

    function handleOutside(event: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
    };
  }, [isOpen]);

  function markAllAsRead() {
    setReadIds(notifications.map((item) => item.id));
    // Best-effort: also persist read state for backend-stored notifications.
    notificationsApi.markAllRead().catch(() => {
      /* non-blocking: local read state already updated */
    });
  }

  function handleNotificationClick(notification: FleetNotification) {
    setReadIds((current) => {
      if (current.includes(notification.id)) return current;
      return [...current, notification.id];
    });
    if (notification.id.startsWith('db-')) {
      notificationsApi.markRead(notification.id.slice(3)).catch(() => undefined);
      setStoredNotifications((current) => current.filter((item) => `db-${item.id}` !== notification.id));
    }
    setIsOpen(false);
    if (notification.relatedPage) router.push(notification.relatedPage);
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="relative rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100"
        aria-label={t('notifications.ariaBell')}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-[1.1rem] rounded-full bg-red-500 px-1 text-center text-[10px] font-semibold leading-4 text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[360px] rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-900">{t('header.notifications')}</h3>
            <button
              type="button"
              onClick={markAllAsRead}
              className="text-xs font-medium text-blue-700 hover:text-blue-800"
            >
              {t('notifications.markAllRead')}
            </button>
          </div>

          {isOffice ? (
            <div className="flex flex-wrap gap-1 border-b border-slate-100 px-3 py-2">
              {officeFilters.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[11px] font-medium transition',
                    filter === f.id
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  )}
                >
                  {t(f.labelKey)}
                </button>
              ))}
            </div>
          ) : null}

          <div className="max-h-[420px] overflow-y-auto">
            {isLoading ? (
              <div className="space-y-3 p-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={`notif-skeleton-${index}`} className="space-y-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                ))}
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="p-3">
                <EmptyState
                  icon={Bell}
                  title={t('notifications.emptyTitle')}
                  subtitle={t('notifications.emptySubtitle')}
                />
              </div>
            ) : (
              filteredNotifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => handleNotificationClick(notification)}
                  className="w-full border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`mt-0.5 inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full ${priorityDotClass(notification.priority)}`}
                        />
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {notification.title}
                        </p>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                        {notification.message}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 text-[11px]">
                      <span className="text-slate-500">{formatTimeAgo(notification.createdAt, t)}</span>
                      <span
                        className={
                          notification.status === 'unread'
                            ? 'font-semibold text-blue-700'
                            : 'text-slate-400'
                        }
                      >
                        {notification.status === 'unread' ? t('notifications.unread') : t('notifications.read')}
                      </span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          {isOffice ? (
            <div className="border-t border-slate-200 px-4 py-2">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  router.push(officeQueueHref());
                }}
                className="w-full text-center text-xs font-semibold text-blue-700 hover:text-blue-800"
              >
                {t('office.briefing.viewQueue')}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
