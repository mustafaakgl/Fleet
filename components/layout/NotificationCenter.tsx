'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useFleetData } from '@/context/FleetDataContext';
import { getExpiringDocuments } from '@/lib/documents';
import { getVehicleHandovers } from '@/lib/vehicle-handovers';
import { getCargoDamageReports } from '@/lib/cargo-damage';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

type NotificationType =
  | 'transport_request'
  | 'absence_request'
  | 'missing_handover'
  | 'expiring_document'
  | 'accident'
  | 'cargo_damage'
  | 'company_email';

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

function formatTimeAgo(createdAt: string) {
  const created = parseDate(createdAt);
  if (!created) return createdAt;

  const diffMs = Date.now() - created.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / (1000 * 60)));

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function calculateDaysUntil(dateValue?: string) {
  if (!dateValue) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const diffMs = target.getTime() - today.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function priorityDotClass(priority: NotificationPriority) {
  if (priority === 'critical') return 'bg-red-500';
  if (priority === 'high') return 'bg-orange-500';
  if (priority === 'medium') return 'bg-yellow-500';
  return 'bg-blue-500';
}

export function NotificationCenter() {
  const router = useRouter();
  const { requests, transportRequests, companyEmailDrafts } = useFleetData();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [readIds, setReadIds] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const notifications = useMemo<FleetNotification[]>(() => {
    const base: FleetNotification[] = [];

    const pendingTransport = transportRequests.find((item) => item.status === 'pending');
    if (pendingTransport) {
      const driverName = pendingTransport.driverId
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');

      base.push({
        id: `notif-transport-${pendingTransport.id}`,
        title: `New transport request from ${driverName}`,
        message: `${pendingTransport.companyId} route ${pendingTransport.pickupAddress} -> ${pendingTransport.deliveryAddress}`,
        type: 'transport_request',
        priority: 'high',
        status: 'unread',
        createdAt: pendingTransport.submittedAt,
        relatedPage: '/assignments?panel=tagesplanung&view=daily-overview',
        relatedEntityId: pendingTransport.id,
      });
    }

    const pendingAbsence = requests.find(
      (item) => item.status === 'Pending' && (item.type === 'Krankheit melden' || item.type === 'Urlaub beantragen'),
    );
    if (pendingAbsence) {
      const isSick = pendingAbsence.type === 'Krankheit melden';
      base.push({
        id: `notif-absence-${pendingAbsence.id}`,
        title: `${pendingAbsence.driverName} ${isSick ? 'sick' : 'vacation'} request pending`,
        message: `${pendingAbsence.type} (${pendingAbsence.dateFrom ?? '-'} to ${pendingAbsence.dateTo ?? '-'})`,
        type: 'absence_request',
        priority: isSick ? 'high' : 'medium',
        status: 'unread',
        createdAt: pendingAbsence.submittedAt,
        relatedPage: '/assignments?panel=urlaubsplaner&view=abteilungskalender',
        relatedEntityId: pendingAbsence.id,
      });
    }

    const missingHandover = getVehicleHandovers().find((item) => item.photoRequired && item.photoStatus === 'missing');
    if (missingHandover) {
      const driverName = missingHandover.driverId
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');

      base.push({
        id: `notif-handover-${missingHandover.id}`,
        title: `${driverName} missing handover photo`,
        message: `Vehicle ${missingHandover.vehicleId} pickup requires photo evidence.`,
        type: 'missing_handover',
        priority: 'critical',
        status: 'unread',
        createdAt: `${missingHandover.date} ${missingHandover.time}`,
        relatedPage: '/assignments?panel=tagesplanung&view=vehicle-handovers',
        relatedEntityId: missingHandover.id,
      });
    }

    const expiringDoc = getExpiringDocuments(14)
      .sort((a, b) => (a.expiryDate ?? '').localeCompare(b.expiryDate ?? ''))
      .find((item) => item.ownerType === 'vehicle');

    if (expiringDoc?.expiryDate) {
      const daysLeft = calculateDaysUntil(expiringDoc.expiryDate);
      base.push({
        id: `notif-doc-${expiringDoc.id}`,
        title: `${expiringDoc.ownerId.toUpperCase()} ${expiringDoc.documentType} expires in ${daysLeft ?? '?'} days`,
        message: `${expiringDoc.fileName} requires renewal before expiry.`,
        type: 'expiring_document',
        priority: 'medium',
        status: 'unread',
        createdAt: expiringDoc.uploadedAt,
        relatedPage: '/documents?status=expiring_soon,expired',
        relatedEntityId: expiringDoc.id,
      });
    }

    const openAccident = requests.find((item) => item.status === 'Pending' && item.type === 'Unfall melden');
    if (openAccident) {
      base.push({
        id: `notif-accident-${openAccident.id}`,
        title: 'Open accident report',
        message: `${openAccident.driverName} submitted an accident report waiting for review.`,
        type: 'accident',
        priority: 'critical',
        status: 'unread',
        createdAt: openAccident.submittedAt,
        relatedPage: '/requests?type=Unfall%20melden',
        relatedEntityId: openAccident.id,
      });
    }

    const openCargoDamage = getCargoDamageReports().find(
      (item) => item.status === 'pending' || item.status === 'under_review',
    );
    if (openCargoDamage) {
      base.push({
        id: `notif-cargo-${openCargoDamage.id}`,
        title: `Open cargo damage report for ${openCargoDamage.vehicleId.toUpperCase()}`,
        message: `${openCargoDamage.companyName} case is ${openCargoDamage.status.replace('_', ' ')}.`,
        type: 'cargo_damage',
        priority: openCargoDamage.status === 'pending' ? 'high' : 'medium',
        status: 'unread',
        createdAt: openCargoDamage.createdAt,
        relatedPage: '/cargo-damage?status=pending,under_review',
        relatedEntityId: openCargoDamage.id,
      });
    }

    const unsentCompanyEmail = companyEmailDrafts.find((item) => item.status === 'draft_ready' || item.status === 'needs_review');
    if (unsentCompanyEmail) {
      base.push({
        id: `notif-company-email-${unsentCompanyEmail.id}`,
        title: `${unsentCompanyEmail.companyId} company email not sent`,
        message: `${unsentCompanyEmail.subject || 'Dispatch summary'} is still waiting to be sent.`,
        type: 'company_email',
        priority: 'medium',
        status: 'unread',
        createdAt: unsentCompanyEmail.lastUpdatedAt,
        relatedPage: '/assignments?panel=company_notifications&view=company-notifications',
        relatedEntityId: unsentCompanyEmail.id,
      });
    } else {
      base.push({
        id: 'notif-company-email-fallback',
        title: 'DHL company email not sent',
        message: 'Today dispatch email draft is still pending in Company Notifications.',
        type: 'company_email',
        priority: 'medium',
        status: 'unread',
        createdAt: new Date().toISOString(),
        relatedPage: '/assignments?panel=company_notifications&view=company-notifications',
        relatedEntityId: 'cmp-dhl',
      });
    }

    return base.sort((a, b) => {
      const dateA = parseDate(a.createdAt)?.getTime() ?? 0;
      const dateB = parseDate(b.createdAt)?.getTime() ?? 0;
      return dateB - dateA;
    });
  }, [companyEmailDrafts, requests, transportRequests]);

  const notificationsWithStatus = useMemo(
    () => notifications.map((item) => ({ ...item, status: readIds.includes(item.id) ? 'read' : 'unread' as NotificationStatus })),
    [notifications, readIds],
  );

  const unreadCount = notificationsWithStatus.filter((item) => item.status === 'unread').length;

  useEffect(() => {
    const timeout = window.setTimeout(() => setIsLoading(false), 350);
    return () => window.clearTimeout(timeout);
  }, []);

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
  }

  function handleNotificationClick(notification: FleetNotification) {
    setReadIds((current) => {
      if (current.includes(notification.id)) return current;
      return [...current, notification.id];
    });

    setIsOpen(false);

    if (notification.relatedPage) {
      router.push(notification.relatedPage);
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="relative rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100"
        aria-label="Notifications"
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
            <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
            <button
              type="button"
              onClick={markAllAsRead}
              className="text-xs font-medium text-blue-700 hover:text-blue-800"
            >
              Mark all as read
            </button>
          </div>

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
            ) : notificationsWithStatus.length === 0 ? (
              <div className="p-3">
                <EmptyState
                  icon={Bell}
                  title="No notifications"
                  subtitle="You are all caught up."
                />
              </div>
            ) : (
              notificationsWithStatus.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => handleNotificationClick(notification)}
                  className="w-full border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`mt-0.5 inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full ${priorityDotClass(notification.priority)}`} />
                        <p className="truncate text-sm font-semibold text-slate-900">{notification.title}</p>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-600">{notification.message}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 text-[11px]">
                      <span className="text-slate-500">{formatTimeAgo(notification.createdAt)}</span>
                      <span className={notification.status === 'unread' ? 'font-semibold text-blue-700' : 'text-slate-400'}>
                        {notification.status === 'unread' ? 'Unread' : 'Read'}
                      </span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
