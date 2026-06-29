'use client';

import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  conversationTitle,
  departmentBadgeClass,
  driverDisplayName,
  formatMessengerRelativeTime,
  personInitials,
} from '@/lib/messenger-utils';
import { FLEET_FILTER_INPUT, FLEET_FILTER_SELECT } from '@/lib/fleet-table';
import { cn } from '@/lib/utils';
import type { ConversationListItem, MessengerDepartment } from '@/lib/types';
import { MessageSquare } from 'lucide-react';

interface MessengerConversationListProps {
  conversations: ConversationListItem[];
  selectedConversationId: string | null;
  search: string;
  departmentFilter: string;
  loading: boolean;
  onSearchChange: (value: string) => void;
  onDepartmentFilterChange: (value: string) => void;
  onSelectConversation: (conversationId: string) => void;
  previewText: (conversation: ConversationListItem) => string;
}

const DEPARTMENTS: Array<MessengerDepartment | 'all'> = [
  'all',
  'dispatch',
  'hr',
  'accounting',
  'maintenance',
  'general',
];

export function MessengerConversationList({
  conversations,
  selectedConversationId,
  search,
  departmentFilter,
  loading,
  onSearchChange,
  onDepartmentFilterChange,
  onSelectConversation,
  previewText,
}: MessengerConversationListProps) {
  const { t, i18n } = useTranslation();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2.5 border-b border-slate-200 px-4 py-3">
        <h2 className="text-[13px] font-semibold text-slate-900">{t('messenger.conversations')}</h2>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t('messenger.searchPlaceholder')}
            className={cn('pl-9', FLEET_FILTER_INPUT)}
          />
        </div>
        <Select
          value={departmentFilter}
          onChange={(event) => onDepartmentFilterChange(event.target.value)}
          className={cn('w-full', FLEET_FILTER_SELECT)}
        >
          {DEPARTMENTS.map((dept) => (
            <option key={dept} value={dept}>
              {dept === 'all' ? t('messenger.allDepartments') : t(`messenger.dept.${dept}`)}
            </option>
          ))}
        </Select>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="space-y-2 p-1">
            <Skeleton className="h-[4.5rem]" />
            <Skeleton className="h-[4.5rem]" />
            <Skeleton className="h-[4.5rem]" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={MessageSquare}
              title={t('messenger.noConversationsTitle')}
              subtitle={t('messenger.noConversationsSubtitle')}
            />
          </div>
        ) : (
          <ul className="space-y-1">
            {conversations.map((conversation) => {
              const active = conversation.id === selectedConversationId;
              const name = driverDisplayName(conversation);
              const initials = personInitials(name);
              const dept = conversation.department;

              return (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => onSelectConversation(conversation.id)}
                    className={cn(
                      'w-full rounded-lg border px-3 py-2.5 text-left transition-all duration-150',
                      active
                        ? 'border-brand-primary/30 border-l-[3px] border-l-brand-primary bg-surface/80 shadow-sm'
                        : 'border-transparent border-l-[3px] border-l-transparent hover:border-slate-200 hover:bg-slate-50',
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        className={cn(
                          'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                          active ? 'bg-brand-primary text-white' : 'bg-slate-200 text-slate-600',
                        )}
                      >
                        {initials}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="line-clamp-1 text-[13px] font-semibold text-slate-900">
                            {conversationTitle(conversation)}
                          </p>
                          <span className="shrink-0 text-[11px] text-slate-500">
                            {formatMessengerRelativeTime(conversation.lastMessageAt, i18n.language)}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-1 text-[12px] text-slate-600">
                          {conversation.driver.employeeNumber ? (
                            <span className="mr-1.5 font-medium text-slate-500">
                              {conversation.driver.employeeNumber}
                            </span>
                          ) : null}
                          {previewText(conversation)}
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
                          {conversation.unreadCount > 0 ? (
                            <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-brand-primary px-1.5 py-0.5 text-[10px] font-bold text-white">
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
