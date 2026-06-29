'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { messengerApi } from '@/lib/api';
import { getUser } from '@/lib/auth';
import {
  conversationTitle,
  departmentBadgeClass,
  driverDisplayName,
  formatMessengerRelativeTime,
  personInitials,
} from '@/lib/messenger-utils';
import { cn } from '@/lib/utils';
import type { ConversationListItem } from '@/lib/types';

const MAX_ITEMS = 6;

function sortConversations(conversations: ConversationListItem[]): ConversationListItem[] {
  return [...conversations].sort((left, right) => {
    const unreadDiff = (right.unreadCount ?? 0) - (left.unreadCount ?? 0);
    if (unreadDiff !== 0) return unreadDiff;

    const leftTime = left.lastMessageAt ? new Date(left.lastMessageAt).getTime() : 0;
    const rightTime = right.lastMessageAt ? new Date(right.lastMessageAt).getTime() : 0;
    return rightTime - leftTime;
  });
}

function messagePreview(conversation: ConversationListItem): string {
  if (!conversation.lastMessage) return '—';
  return conversation.lastMessage.translatedText ?? conversation.lastMessage.originalText;
}

export function RecentMessagesWidget() {
  const { t, i18n } = useTranslation();
  const hidden = getUser()?.role === 'driver';
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (hidden) return;

    let active = true;
    setLoading(true);
    setError(false);

    Promise.all([messengerApi.listConversations(), messengerApi.getUnreadCount()])
      .then(([list, unread]) => {
        if (!active) return;
        setConversations(sortConversations(list).slice(0, MAX_ITEMS));
        setUnreadTotal(unread.total);
      })
      .catch(() => {
        if (!active) return;
        setError(true);
        setConversations([]);
        setUnreadTotal(0);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [hidden]);

  const hasConversations = conversations.length > 0;

  const subtitle = useMemo(() => {
    if (unreadTotal > 0) {
      return t('dashboard.recentMessages.subtitleUnread', { count: unreadTotal });
    }
    return t('dashboard.recentMessages.subtitle');
  }, [t, unreadTotal]);

  if (hidden) return null;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
        <h2 className="text-base font-semibold text-slate-900 sm:text-lg">
          {t('dashboard.recentMessages.title')}
        </h2>
        {hasConversations ? (
          <Link
            href="/messenger"
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-primary hover:underline"
          >
            {t('dashboard.recentMessages.viewAll')}
            <ChevronRight className="h-4 w-4" />
          </Link>
        ) : null}
      </div>

      <Card className="rounded-lg border-slate-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 px-4 pb-2 pt-4">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <MessageSquare className="h-4 w-4 text-brand-primary" />
            {subtitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : error ? (
            <p className="text-sm text-slate-500">{t('dashboard.recentMessages.unavailable')}</p>
          ) : !hasConversations ? (
            <p className="text-sm text-slate-500">{t('dashboard.recentMessages.empty')}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {conversations.map((conversation) => {
                const name = driverDisplayName(conversation);
                const initials = personInitials(name);
                const dept = conversation.department;
                const unread = conversation.unreadCount > 0;

                return (
                  <li key={conversation.id}>
                    <Link
                      href={`/messenger?conversation=${conversation.id}`}
                      className={cn(
                        'flex items-start gap-3 py-3 transition hover:bg-slate-50',
                        unread && 'bg-surface/40',
                      )}
                    >
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-primary text-xs font-semibold text-white">
                        {initials}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={cn(
                              'truncate text-sm text-slate-900',
                              unread ? 'font-semibold' : 'font-medium',
                            )}
                          >
                            {conversationTitle(conversation)}
                          </p>
                          <span className="shrink-0 text-[11px] text-slate-500">
                            {formatMessengerRelativeTime(conversation.lastMessageAt, i18n.language)}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-1 text-xs text-slate-600">
                          {messagePreview(conversation)}
                        </p>
                        <div className="mt-1.5 flex items-center gap-2">
                          {dept ? (
                            <span
                              className={cn(
                                'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                                departmentBadgeClass(dept),
                              )}
                            >
                              {t(`messenger.dept.${dept}`)}
                            </span>
                          ) : null}
                          {unread ? (
                            <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-brand-primary px-1.5 py-0.5 text-[10px] font-bold text-white">
                              {conversation.unreadCount}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {hasConversations ? (
            <Link
              href="/messenger"
              className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-brand-primary hover:underline"
            >
              <MessageSquare className="h-4 w-4" />
              {t('nav.messenger')}
            </Link>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
