'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  Building2,
  CalendarCheck2,
  FileText,
  Search,
  Send,
  Truck,
  User,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { searchApi, type SearchResult } from '@/lib/api';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightText(value: string, query: string) {
  if (!query.trim()) return value;
  const regex = new RegExp(`(${escapeRegExp(query)})`, 'ig');
  const parts = value.split(regex);
  return parts.map((part, index) => {
    const isMatch = part.toLowerCase() === query.toLowerCase();
    if (!isMatch) return <span key={`${part}-${index}`}>{part}</span>;
    return (
      <mark key={`${part}-${index}`} className="rounded bg-yellow-200/70 px-0.5 text-inherit">
        {part}
      </mark>
    );
  });
}

function resultIcon(type: SearchResult['type']) {
  if (type === 'driver') return <User className="h-4 w-4 text-blue-600" />;
  if (type === 'vehicle') return <Truck className="h-4 w-4 text-indigo-600" />;
  if (type === 'company') return <Building2 className="h-4 w-4 text-emerald-600" />;
  if (type === 'document') return <FileText className="h-4 w-4 text-amber-600" />;
  if (type === 'assignment') return <CalendarCheck2 className="h-4 w-4 text-slate-700" />;
  return <Send className="h-4 w-4 text-violet-600" />;
}

function resultRoute(result: SearchResult): string | null {
  if (result.type === 'driver') return `/drivers/${result.id}`;
  if (result.type === 'vehicle') return `/vehicles/${result.id}`;
  if (result.type === 'company') return `/companies/${result.id}`;
  if (result.type === 'document') return `/documents`;
  if (result.type === 'assignment') return `/assignments`;
  if (result.type === 'transport_request') return `/assignments?panel=tagesplanung`;
  return null;
}

export function GlobalSearch() {
  const router = useRouter();
  const { t } = useTranslation();
  const typeLabel = (type: SearchResult['type']) => t(`search.type.${type}`);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<SearchResult | null>(null);

  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = window.setTimeout(() => {
      searchApi
        .query(trimmed)
        .then((res) => setResults(res.results ?? []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [trimmed]);

  const visibleResults = useMemo(() => results.slice(0, 10), [results]);

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
    };
  }, []);

  function onInputChange(value: string) {
    setQuery(value);
    setActiveIndex(-1);
    setOpen(value.trim().length >= 2);
  }

  function onSelect(item: SearchResult) {
    setOpen(false);
    if (item.type === 'document' || item.type === 'assignment') {
      setSelectedDetail(item);
      return;
    }
    const route = resultRoute(item);
    if (route) router.push(route);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open || visibleResults.length === 0) {
      if (event.key === 'Escape') setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % visibleResults.length);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((prev) => (prev <= 0 ? visibleResults.length - 1 : prev - 1));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const selected = activeIndex >= 0 ? visibleResults[activeIndex] : visibleResults[0];
      if (selected) onSelect(selected);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <>
      <div className="relative w-full max-w-[420px]" ref={wrapperRef}>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => onInputChange(event.target.value)}
          onFocus={() => {
            if (query.trim().length >= 2) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder={t('search.placeholder')}
          className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-700 outline-none ring-0 placeholder:text-gray-400 focus:border-blue-500"
          aria-label={t('search.placeholder')}
        />

        {open && (
          <div className="absolute right-0 top-full z-50 mt-2 w-full rounded-xl border border-slate-200 bg-white shadow-xl">
            {loading ? (
              <p className="px-3 py-3 text-sm text-slate-500">{t('search.searching')}</p>
            ) : visibleResults.length === 0 ? (
              <p className="px-3 py-3 text-sm text-slate-500">{t('search.noMatches')}</p>
            ) : (
              <ul className="max-h-[420px] overflow-y-auto py-1">
                {visibleResults.map((item, index) => {
                  const active = index === activeIndex;
                  return (
                    <li key={`${item.type}-${item.id}`}>
                      <button
                        type="button"
                        onClick={() => onSelect(item)}
                        className={`flex w-full items-start gap-3 px-3 py-2 text-left ${active ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                      >
                        <span className="mt-1">{resultIcon(item.type)}</span>
                        <span className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {typeLabel(item.type)}
                          </p>
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {highlightText(item.title, query)}
                          </p>
                          <p className="truncate text-xs text-slate-600">
                            {highlightText(item.subtitle, query)}
                          </p>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {selectedDetail && (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelectedDetail(null)} />
          <aside className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
              <h3 className="text-lg font-bold text-slate-900">{t('search.detailTitle', { type: typeLabel(selectedDetail.type) })}</h3>
              <button
                type="button"
                onClick={() => setSelectedDetail(null)}
                className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                aria-label={t('search.openPage')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 px-5 py-4 text-sm">
              <DetailRow label={t('search.rowTitle')} value={selectedDetail.title} />
              <DetailRow label={t('search.rowDetails')} value={selectedDetail.subtitle} />
              <DetailRow label={t('search.rowType')} value={typeLabel(selectedDetail.type)} />
              <DetailRow label={t('search.rowId')} value={selectedDetail.id} />
              <button
                type="button"
                onClick={() => {
                  const route = resultRoute(selectedDetail);
                  if (route) {
                    router.push(route);
                    setSelectedDetail(null);
                  }
                }}
                className="mt-4 inline-flex items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                {t('search.openPage')}
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-slate-100 pb-2 sm:grid-cols-[170px_1fr]">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm text-slate-900">{value}</p>
    </div>
  );
}
