'use client';

import { AlertCircle, CheckCheck, ChevronLeft, FileText, Globe, Loader2, MessagesSquare, UserRound } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { MessengerComposer } from '@/components/messenger/MessengerComposer';
import { getUser } from '@/lib/auth';
import {
  avatarColor,
  conversationTitle,
  formatMessengerDateTime,
  getCounterpartInfo,
  groupMessagesByDay,
  MESSENGER_LANGUAGES,
  personInitials,
  resolveDriverLanguageFromConversation,
  roleLabelKey,
} from '@/lib/messenger-utils';
import { cn } from '@/lib/utils';
import type { ConversationDetail, MessengerLanguage, MessengerMessage } from '@/lib/types';

export type MessengerUiMessage = MessengerMessage & {
  deliveryState?: 'sending' | 'sent' | 'error';
  clientId?: string;
  pendingAttachments?: File[];
};

interface MessengerChatPanelProps {
  selectedConversationId: string | null;
  selectedConversation: ConversationDetail | null;
  messages: MessengerUiMessage[];
  loading: boolean;
  loadingOlder: boolean;
  hasOlderMessages: boolean;
  composerText: string;
  composerAttachments: File[];
  uploadProgress?: number | null;
  userLanguage: MessengerLanguage;
  sending: boolean;
  onBack: () => void;
  onComposerChange: (value: string) => void;
  onComposerAttachmentsAdd: (files: FileList | File[]) => void;
  onComposerAttachmentRemove: (index: number) => void;
  onSend: () => void;
  onLoadOlder: () => void;
  onDownloadAttachment?: (attachmentId: string, fileName: string) => void;
  onRetryMessage?: (messageId: string) => void;
}

function DeliveryIndicator({
  state,
  retryLabel,
  onRetry,
}: {
  state: MessengerUiMessage['deliveryState'];
  retryLabel: string;
  onRetry?: () => void;
}) {
  if (state === 'sending') {
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-[#5a7fa3]" aria-hidden />;
  }

  if (state === 'error') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-red-600">
        <AlertCircle className="h-3.5 w-3.5" />
        <button type="button" className="font-medium underline underline-offset-2" onClick={onRetry}>
          {retryLabel}
        </button>
      </span>
    );
  }

  // WhatsApp-style double check, tinted in the brand navy to signal "read".
  return <CheckCheck className="h-4 w-4 text-[#1a4d7a]" aria-hidden />;
}

function MessageBubble({
  message,
  own,
  showAvatar,
  senderLabel,
  locale,
  translationLabel,
  originalToggleLabel,
  translatedToggleLabel,
  downloadAttachmentLabel,
  retryLabel,
  onRetry,
  onDownloadAttachment,
}: {
  message: MessengerUiMessage;
  own: boolean;
  showAvatar: boolean;
  senderLabel: string;
  locale: string;
  translationLabel: string;
  originalToggleLabel: string;
  translatedToggleLabel: string;
  downloadAttachmentLabel: string;
  retryLabel: string;
  onRetry?: () => void;
  onDownloadAttachment?: (attachmentId: string, fileName: string) => void;
}) {
  const [showOriginal, setShowOriginal] = useState(false);
  const hasIncomingTranslation = !own && Boolean(message.translatedText);

  function isImageAttachment(mimeType: string): boolean {
    return mimeType.startsWith('image/');
  }

  const timeLabel = formatMessengerDateTime(message.createdAt, locale);
  const senderColor = avatarColor(senderLabel);

  return (
    <div
      className={cn(
        'flex gap-2 duration-200 animate-in fade-in slide-in-from-bottom-1',
        own ? 'justify-end' : 'justify-start',
      )}
    >
      {!own ? (
        <div className="flex w-8 shrink-0 items-end justify-center">
          {showAvatar ? (
            <span
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold"
              style={{ backgroundColor: senderColor.bg, color: senderColor.fg }}
            >
              {personInitials(senderLabel)}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className={cn('group min-w-0 max-w-[min(82%,34rem)]', own && 'items-end')}>
        <div
          className={cn(
            'relative px-2.5 pt-1.5 pb-1.5 text-[14.5px] leading-[1.35] shadow-[0_1px_0.5px_rgba(11,35,66,0.13)]',
            own
              ? 'rounded-xl rounded-tr-sm bg-[#d4e3f2] text-[#0b2342]'
              : 'rounded-xl rounded-tl-sm bg-white text-slate-900',
            message.deliveryState === 'sending' && 'opacity-80',
            message.deliveryState === 'error' && own && 'bg-red-50 text-red-900',
          )}
        >
          {!own && showAvatar ? (
            <p className="mb-0.5 text-[12.5px] font-semibold" style={{ color: senderColor.bg }}>{senderLabel}</p>
          ) : null}
          {hasIncomingTranslation ? (
            <p className="whitespace-pre-wrap break-words">{showOriginal ? message.originalText : message.translatedText}</p>
          ) : (
            <p className="whitespace-pre-wrap break-words">{message.originalText}</p>
          )}
          {!own && message.translationStatus === 'failed' ? (
            <p className="mt-1.5 text-xs text-amber-700">{translatedToggleLabel}</p>
          ) : null}
          {message.attachments.length > 0 ? (
            <div className="mt-2 space-y-2">
              {message.attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className={cn(
                    'rounded-lg border p-2',
                    own ? 'border-[#1a4d7a]/15 bg-white/70' : 'border-slate-200 bg-slate-50',
                  )}
                >
                  {isImageAttachment(attachment.mimeType) ? (
                    <img
                      src={attachment.downloadUrl}
                      alt={attachment.fileName}
                      className="mb-2 max-h-44 w-full rounded-lg object-cover"
                      loading="lazy"
                    />
                  ) : null}
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <div className="flex min-w-0 items-center gap-2">
                      {!isImageAttachment(attachment.mimeType) ? (
                        <span
                          className={cn(
                            'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                            own ? 'bg-[#1a4d7a]/10 text-[#1a4d7a]' : 'bg-slate-200 text-slate-600',
                          )}
                        >
                          <FileText className="h-4 w-4" />
                        </span>
                      ) : null}
                      <div className="min-w-0">
                        <p className="truncate font-medium">{attachment.fileName}</p>
                        <p className={cn('truncate', own ? 'text-[#1a4d7a]/70' : 'text-slate-500')}>
                          {Math.max(1, Math.round(attachment.sizeBytes / 1024))} KB
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className={cn(
                        'shrink-0 rounded-md px-2 py-1 text-xs font-medium',
                        own ? 'bg-[#1a4d7a] text-white hover:bg-[#0b2342]' : 'bg-slate-200 text-slate-800 hover:bg-slate-300',
                      )}
                      onClick={() => onDownloadAttachment?.(attachment.id, attachment.fileName)}
                    >
                      {downloadAttachmentLabel}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {/* WhatsApp-style meta row inside the bubble: translation toggle (hover) + timestamp + read ticks */}
          <div className={cn('mt-0.5 flex items-center gap-1.5 text-[10.5px]', own ? 'justify-end text-[#3f5a78]' : 'justify-between text-slate-500')}>
            {hasIncomingTranslation ? (
              <button
                type="button"
                onClick={() => setShowOriginal((current) => !current)}
                title={translationLabel}
                className="inline-flex items-center gap-1 rounded-full text-[#1a4d7a] opacity-70 transition-opacity hover:opacity-100 focus:opacity-100 focus:outline-none"
              >
                <Globe className="h-3 w-3" aria-hidden />
                <span className="font-medium underline-offset-2 hover:underline">
                  {showOriginal ? translatedToggleLabel : originalToggleLabel}
                </span>
              </button>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <span>{timeLabel}</span>
            {own ? (
              <DeliveryIndicator state={message.deliveryState ?? 'sent'} retryLabel={retryLabel} onRetry={onRetry} />
            ) : null}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MessengerChatPanel({
  selectedConversationId,
  selectedConversation,
  messages,
  loading,
  loadingOlder,
  hasOlderMessages,
  composerText,
  composerAttachments,
  uploadProgress,
  userLanguage,
  sending,
  onBack,
  onComposerChange,
  onComposerAttachmentsAdd,
  onComposerAttachmentRemove,
  onSend,
  onLoadOlder,
  onDownloadAttachment,
  onRetryMessage,
}: MessengerChatPanelProps) {
  const { t, i18n } = useTranslation();
  const currentUserId = getUser()?.id;
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const loadingOlderRef = useRef(false);
  const previousHeightRef = useRef(0);

  useEffect(() => {
    loadingOlderRef.current = loadingOlder;
  }, [loadingOlder]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting || !hasOlderMessages || loadingOlderRef.current) {
          return;
        }
        previousHeightRef.current = scrollContainerRef.current?.scrollHeight ?? 0;
        onLoadOlder();
      },
      { root: scrollContainerRef.current, rootMargin: '120px 0px 0px 0px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasOlderMessages, onLoadOlder]);

  useEffect(() => {
    if (!loadingOlder || !scrollContainerRef.current) return;
    const node = scrollContainerRef.current;
    const nextHeight = node.scrollHeight;
    const delta = nextHeight - previousHeightRef.current;
    node.scrollTop += delta;
  }, [loadingOlder, messages.length]);

  useEffect(() => {
    if (loadingOlder || !scrollContainerRef.current) return;
    const node = scrollContainerRef.current;
    const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 160;
    if (nearBottom) {
      node.scrollTop = node.scrollHeight;
    }
  }, [loadingOlder, messages]);

  const messageGroups = useMemo(
    () =>
      groupMessagesByDay(
        messages,
        {
          today: t('messenger.today'),
          yesterday: t('messenger.yesterday'),
        },
        i18n.language,
        currentUserId,
      ),
    [messages, t, i18n.language, currentUserId],
  );

  if (!selectedConversationId) {
    return (
      <div
        className="flex h-full min-h-[420px] flex-col items-center justify-center p-8 text-center"
        style={{ backgroundColor: '#e9eef4' }}
      >
        <span className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#0b2342] to-[#1a4d7a] text-white shadow-lg">
          <MessagesSquare className="h-9 w-9" aria-hidden />
        </span>
        <h3 className="mt-5 text-lg font-semibold text-slate-800">
          {t('messenger.noConversationSelectedTitle')}
        </h3>
        <p className="mt-1.5 max-w-sm text-sm leading-6 text-slate-500">
          {t('messenger.noConversationSelectedSubtitle')}
        </p>
        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#1a4d7a]/15 bg-white/80 px-4 py-2 text-[13px] font-medium text-[#1a4d7a] shadow-sm">
          <Globe className="h-4 w-4 shrink-0" aria-hidden />
          <span>
            {MESSENGER_LANGUAGES.length} {t('messenger.languagesAutoTranslate')}
          </span>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col bg-white">
        <div className="border-b border-slate-200 px-4 py-4">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="mt-2 h-4 w-36" />
        </div>
        <div className="flex-1 space-y-4 p-4">
          <Skeleton className="ml-auto h-20 w-2/3 rounded-3xl" />
          <Skeleton className="h-20 w-2/3 rounded-3xl" />
          <Skeleton className="ml-auto h-20 w-1/2 rounded-3xl" />
        </div>
      </div>
    );
  }

  if (!selectedConversation) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={UserRound}
          title={t('messenger.conversationUnavailableTitle')}
          subtitle={t('messenger.conversationUnavailableSubtitle')}
        />
      </div>
    );
  }

  const counterpart = getCounterpartInfo(selectedConversation, currentUserId);
  const driverLanguage = resolveDriverLanguageFromConversation(selectedConversation);
  const headerColor = avatarColor(counterpart.name);
  const translationActive = Boolean(driverLanguage) && driverLanguage !== userLanguage;

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="bg-gradient-to-r from-[#0b2342] to-[#1a4d7a] px-4 py-3">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0 text-white hover:bg-white/15 xl:hidden"
            onClick={onBack}
            aria-label={t('messenger.backToList')}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <span
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ring-2 ring-white/25"
            style={{ backgroundColor: headerColor.bg, color: headerColor.fg }}
          >
            {personInitials(counterpart.name)}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-white">
              {conversationTitle(selectedConversation)}
            </h2>
            <p className="mt-0.5 truncate text-sm text-white/70">
              {counterpart.name} · {t(roleLabelKey(counterpart.role))}
            </p>
          </div>
        </div>
      </div>

      {/* Persistent translation banner — celebrates the multilingual differentiator once, instead of repeating per bubble. */}
      {driverLanguage ? (
        <div className="flex items-center gap-2 border-b border-[#0b2342]/10 bg-[#eaf1f8] px-4 py-1.5 text-[12px] font-medium text-[#1a4d7a]">
          <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {translationActive ? (
            <span>
              {userLanguage.toUpperCase()} ⇄ {driverLanguage.toUpperCase()} · {t('messenger.autoTranslateTo')}
            </span>
          ) : (
            <span>{t('messenger.autoTranslateTo')}</span>
          )}
        </div>
      ) : null}

      <div
        ref={scrollContainerRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
        style={{
          backgroundColor: '#e9eef4',
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 140 140'%3E%3Cg fill='none' stroke='%230b2342' stroke-opacity='0.045' stroke-width='2'%3E%3Ccircle cx='20' cy='20' r='9'/%3E%3Cpath d='M60 18h20M70 8v20'/%3E%3Cpath d='M104 26l10-10M104 16l10 10'/%3E%3Crect x='16' y='64' width='18' height='18' rx='4'/%3E%3Cpath d='M64 74c6-8 18-8 24 0'/%3E%3Ccircle cx='112' cy='74' r='8'/%3E%3Cpath d='M20 112h20M30 102v20'/%3E%3Cpath d='M66 118l8-8 8 8'/%3E%3Ccircle cx='114' cy='114' r='9'/%3E%3C/g%3E%3C/svg%3E\")",
        }}
      >
        <div ref={loadMoreRef} className="flex min-h-8 items-center justify-center">
          {loadingOlder ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
        </div>
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center py-10 text-center">
            <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-white text-[#1a4d7a] shadow-[0_1px_2px_rgba(11,35,66,0.15)]">
              <MessagesSquare className="h-7 w-7" aria-hidden />
            </span>
            <h3 className="mt-4 text-base font-semibold text-slate-700">{t('messenger.emptyConversationTitle')}</h3>
            <p className="mt-1 max-w-xs text-sm text-slate-500">{t('messenger.emptyConversationSubtitle')}</p>
            {driverLanguage ? (
              <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 text-[12px] font-medium text-[#1a4d7a] shadow-sm">
                <Globe className="h-3.5 w-3.5" aria-hidden />
                <span>{t('messenger.autoTranslateTo')}</span>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            {messageGroups.map((group) => (
              <div key={group.key}>
                <div className="sticky top-0 z-10 mb-3 flex justify-center">
                  <span className="shrink-0 rounded-lg bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 shadow-[0_1px_0.5px_rgba(11,35,66,0.13)]">
                    {group.label}
                  </span>
                </div>
                <div className="space-y-2.5">
                  {group.groups.map((senderGroup, groupIndex) => (
                    <div key={`${group.key}-${senderGroup.senderUserId}-${groupIndex}`} className="space-y-1">
                      {senderGroup.messages.map((message, messageIndex) => (
                        <MessageBubble
                          key={message.id}
                          message={message}
                          own={senderGroup.own}
                          showAvatar={messageIndex === 0}
                          senderLabel={message.senderName}
                          locale={i18n.language}
                          translationLabel={t('messenger.translatedFrom', { lang: message.originalLanguage.toUpperCase() })}
                          originalToggleLabel={t('messenger.showOriginal')}
                          translatedToggleLabel={
                            message.translationStatus === 'failed'
                              ? t('messenger.translationFailed')
                              : t('messenger.showTranslation')
                          }
                          downloadAttachmentLabel={t('messenger.downloadAttachment')}
                          retryLabel={t('messenger.retrySend')}
                          onDownloadAttachment={onDownloadAttachment}
                          onRetry={onRetryMessage ? () => onRetryMessage(message.id) : undefined}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <MessengerComposer
        value={composerText}
        attachments={composerAttachments}
        userLanguage={userLanguage}
        driverLanguage={driverLanguage}
        sending={sending}
        uploadProgress={uploadProgress}
        driverName={counterpart.name}
        onChange={onComposerChange}
        onAddAttachments={onComposerAttachmentsAdd}
        onRemoveAttachment={onComposerAttachmentRemove}
        onSend={onSend}
      />
    </div>
  );
}