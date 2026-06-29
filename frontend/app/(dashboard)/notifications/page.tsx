'use client';

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Clock3, Eye, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { notificationsApi } from '@/lib/api';
import { getUser } from '@/lib/auth';
import type { Notification } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

function priorityBadgeClass(priority: Notification['priority']): string {
  switch (priority) {
    case 'critical':
      return 'bg-red-100 text-red-700 border-red-200';
    case 'high':
      return 'bg-orange-100 text-orange-700 border-orange-200';
    case 'medium':
      return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    default:
      return 'bg-blue-100 text-blue-700 border-blue-200';
  }
}

function notificationTypeLabel(type: string): string {
  return type.replace(/_/g, ' ');
}

function formatRelativeTime(value: string): string {
  try {
    return formatDistanceToNow(new Date(value), { addSuffix: true });
  } catch {
    return value;
  }
}

export default function NotificationsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const user = getUser();

  const notificationsQuery = useQuery({
    queryKey: ['notifications', user?.role],
    queryFn: () => notificationsApi.list(),
    enabled: Boolean(user),
    staleTime: 30_000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      ]);
    },
  });

  const notifications = useMemo(() => notificationsQuery.data ?? [], [notificationsQuery.data]);
  const unreadCount = useMemo(
    () => notifications.filter((item) => item.status === 'unread').length,
    [notifications],
  );

  const isAdmin = user?.role === 'admin';

  async function handleNotificationClick(notification: Notification) {
    if (notification.status === 'unread') {
      await markReadMutation.mutateAsync(notification.id);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              <Bell className="h-3.5 w-3.5" />
              {t('header.notifications')}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
              {isAdmin ? 'All notifications' : 'Your notifications'}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              {isAdmin
                ? 'Administrators can review every notification in the tenant.'
                : 'Review your unread items and mark them read as you go.'}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="border-slate-200 bg-white/90">
              <CardContent className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{notifications.length}</p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 bg-white/90">
              <CardContent className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Unread</p>
                <p className="mt-2 text-2xl font-semibold text-blue-700">{unreadCount}</p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 bg-white/90">
              <CardContent className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Role</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{user?.role ?? 'office'}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {notificationsQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={`notification-skeleton-${index}`} className="border-slate-200">
              <CardContent className="space-y-3 p-5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <Card className="border-slate-200">
          <CardContent className="p-0">
            <EmptyState
              icon={Bell}
              title={t('notifications.emptyTitle')}
              subtitle={t('notifications.emptySubtitle')}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => {
            const unread = notification.status === 'unread';

            return (
              <Card
                key={notification.id}
                className={cn(
                  'group cursor-pointer border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
                  unread ? 'border-blue-200 bg-white ring-1 ring-blue-100' : 'border-slate-200 bg-white',
                )}
                onClick={() => void handleNotificationClick(notification)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    void handleNotificationClick(notification);
                  }
                }}
              >
                <CardHeader className="space-y-3 p-5 pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={cn('h-2.5 w-2.5 rounded-full', unread ? 'bg-blue-600' : 'bg-slate-300')} />
                        <CardTitle className="truncate text-base text-slate-900">{notification.title}</CardTitle>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm text-slate-600">{notification.message}</p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Badge className={cn('border text-[11px] font-semibold capitalize', priorityBadgeClass(notification.priority))}>
                        {notification.priority}
                      </Badge>
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                        <Clock3 className="h-3 w-3" />
                        {formatRelativeTime(notification.createdAt)}
                      </span>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="flex flex-wrap items-center gap-2 px-5 pb-5 pt-0">
                  <Badge variant={unread ? 'default' : 'secondary'}>
                    {unread ? t('notifications.unread') : t('notifications.read')}
                  </Badge>
                  <Badge variant="outline" className="capitalize">
                    {notificationTypeLabel(notification.type)}
                  </Badge>
                  {notification.relatedEntityType ? (
                    <Badge variant="outline" className="capitalize">
                      {notification.relatedEntityType.replace(/_/g, ' ')}
                    </Badge>
                  ) : null}
                  {unread ? (
                    <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-blue-700">
                      {markReadMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                      Mark as read
                    </span>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}