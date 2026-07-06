'use client';

import { Languages, Loader2, Send } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { BRAND_BTN_PRIMARY, BRAND_FOCUS } from '@/lib/brand-colors';
import { MESSENGER_LANGUAGES } from '@/lib/messenger-utils';
import { FLEET_FILTER_SELECT } from '@/lib/fleet-table';
import { cn } from '@/lib/utils';
import type { MessengerLanguage } from '@/lib/types';

interface MessengerComposerProps {
  value: string;
  originalLanguage: MessengerLanguage;
  driverLanguage: MessengerLanguage | null;
  sending: boolean;
  driverName: string | null;
  onChange: (value: string) => void;
  onOriginalLanguageChange: (language: MessengerLanguage) => void;
  onSend: () => void;
}

export function MessengerComposer({
  value,
  originalLanguage,
  driverLanguage,
  sending,
  driverName,
  onChange,
  onOriginalLanguageChange,
  onSend,
}: MessengerComposerProps) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [bottomInset, setBottomInset] = useState(0);

  const canSend = useMemo(() => !sending && value.trim().length > 0, [sending, value]);

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

  return (
    <div className="border-t border-slate-200 bg-white p-3 pb-3" style={{ paddingBottom: `${12 + bottomInset}px` }}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
          {t('messenger.languageSettings')}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <Select
            value={originalLanguage}
            onChange={(event) => onOriginalLanguageChange(event.target.value as MessengerLanguage)}
            disabled={sending}
            className={cn('min-h-11 min-w-[5.75rem] text-[12px]', FLEET_FILTER_SELECT, BRAND_FOCUS)}
            aria-label={t('messenger.originalPrefix')}
          >
            {MESSENGER_LANGUAGES.map((lang) => (
              <option key={`orig-${lang}`} value={lang}>
                {lang.toUpperCase()}
              </option>
            ))}
          </Select>
          <span className="text-[12px] text-slate-400">→</span>
          <span
            className={cn(
              'inline-flex min-h-11 items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 text-[12px] text-slate-700',
              !driverLanguage && 'text-slate-400',
            )}
            title={t('messenger.autoTranslateTo')}
          >
            <Languages className="h-3.5 w-3.5 shrink-0 text-brand-primary" aria-hidden />
            {driverLanguage
              ? t('messenger.autoTranslateDriver', { lang: driverLanguage.toUpperCase() })
              : t('messenger.driverLanguageUnknown')}
          </span>
        </div>
      </div>

      <div className="flex items-end gap-2">
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
      <p className="mt-1.5 text-[11px] text-slate-400">
        {isTouchDevice ? t('messenger.sendHintTouch') : t('messenger.sendHintAutoTranslate')}
      </p>
    </div>
  );
}
