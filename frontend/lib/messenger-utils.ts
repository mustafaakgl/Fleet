import type {
  ConversationDetail,
  ConversationListItem,
  MessengerDepartment,
  MessengerLanguage,
  MessengerMessage,
} from '@/lib/types';

export function formatMessengerDateTime(value: string | null | undefined, locale: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

export function formatMessengerRelativeTime(value: string | null | undefined, locale: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60_000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (Math.abs(diffMinutes) < 60) return rtf.format(diffMinutes, 'minute');
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return rtf.format(diffHours, 'hour');
  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 7) return rtf.format(diffDays, 'day');
  return formatMessengerDateTime(value, locale);
}

export function conversationTitle(conversation: ConversationListItem | ConversationDetail): string {
  const driverName = `${conversation.driver.firstName} ${conversation.driver.lastName}`.trim();
  return conversation.subject?.trim() ? `${driverName} · ${conversation.subject}` : driverName;
}

export function driverDisplayName(conversation: ConversationListItem | ConversationDetail): string {
  return `${conversation.driver.firstName} ${conversation.driver.lastName}`.trim();
}

export function personInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

export const DRIVER_MESSAGE_AUDIENCES = ['dispatch', 'accounting', 'general'] as const satisfies readonly MessengerDepartment[];

export type DriverMessageAudience = (typeof DRIVER_MESSAGE_AUDIENCES)[number];

export function driverMessageAudienceLabelKey(department: DriverMessageAudience): string {
  switch (department) {
    case 'dispatch':
      return 'driverPortal.messages.audience.office';
    case 'accounting':
      return 'driverPortal.messages.audience.accounting';
    case 'general':
    default:
      return 'driverPortal.messages.audience.all';
  }
}

export function departmentBadgeClass(department?: MessengerDepartment): string {
  switch (department) {
    case 'dispatch':
      return 'bg-[#e8f0f8] text-[#1a4d7a]';
    case 'hr':
      return 'bg-violet-50 text-violet-700';
    case 'accounting':
      return 'bg-emerald-50 text-emerald-700';
    case 'maintenance':
      return 'bg-orange-50 text-orange-700';
    case 'general':
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

export type MessageDayGroup = {
  key: string;
  label: string;
  messages: MessengerMessage[];
};

export function groupMessagesByDay(
  messages: MessengerMessage[],
  labels: { today: string; yesterday: string },
  locale: string,
): MessageDayGroup[] {
  const groups: MessageDayGroup[] = [];
  const formatter = new Intl.DateTimeFormat(locale, { dateStyle: 'long' });

  for (const message of messages) {
    const date = new Date(message.createdAt);
    const dayKey = Number.isNaN(date.getTime())
      ? 'unknown'
      : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    let label = formatter.format(date);
    if (
      !Number.isNaN(date.getTime()) &&
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    ) {
      label = labels.today;
    } else if (
      !Number.isNaN(date.getTime()) &&
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear()
    ) {
      label = labels.yesterday;
    }

    const existing = groups.find((group) => group.key === dayKey);
    if (existing) {
      existing.messages.push(message);
    } else {
      groups.push({ key: dayKey, label, messages: [message] });
    }
  }

  return groups;
}

export const MESSENGER_LANGUAGES: MessengerLanguage[] = [
  'de',
  'tr',
  'en',
  'pl',
  'nl',
  'it',
  'es',
  'ru',
];

export function resolveDriverLanguageFromConversation(
  conversation: ConversationListItem | ConversationDetail,
): MessengerLanguage | null {
  const fromDriver = conversation.driver.preferredLanguage;
  if (fromDriver && MESSENGER_LANGUAGES.includes(fromDriver)) {
    return fromDriver;
  }

  const driverParticipant = conversation.participants.find((participant) => participant.role === 'driver');
  const fromParticipant = driverParticipant?.user.language;
  if (fromParticipant && MESSENGER_LANGUAGES.includes(fromParticipant as MessengerLanguage)) {
    return fromParticipant as MessengerLanguage;
  }

  return null;
}
