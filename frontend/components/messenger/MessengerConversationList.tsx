'use client';

import { Building2, MessageSquare, Plus, Search, Truck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  avatarColor,
  conversationTitle,
  driverDisplayName,
  formatMessengerRelativeTime,
  getCounterpartInfo,
  personInitials,
  roleLabelKey,
  type MessengerConversationPersonaFilter,
} from '@/lib/messenger-utils';
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
  unreadTotal?: number;
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
  unreadTotal = 0,
  onSearchChange,
  onPersonaFilterChange,
  onSelectConversation,
  onCreateConversation,
  previewText,
}: MessengerConversationListProps) {
  const { t, i18n } = useTranslation();

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      {/* Unified navy header band — matches the chat panel header for one cohesive product feel. */}
      <div className="bg-gradient-to-r from-[#0b2342] to-[#1a4d7a] px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-white/90" aria-hidden />
            <h2 className="text-base font-semibold text-white">{t('messenger.title')}</h2>
            {unreadTotal > 0 ? (
              <span className="inline-flex min-w-[1.4rem] items-center justify-center rounded-full bg-white px-1.5 py-0.5 text-[11px] font-bold text-[#1a4d7a]">
                {unreadTotal}
              </span>
            ) : null}
          </div>
          {canCreateConversation ? (
            <Button
              type="button"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-full bg-white/15 text-white hover:bg-white/25"
              onClick={onCreateConversation}
              aria-label={t('messenger.newConversation')}
            >
              <Plus className="h-5 w-5" />
            </Button>
          ) : null}
        </div>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t('messenger.searchPlaceholder')}
            className="min-h-11 rounded-full border-transparent bg-white pl-9 text-slate-900 placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-white/60"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {FILTERS.map((filter) => {
            const active = personaFilter === filter;
            return (
              <button
                key={filter}
                type="button"
                onClick={() => onPersonaFilterChange(filter)}
                aria-pressed={active}
                className={cn(
                  'min-h-11 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[#1a4d7a]',
                  active
                    ? 'border-white bg-white text-[#1a4d7a] shadow-sm'
                    : 'border-white/30 bg-white/10 text-white/85 hover:bg-white/20',
                )}
              >
                {t(`messenger.filters.${filter}`)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-white p-2">
        {loading ? (
          <div className="space-y-2 p-1">
            <Skeleton className="h-18 rounded-2xl" />
            <Skeleton className="h-18 rounded-2xl" />
            <Skeleton className="h-18 rounded-2xl" />
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
          <ul className="space-y-0.5">
            {conversations.map((conversation) => {
              const active = conversation.id === selectedConversationId;
              const counterpart = getCounterpartInfo(conversation, currentUserId);
              const title = conversationTitle(conversation).replace(' · ', ' — ');
              const avatarName = counterpart.name || driverDisplayName(conversation);
              const initials = personInitials(avatarName);
              const color = avatarColor(avatarName);
              const unread = conversation.unreadCount > 0;
              const isCustomer = counterpart.role === 'customer';

              return (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => onSelectConversation(conversation.id)}
                    className={cn(
                      'w-full min-h-16 rounded-xl px-3 py-2.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a4d7a]/35 focus-visible:ring-offset-1',
                      active
                        ? 'bg-[#e8f0f8]'
                        : unread
                          ? 'bg-[#f5f9fd] hover:bg-[#eef4fb]'
                          : 'hover:bg-slate-50',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span className="relative shrink-0">
                        <span
                          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold"
                          style={{ backgroundColor: color.bg, color: color.fg }}
                        >
                          {initials}
                        </span>
                        <span
                          className={cn(
                            'absolute -bottom-0.5 -right-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border-2 border-white',
                            isCustomer ? 'bg-amber-500' : 'bg-[#1a4d7a]',
                          )}
                          aria-hidden
                          title={t(roleLabelKey(counterpart.role))}
                        >
                          {isCustomer ? (
                            <Building2 className="h-2.5 w-2.5 text-white" />
                          ) : (
                            <Truck className="h-2.5 w-2.5 text-white" />
                          )}
                        </span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className={cn('min-w-0 truncate text-sm text-slate-900', unread ? 'font-bold' : 'font-medium')}>
                            {title}
                          </p>
                          <span className={cn('shrink-0 text-[11px]', unread ? 'font-semibold text-[#1a4d7a]' : 'text-slate-400')}>
                            {formatMessengerRelativeTime(conversation.lastMessageAt, i18n.language, {
                              yesterday: t('messenger.yesterdayShort'),
                            })}
                          </span>
                        </div>
                        <div className="mt-1 flex items-end justify-between gap-2">
                          <p className={cn('min-w-0 truncate text-[13px]', unread ? 'font-medium text-slate-700' : 'text-slate-500')}>
                            {previewText(conversation)}
                          </p>
                          {unread ? (
                            <span className="inline-flex min-w-[1.35rem] shrink-0 items-center justify-center rounded-full bg-[#1a4d7a] px-1.5 py-0.5 text-[10px] font-bold text-white">
                              {conversation.unreadCount}
                            </span>
                          ) : null}
                        </div>
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
