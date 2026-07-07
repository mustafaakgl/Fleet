'use client';

import { MessageSquare, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  formatMessengerRelativeTime,
  getCounterpartInfo,
  personInitials,
  roleLabelKey,
  type MessengerConversationPersonaFilter,
} from '@/lib/messenger-utils';
import { FLEET_FILTER_INPUT } from '@/lib/fleet-table';
import { cn } from '@/lib/utils';
import type { ConversationListItem } from '@/lib/types';

interface MessengerConversationListProps {
  conversations: ConversationListItem[];
  selectedConversationId: string | null;
  search: string;
  personaFilter: MessengerConversationPersonaFilter;
  currentUserId: string | null;
  loading: boolean;
  canCreateConversation: boolean;
  onSearchChange: (value: string) => void;
  onPersonaFilterChange: (value: MessengerConversationPersonaFilter) => void;
  onSelectConversation: (conversationId: string) => void;
  onCreateConversation?: () => void;
  previewText: (conversation: ConversationListItem) => string;
}

const FILTERS: MessengerConversationPersonaFilter[] = ['all', 'drivers', 'customers'];

export function MessengerConversationList({
  conversations,
  selectedConversationId,
  search,
  personaFilter,
  currentUserId,
  loading,
  canCreateConversation,
  onSearchChange,
  onPersonaFilterChange,
  onSelectConversation,
  onCreateConversation,
  previewText,
}: MessengerConversationListProps) {
  const { t, i18n } = useTranslation();

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="space-y-3 border-b border-slate-200 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">{t('messenger.conversations')}</h2>
            <p className="text-xs text-slate-500">{t('messenger.listSubtitle')}</p>
          </div>
          {canCreateConversation ? (
            <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={onCreateConversation}>
              {t('messenger.newMessageCta')}
            </Button>
          ) : null}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t('messenger.searchPlaceholder')}
            className={cn('min-h-11 pl-9', FLEET_FILTER_INPUT)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((filter) => {
            const active = personaFilter === filter;
            return (
              <button
                key={filter}
                type="button"
                onClick={() => onPersonaFilterChange(filter)}
                aria-pressed={active}
                className={cn(
                  'min-h-11 rounded-full border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 focus-visible:ring-offset-1',
                  active
                    ? 'border-brand-primary bg-brand-primary text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                )}
              >
                {t(`messenger.filters.${filter}`)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="space-y-2 p-1">
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={MessageSquare}
              title={t('messenger.noConversationsTitle')}
              subtitle={t('messenger.noConversationsSubtitle')}
              actionLabel={canCreateConversation && onCreateConversation ? t('messenger.newMessageCta') : undefined}
              onAction={canCreateConversation ? onCreateConversation : undefined}
            />
          </div>
        ) : (
          <ul className="space-y-1.5">
            {conversations.map((conversation) => {
              const active = conversation.id === selectedConversationId;
              const counterpart = getCounterpartInfo(conversation, currentUserId);
              const initials = personInitials(counterpart.name);
              const unread = conversation.unreadCount > 0;

              return (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => onSelectConversation(conversation.id)}
                    className={cn(
                      'w-full min-h-16 rounded-2xl border px-3 py-3 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/35 focus-visible:ring-offset-1',
                      active
                        ? 'border-brand-primary/30 bg-surface shadow-sm ring-1 ring-brand-primary/10'
                        : 'border-transparent hover:border-slate-200 hover:bg-slate-50',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                          active ? 'bg-brand-primary text-white' : 'bg-slate-200 text-slate-700',
                        )}
                      >
                        {initials}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className={cn('truncate text-sm text-slate-900', unread && 'font-bold')}>
                              {counterpart.name}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {t(roleLabelKey(counterpart.role))}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <span className="text-xs text-slate-500">
                              {formatMessengerRelativeTime(conversation.lastMessageAt, i18n.language, {
                                yesterday: t('messenger.yesterdayShort'),
                              })}
                            </span>
                            {unread ? (
                              <span className="inline-flex min-w-[1.35rem] items-center justify-center rounded-full bg-brand-primary px-1.5 py-0.5 text-[10px] font-bold text-white">
                                {conversation.unreadCount}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <p className={cn('mt-2 truncate text-sm text-slate-600', unread && 'font-semibold text-slate-800')}>
                          {previewText(conversation)}
                        </p>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
