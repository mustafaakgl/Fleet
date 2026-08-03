'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { routingApi, type AddressSuggestion } from '@/lib/api';

interface AddressSuggestInputProps {
  value: string;
  onValueChange: (next: string) => void;
  onPick: (suggestion: AddressSuggestion) => void;
  kind: 'city' | 'street';
  /** Opsiyonel daraltici; bossa serbest arama yapilir */
  city?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Alan pasifken gosterilecek ipucu, ornegin "sehirle daraltin" */
  hint?: string;
  /** Dar izgara hucreleri kendi giris stilini verir */
  inputClassName?: string;
}

const DEBOUNCE_MS = 400;
const MIN_CHARS = 2;

/**
 * Yazarken adres onerisi gosteren giris alani.
 *
 * Projede hazir bir combobox bilesenci yok ve sirf bunun icin bagimlilik
 * eklemek istemedik; liste burada elle kuruluyor. Klavye destegi bilincli:
 * adres girisi cok tekrarlanan bir is, fareye mecbur birakmak yavaslatir.
 *
 * Oneri servisi coktugunde alan duz metin girisi gibi calismaya devam eder —
 * her adres bulunamiyor ve otomatik tamamlamayi zorunlu kilmak formu kirilgan
 * yapardi.
 */
export function AddressSuggestInput({
  value,
  onValueChange,
  onPick,
  kind,
  city,
  placeholder,
  disabled = false,
  hint,
  inputClassName,
}: AddressSuggestInputProps) {
  const { t } = useTranslation();
  const listId = useId();
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  /** Secim yapildiktan sonra ayni metin icin tekrar arama tetiklenmesin */
  const suppressNextSearch = useRef(false);

  const searchable = useMemo(() => {
    if (disabled) return false;
    return value.trim().length >= MIN_CHARS;
  }, [disabled, value]);

  useEffect(() => {
    if (suppressNextSearch.current) {
      suppressNextSearch.current = false;
      return;
    }
    if (!searchable) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    let cancelled = false;
    const handle = setTimeout(() => {
      setLoading(true);
      routingApi
        .suggest({ q: value.trim(), kind, city: city?.trim() || undefined, limit: 8 })
        .then((response) => {
          if (cancelled) return;
          setSuggestions(response.suggestions);
          setOpen(response.suggestions.length > 0);
          setActiveIndex(-1);
        })
        .catch(() => {
          if (cancelled) return;
          // Sessizce duz metin girisine dus — kullanici yazmaya devam edebilmeli
          setSuggestions([]);
          setOpen(false);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [city, kind, searchable, value]);

  useEffect(() => {
    function onDocumentClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, []);

  function choose(suggestion: AddressSuggestion) {
    suppressNextSearch.current = true;
    setOpen(false);
    setSuggestions([]);
    setActiveIndex(-1);
    onPick(suggestion);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === 'Enter') {
      if (activeIndex >= 0) {
        event.preventDefault();
        choose(suggestions[activeIndex]);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  // Sehir artik zorunlu degil; ipucu yalnizca hic yazilmamisken ve alan bossa
  // gosterilir — "isterseniz sehirle daralt" anlaminda, engel olarak degil.
  const showHint = Boolean(hint) && kind === 'street' && !city?.trim() && value.trim().length === 0;

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Input
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          className={inputClassName}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) setOpen(true);
          }}
        />
        {loading ? (
          <Loader2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-500" />
        ) : null}
      </div>

      {showHint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}

      {open && suggestions.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          // Acik renkler bilincli: `bg-popover` bu projede tanimsiz ve liste
          // seffaf kaliyordu — arkadaki PK/sehir alanlari icinden okunuyordu.
          // min-w: dar izgara hucresinde satirlar sikismasin.
          className="absolute z-50 mt-1 max-h-64 w-full min-w-[260px] divide-y divide-slate-100 overflow-auto rounded-md border border-slate-300 bg-white shadow-lg"
        >
          {suggestions.map((suggestion, index) => {
            const streetLine = [suggestion.street, suggestion.houseNumber]
              .filter(Boolean)
              .join(' ');
            // Ikinci satir sehri ve ulkeyi tasir: sehir artik zorunlu olmadigi
            // icin yanlis sehirdeki bir cadde ancak burada ayirt edilebilir.
            const regionLine = [suggestion.postalCode, suggestion.city, suggestion.countryCode]
              .filter(Boolean)
              .join(' · ');

            return (
              <li key={suggestion.id} role="option" aria-selected={index === activeIndex}>
                <button
                  type="button"
                  className={`w-full px-3 py-2 text-left text-sm text-slate-900 hover:bg-slate-100 ${
                    index === activeIndex ? 'bg-slate-100' : 'bg-white'
                  }`}
                  // onMouseDown: input'un blur olup listeyi kapatmasindan once secim yakalanmali
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(suggestion);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium">{streetLine || suggestion.label}</span>
                    {suggestion.source === 'history' ? (
                      <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                        {t('address.fromHistory')}
                      </span>
                    ) : null}
                  </span>
                  {regionLine ? (
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                      {regionLine}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
          <li className="bg-white px-3 py-1.5 text-[11px] text-slate-500">
            {t('address.suggestFooter')}
          </li>
        </ul>
      ) : null}
    </div>
  );
}
