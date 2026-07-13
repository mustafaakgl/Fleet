'use client';

import { AlertCircle, Check, ChevronLeft, Languages, Loader2, RotateCcw, UserRound } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { MessengerComposer } from '@/components/messenger/MessengerComposer';
import { getUser } from '@/lib/auth';
import {
  conversationTitle,
  formatMessengerDateTime,
  getCounterpartInfo,
  groupMessagesByDay,
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
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
        <Loader2 className="h-3 w-3 animate-spin" />
      </span>
    );
  }

  if (state === 'error') {
    return (
      <span className="inline-flex items-center gap-2 text-[11px] text-red-600">
        <AlertCircle className="h-3 w-3" />
        <button type="button" className="font-medium underline underline-offset-2" onClick={onRetry}>
          {retryLabel}
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
      <Check className="h-3 w-3" />
    </span>
  );
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

  return (
    <div className={cn('flex gap-3', own ? 'justify-end' : 'justify-start')}>
      {!own ? (
        <div className="flex w-10 shrink-0 justify-center">
          {showAvatar ? (
            <span className="mt-1 inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
              {personInitials(senderLabel)}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className={cn('min-w-0 max-w-[min(88%,42rem)]', own && 'items-end')}>
        {!own && showAvatar ? (
          <p className="mb-1 px-1 text-xs font-medium text-slate-500">{senderLabel}</p>
        ) : null}
        <div
          className={cn(
            'rounded-3xl px-4 py-3 text-sm leading-6 shadow-sm',
            own
              ? 'rounded-br-lg border border-brand-primary/20 bg-slate-50 text-brand-primary'
              : 'rounded-bl-lg border border-slate-200 bg-white text-slate-900',
            message.deliveryState === 'sending' && 'opacity-70',
            message.deliveryState === 'error' && own && 'border border-red-300 bg-red-50 text-red-900',
          )}
        >
          {hasIncomingTranslation ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                  <Languages className="h-3 w-3" />
                  {translationLabel}
                </span>
                <button
                  type="button"
                  className="font-medium text-brand-primary underline-offset-2 hover:underline"
                  onClick={() => setShowOriginal((current) => !current)}
                >
                  {showOriginal ? translatedToggleLabel : originalToggleLabel}
                </button>
              </div>
              <p className="whitespace-pre-wrap break-words">{showOriginal ? message.originalText : message.translatedText}</p>
            </div>
          ) : (
            <p className="whitespace-pre-wrap break-words">{message.originalText}</p>
          )}
          {!own && message.translationStatus === 'failed' ? (
            <p className="mt-2 text-xs text-amber-700">{translatedToggleLabel}</p>
          ) : null}
          {message.attachments.length > 0 ? (
            <div className="mt-3 space-y-2">
              {message.attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className={cn(
                    'rounded-xl border p-2',
                    own ? 'border-brand-primary/15 bg-white' : 'border-slate-200 bg-slate-50',
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
                    <div className="min-w-0">
                      <p className="truncate font-medium">{attachment.fileName}</p>
                      <p className={cn('truncate', own ? 'text-brand-primary/70' : 'text-slate-500')}>
                        {Math.max(1, Math.round(attachment.sizeBytes / 1024))} KB
                      </p>
                    </div>
                    <button
                      type="button"
                      className={cn(
                        'shrink-0 rounded-md px-2 py-1 text-xs font-medium',
                        own ? 'bg-brand-primary text-white hover:bg-brand-secondary' : 'bg-slate-200 text-slate-800 hover:bg-slate-300',
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
        </div>
        <div className={cn('mt-1 flex items-center gap-2 px-1 text-[11px]', own ? 'justify-end' : 'justify-start')}>
          <span className="text-slate-400">{formatMessengerDateTime(message.createdAt, locale)}</span>
          {own ? (
            <DeliveryIndicator state={message.deliveryState ?? 'sent'} retryLabel={retryLabel} onRetry={onRetry} />
          ) : null}
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
  const messageEndRef = useRef<HTMLDivElement | null>(null);
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
    if (loading || loadingOlder) return;
    messageEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [selectedConversationId, loading]);

  useEffect(() => {
    if (loadingOlder || !scrollContainerRef.current) return;
    const node = scrollContainerRef.current;
    const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 160;
    if (nearBottom) {
      messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
      <div className="flex h-full min-h-[420px] flex-col items-center justify-center p-6">
        <EmptyState
          icon={UserRound}
          title={t('messenger.noConversationSelectedTitle')}
          subtitle={t('messenger.noConversationSelectedSubtitle')}
        />
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

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="border-b border-slate-200 bg-white px-4 py-4">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0 xl:hidden"
            onClick={onBack}
            aria-label={t('messenger.backToList')}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-primary text-sm font-semibold text-white">
            {personInitials(counterpart.name)}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-slate-900">
              {conversationTitle(selectedConversation)}
            </h2>
            <p className="mt-0.5 truncate text-sm text-slate-500">
              {counterpart.name} · {t(roleLabelKey(counterpart.role))}
            </p>
          </div>
        </div>
      </div>

      <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto bg-slate-50/80 px-4 py-4">
        <div ref={loadMoreRef} className="flex min-h-8 items-center justify-center">
          {loadingOlder ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
        </div>
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center py-8">
            <EmptyState
              icon={UserRound}
              title={t('messenger.emptyConversationTitle')}
              subtitle={t('messenger.emptyConversationSubtitle')}
            />
          </div>
        ) : (
          <div className="space-y-5">
            {messageGroups.map((group) => (
              <div key={group.key}>
                <div className="mb-4 flex items-center gap-3">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {group.label}
                  </span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>
                <div className="space-y-4">
                  {group.groups.map((senderGroup, groupIndex) => (
                    <div key={`${group.key}-${senderGroup.senderUserId}-${groupIndex}`} className="space-y-1.5">
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
            <div ref={messageEndRef} />
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