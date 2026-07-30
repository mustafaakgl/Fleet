import type {
  ConversationParticipant,
  ConversationDetail,
  ConversationListItem,
  MessengerDepartment,
  MessengerLanguage,
  MessengerMessage,
  UserRole,
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

export function formatMessengerRelativeTime(
  value: string | null | undefined,
  locale: string,
  labels?: { yesterday: string },
): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const isSameDay =
    date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();

  if (isSameDay) {
    return new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear()
    && date.getMonth() === yesterday.getMonth()
    && date.getDate() === yesterday.getDate();

  if (isYesterday) {
    return labels?.yesterday ?? 'Yesterday';
  }

  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
  }).format(date);
}

export function conversationTitle(conversation: ConversationListItem | ConversationDetail): string {
  const driverName = `${conversation.driver.firstName} ${conversation.driver.lastName}`.trim();
  return conversation.subject?.trim() ? `${driverName} · ${conversation.subject}` : driverName;
}

export function driverDisplayName(conversation: ConversationListItem | ConversationDetail): string {
  return `${conversation.driver.firstName} ${conversation.driver.lastName}`.trim();
}

export type MessengerConversationPersonaFilter = 'all' | 'drivers';

export interface MessengerCounterpartInfo {
  name: string;
  role: UserRole;
}

function otherParticipants(
  conversation: ConversationListItem | ConversationDetail,
  currentUserId: string | null | undefined,
): ConversationParticipant[] {
  return conversation.participants.filter((participant) => participant.userId !== currentUserId);
}

export function getConversationCategory(
  conversation: ConversationListItem | ConversationDetail,
  currentUserId: string | null | undefined,
): MessengerConversationPersonaFilter {
  const hasCustomer = otherParticipants(conversation, currentUserId).some(
    (participant) => participant.role === 'customer',
  );
  return hasCustomer ? 'drivers' : 'drivers';
}

export function shouldShowConversationInMessenger(
  conversation: ConversationListItem | ConversationDetail,
  currentUserId: string | null | undefined,
): boolean {
  return !otherParticipants(conversation, currentUserId).some((participant) => participant.role === 'customer');
}

export function getCounterpartInfo(
  conversation: ConversationListItem | ConversationDetail,
  currentUserId: string | null | undefined,
): MessengerCounterpartInfo {
  const others = otherParticipants(conversation, currentUserId);
  const prioritized = others.find((participant) => participant.role === 'customer')
    ?? others.find((participant) => participant.role === 'driver')
    ?? others[0];

  if (prioritized) {
    return {
      name: prioritized.user.fullName,
      role: prioritized.role,
    };
  }

  return {
    name: driverDisplayName(conversation),
    role: 'driver',
  };
}

export function getConversationSearchText(
  conversation: ConversationListItem,
  currentUserId: string | null | undefined,
): string {
  const counterpart = getCounterpartInfo(conversation, currentUserId);
  return [
    counterpart.name,
    counterpart.role,
    conversation.subject ?? '',
    conversation.driver.employeeNumber ?? '',
    conversation.lastMessage?.originalText ?? '',
    conversation.lastMessage?.translatedText ?? '',
    ...conversation.participants.map((participant) => participant.user.fullName),
  ]
    .join(' ')
    .toLowerCase();
}

export function roleLabelKey(role: UserRole): string {
  switch (role) {
    case 'admin':
      return 'messenger.roles.admin';
    case 'boss':
      return 'messenger.roles.boss';
    case 'accounting':
      return 'messenger.roles.accounting';
    case 'office':
      return 'messenger.roles.office';
    case 'driver':
      return 'messenger.roles.driver';
    case 'customer':
      return 'messenger.roles.customer';
    default:
      return 'messenger.roles.office';
  }
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
  groups: Array<{
    senderUserId: string;
    own: boolean;
    messages: MessengerMessage[];
  }>;
};

function formatDayLabel(date: Date, labels: { today: string; yesterday: string }, locale: string): string {
  const formatter = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (
    date.getDate() === today.getDate()
    && date.getMonth() === today.getMonth()
    && date.getFullYear() === today.getFullYear()
  ) {
    return labels.today;
  }

  if (
    date.getDate() === yesterday.getDate()
    && date.getMonth() === yesterday.getMonth()
    && date.getFullYear() === yesterday.getFullYear()
  ) {
    return labels.yesterday;
  }

  return formatter.format(date);
}

export function groupMessagesByDay(
  messages: MessengerMessage[],
  labels: { today: string; yesterday: string },
  locale: string,
  currentUserId?: string | null,
): MessageDayGroup[] {
  const groups: MessageDayGroup[] = [];

  for (const message of messages) {
    const date = new Date(message.createdAt);
    const dayKey = Number.isNaN(date.getTime())
      ? 'unknown'
      : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const label = Number.isNaN(date.getTime())
      ? labels.today
      : formatDayLabel(date, labels, locale);

    const existing = groups.find((group) => group.key === dayKey);
    if (existing) {
      existing.messages.push(message);
    } else {
      groups.push({ key: dayKey, label, messages: [message], groups: [] });
    }
  }

  for (const group of groups) {
    const mergedGroups: MessageDayGroup['groups'] = [];
    for (const message of group.messages) {
      const own = message.senderUserId === currentUserId;
      const previous = mergedGroups[mergedGroups.length - 1];
      if (previous && previous.senderUserId === message.senderUserId) {
        previous.messages.push(message);
      } else {
        mergedGroups.push({
          senderUserId: message.senderUserId,
          own,
          messages: [message],
        });
      }
    }
    group.groups = mergedGroups;
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

/**
 * Deterministic avatar color from a name/seed, so each person keeps the same
 * color across the app (WhatsApp/Telegram-style scannability). Brand-neutral,
 * accessible palette (all combos pass AA against white text).
 */
const AVATAR_PALETTE: ReadonlyArray<{ bg: string; fg: string }> = [
  { bg: '#1a4d7a', fg: '#ffffff' },
  { bg: '#0e7490', fg: '#ffffff' },
  { bg: '#b45309', fg: '#ffffff' },
  { bg: '#7c3aed', fg: '#ffffff' },
  { bg: '#be123c', fg: '#ffffff' },
  { bg: '#15803d', fg: '#ffffff' },
  { bg: '#4338ca', fg: '#ffffff' },
  { bg: '#0891b2', fg: '#ffffff' },
  { bg: '#a16207', fg: '#ffffff' },
  { bg: '#9333ea', fg: '#ffffff' },
];

export function avatarColor(seed: string | null | undefined): { bg: string; fg: string } {
  const value = (seed ?? '').trim();
  if (!value) return AVATAR_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}
