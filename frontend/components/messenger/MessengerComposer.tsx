'use client';

import { Languages, Loader2, Paperclip, Send, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { BRAND_BTN_PRIMARY, BRAND_FOCUS } from '@/lib/brand-colors';
import { cn } from '@/lib/utils';
import type { MessengerLanguage } from '@/lib/types';

interface MessengerComposerProps {
  value: string;
  attachments: File[];
  userLanguage: MessengerLanguage;
  driverLanguage: MessengerLanguage | null;
  sending: boolean;
  uploadProgress?: number | null;
  driverName: string | null;
  onChange: (value: string) => void;
  onAddAttachments: (files: FileList | File[]) => void;
  onRemoveAttachment: (index: number) => void;
  onSend: () => void;
}

export function MessengerComposer({
  value,
  attachments,
  userLanguage,
  driverLanguage,
  sending,
  uploadProgress,
  driverName,
  onChange,
  onAddAttachments,
  onRemoveAttachment,
  onSend,
}: MessengerComposerProps) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [bottomInset, setBottomInset] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  const canSend = useMemo(
    () => !sending && (value.trim().length > 0 || attachments.length > 0),
    [attachments.length, sending, value],
  );

  function formatAttachmentSize(sizeBytes: number): string {
    if (sizeBytes >= 1024 * 1024) {
      return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  }

  useEffect(() => {
    const media = window.matchMedia('(pointer: coarse)');
    const update = () => setIsTouchDevice(media.matches || window.innerWidth < 768);
    update();
    media.addEventListener?.('change', update);
    window.addEventListener('resize', update);
    return () => {
      media.removeEventListener?.('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    const computed = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(computed.lineHeight || '20');
    const borderBox = Number.parseFloat(computed.paddingTop || '0')
      + Number.parseFloat(computed.paddingBottom || '0');
    const maxHeight = lineHeight * 5 + borderBox;
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [value]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const viewport = window.visualViewport;
    const updateInset = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      setBottomInset(inset);
    };

    updateInset();
    viewport.addEventListener('resize', updateInset);
    viewport.addEventListener('scroll', updateInset);
    return () => {
      viewport.removeEventListener('resize', updateInset);
      viewport.removeEventListener('scroll', updateInset);
    };
  }, []);

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!isTouchDevice && event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (canSend) onSend();
    }
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    if (isTouchDevice) {
      return;
    }
    event.preventDefault();
    setDragOver(false);
    if (event.dataTransfer.files?.length) {
      onAddAttachments(event.dataTransfer.files);
    }
  }

  return (
    <div className="border-t border-slate-200 bg-white p-3 pb-3" style={{ paddingBottom: `${12 + bottomInset}px` }}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {driverLanguage ? (
          <span
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-[12px] font-medium text-emerald-800"
            title={t('messenger.autoTranslateTo')}
          >
            <Languages className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {t('messenger.autoTranslateCompact', {
              source: userLanguage.toUpperCase(),
              target: driverLanguage.toUpperCase(),
            })}
          </span>
        ) : (
          <span
            className="inline-flex min-h-11 items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 text-[12px] text-slate-400"
            title={t('messenger.autoTranslateTo')}
          >
            {t('messenger.driverLanguageUnknown')}
          </span>
        )}
      </div>

      {attachments.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((attachment, index) => (
            <span
              key={`${attachment.name}-${attachment.size}-${index}`}
              className="inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700"
            >
              <span className="truncate">{attachment.name}</span>
              <span className="shrink-0 text-slate-500">{formatAttachmentSize(attachment.size)}</span>
              <button
                type="button"
                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200"
                onClick={() => onRemoveAttachment(index)}
                aria-label={t('messenger.removeAttachment')}
                disabled={sending}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        accept="application/pdf,image/jpeg,image/png,image/webp,image/*"
        capture={isTouchDevice ? 'environment' : undefined}
        onChange={(event) => {
          if (event.target.files && event.target.files.length > 0) {
            onAddAttachments(event.target.files);
            event.target.value = '';
          }
        }}
      />

      <div
        className={cn(
          'flex items-end gap-2 rounded-2xl transition-colors',
          dragOver && 'bg-blue-50/70',
        )}
        onDragOver={(event) => {
          if (isTouchDevice) return;
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11 shrink-0 rounded-full"
          onClick={() => fileInputRef.current?.click()}
          aria-label={t('messenger.addAttachment')}
          disabled={sending}
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={t('messenger.messagePlaceholder', { name: driverName ?? '' }).trim()}
          className={cn(
            'min-h-11 flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-[15px] leading-6 text-slate-900 placeholder:text-slate-400',
            BRAND_FOCUS,
          )}
          disabled={sending}
        />
        <Button
          type="button"
          size="icon"
          className={cn('h-11 w-11 shrink-0 rounded-full', BRAND_BTN_PRIMARY)}
          disabled={!canSend}
          onClick={onSend}
          aria-label={t('messenger.send')}
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
      {typeof uploadProgress === 'number' && sending ? (
        <p className="mt-1 text-[11px] text-slate-500">{t('messenger.uploadProgress', { progress: uploadProgress })}</p>
      ) : null}
      <p className="mt-1.5 text-[11px] text-slate-400">
        {isTouchDevice ? t('messenger.sendHintTouch') : t('messenger.sendHintAutoTranslate')}
      </p>
    </div>
  );
}
