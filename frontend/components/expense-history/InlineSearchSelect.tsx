'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type InlineSearchSelectOption = {
  value: string;
  label: string;
  searchText?: string;
};

type InlineSearchSelectProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: InlineSearchSelectOption[];
  placeholder: string;
  searchPlaceholder?: string;
  disabled?: boolean;
};

export function InlineSearchSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  disabled,
}: InlineSearchSelectProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = options.find((option) => option.value === value);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) =>
      (option.searchText ?? option.label).toLowerCase().includes(needle),
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  return (
    <div className="space-y-2">
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          if (!disabled) setOpen((current) => !current);
        }}
        className={cn(
          'flex h-10 w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-left text-sm',
          'focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <span className={cn('truncate', !selected && 'text-slate-500')}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          className={cn('ml-2 h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && !disabled ? (
        <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-2">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder ?? t('common.search')}
              className="h-8"
              autoFocus
            />
          </div>
          <ul className="max-h-52 overflow-y-auto overscroll-contain py-1" role="listbox">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-500">{t('common.noResults')}</li>
            ) : (
              filtered.map((option) => (
                <li key={option.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={option.value === value}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className={cn(
                      'flex w-full px-3 py-2 text-left text-sm hover:bg-slate-50',
                      option.value === value && 'bg-emerald-50 font-medium text-emerald-800',
                    )}
                  >
                    {option.label}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
