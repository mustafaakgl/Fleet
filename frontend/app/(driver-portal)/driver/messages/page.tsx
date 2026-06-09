'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DriverPortalShell } from '@/components/driver-portal/DriverPortalShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { messengerApi } from '@/lib/api';
import type { ConversationListItem } from '@/lib/types';

function previewText(item: ConversationListItem): string {
  const msg = item.lastMessage;
  if (!msg) return '';
  return msg.translatedText ?? msg.originalText;
}

export default function DriverMessagesPage() {
  const { t } = useTranslation();
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([messengerApi.listConversations(), messengerApi.getUnreadCount()])
      .then(([rows, unreadCount]) => {
        if (!active) return;
        setConversations(rows);
        setUnread(unreadCount.total);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setConversations([]);
        setError(err instanceof Error ? err.message : t('driverPortal.messages.loadError'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [t]);

  return (
    <DriverPortalShell>
      <Card>
        <CardHeader>
          <CardTitle>{t('driverPortal.messages.title')}</CardTitle>
          <p className="text-sm text-slate-600">
            {t('driverPortal.messages.subtitle', { count: unread })}
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('driverPortal.assignments.loading')}
            </div>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : conversations.length === 0 ? (
            <p className="py-6 text-sm text-slate-500">{t('driverPortal.messages.empty')}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <Link
                    href={`/driver/messages/${conversation.id}`}
                    className="flex items-start justify-between gap-3 py-3 hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">
                        {conversation.subject ??
                          `${conversation.driver.firstName} ${conversation.driver.lastName}`.trim()}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">
                        {previewText(conversation)}
                      </p>
                      {conversation.unreadCount > 0 ? (
                        <span className="mt-1 inline-block rounded-full bg-[#1a4d7a] px-2 py-0.5 text-[10px] font-semibold text-white">
                          {conversation.unreadCount}
                        </span>
                      ) : null}
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </DriverPortalShell>
  );
}
