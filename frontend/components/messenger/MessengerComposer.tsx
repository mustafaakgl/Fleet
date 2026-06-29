'use client';

import { Languages, Loader2, Send } from 'lucide-react';
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

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!sending && value.trim()) onSend();
    }
  }

  return (
    <div className="border-t border-slate-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
          {t('messenger.languageSettings')}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <Select
            value={originalLanguage}
            onChange={(event) => onOriginalLanguageChange(event.target.value as MessengerLanguage)}
            disabled={sending}
            className={cn('h-8 min-w-[5.5rem] text-[12px]', FLEET_FILTER_SELECT, BRAND_FOCUS)}
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
              'inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 text-[12px] text-slate-700',
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
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          placeholder={t('messenger.messagePlaceholder', { name: driverName ?? '' }).trim()}
          className={cn(
            'min-h-[2.75rem] flex-1 resize-none rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-[13px] text-slate-900 placeholder:text-slate-400',
            BRAND_FOCUS,
          )}
          disabled={sending}
        />
        <Button
          type="button"
          size="icon"
          className={cn('h-10 w-10 shrink-0 rounded-full', BRAND_BTN_PRIMARY)}
          disabled={sending || !value.trim()}
          onClick={onSend}
          aria-label={t('messenger.send')}
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
      <p className="mt-1.5 text-[11px] text-slate-400">{t('messenger.sendHintAutoTranslate')}</p>
    </div>
  );
}
