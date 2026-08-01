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
  /** Sokak aramasi icin zorunlu; bossa arama yapilmaz */
  city?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Alan pasifken gosterilecek ipucu, ornegin "once sehir secin" */
  hint?: string;
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
    if (kind === 'street' && !city?.trim()) return false;
    return value.trim().length >= MIN_CHARS;
  }, [city, disabled, kind, value]);

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

  const showHint = Boolean(hint) && kind === 'street' && !city?.trim();

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Input
          value={value}
          disabled={disabled}
          placeholder={placeholder}
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
          <Loader2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      {showHint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}

      {open && suggestions.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover py-1 shadow-md"
        >
          {suggestions.map((suggestion, index) => (
            <li key={suggestion.id} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                className={`w-full px-3 py-2 text-left text-sm hover:bg-accent ${
                  index === activeIndex ? 'bg-accent' : ''
                }`}
                // onMouseDown: input'un blur olup listeyi kapatmasindan once secim yakalanmali
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(suggestion);
                }}
                onMouseEnter={() => setActiveIndex(index)}
              >
                {suggestion.label}
              </button>
            </li>
          ))}
          <li className="border-t px-3 pt-1 text-[11px] text-muted-foreground">
            {t('address.suggestFooter')}
          </li>
        </ul>
      ) : null}
    </div>
  );
}
