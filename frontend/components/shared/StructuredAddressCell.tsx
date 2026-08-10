'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AddressSuggestInput } from '@/components/shared/AddressSuggestInput';
import {
  DEFAULT_ADDRESS_COUNTRY,
  formatStructuredAddress,
  parseFormattedAddress,
  type StructuredAddress,
} from '@/lib/address-format';
import { routingApi, type AddressSuggestion, type PickedLocation } from '@/lib/api';
import { FLEET_FILTER_INPUT } from '@/lib/fleet-table';
import { cn } from '@/lib/utils';

interface StructuredAddressCellProps {
  value: string;
  onChange: (formatted: string) => void;
  /**
   * Oneri listesinden secilen, koordinati ve kamyon erisimi dogrulanmis Location.
   * Kullanici elle yazmaya donerse null gelir ve sunucu adres metninden
   * cozumlemeye duser.
   */
  onLocationChange?: (location: PickedLocation | null) => void;
  disabled?: boolean;
}

/**
 * Planlama izgarasindaki dar adres hucresi.
 *
 * Cadde alani oneri listesi gosterir; PK / sehir / ulke duz metin kalir cunku
 * secim yapildiginda zaten dolduruluyorlar ve izgarada dort ayri acilir liste
 * satiri okunamaz hale getirirdi.
 */
export function StructuredAddressCell({
  value,
  onChange,
  onLocationChange,
  disabled = false,
}: StructuredAddressCellProps) {
  const { t } = useTranslation();
  const [parts, setParts] = useState<StructuredAddress>(() => parseFormattedAddress(value));
  const [location, setLocation] = useState<PickedLocation | null>(null);
  const [verifying, setVerifying] = useState(false);
  /** Kendi urettigimiz metni geri ayristirmayi engeller (bicimleme kayipli) */
  const lastEmitted = useRef<string | null>(null);

  useEffect(() => {
    if (value === lastEmitted.current) return;
    setParts(parseFormattedAddress(value));
  }, [value]);

  function emit(nextParts: StructuredAddress, nextLocation: PickedLocation | null) {
    const formatted = formatStructuredAddress(nextParts);
    lastEmitted.current = formatted;
    setParts(nextParts);
    onChange(formatted);
    setLocation(nextLocation);
    onLocationChange?.(nextLocation);
  }

  function updateField<K extends keyof StructuredAddress>(key: K, nextValue: string) {
    // Elle degisiklik dogrulamayi gecersiz kilar — rozet yaniltici olmamali
    emit({ ...parts, [key]: nextValue }, null);
  }

  async function onStreetPicked(suggestion: AddressSuggestion) {
    const nextParts: StructuredAddress = {
      ...parts,
      street: [suggestion.street, suggestion.houseNumber].filter(Boolean).join(' '),
      zipCode: suggestion.postalCode ?? parts.zipCode,
      city: suggestion.city ?? parts.city,
      country: parts.country || DEFAULT_ADDRESS_COUNTRY,
    };

    const formatted = formatStructuredAddress(nextParts);
    lastEmitted.current = formatted;
    setParts(nextParts);
    onChange(formatted);

    setVerifying(true);
    try {
      const picked = await routingApi.pick({
        latitude: suggestion.latitude,
        longitude: suggestion.longitude,
        street: suggestion.street ?? undefined,
        houseNumber: suggestion.houseNumber ?? undefined,
        postalCode: suggestion.postalCode ?? undefined,
        city: suggestion.city ?? undefined,
        countryCode: suggestion.countryCode,
      });
      setLocation(picked);
      onLocationChange?.(picked);
    } catch {
      // Dogrulama basarisiz — adres metni yerinde kaliyor, sunucu eski yoldan cozer
      setLocation(null);
      onLocationChange?.(null);
    } finally {
      setVerifying(false);
    }
  }

  const inputClass = cn(
    'w-full rounded-md border border-slate-300 bg-white px-2 text-slate-900 disabled:bg-slate-100',
    FLEET_FILTER_INPUT,
  );

  return (
    <div className="min-w-[150px] space-y-1">
      <AddressSuggestInput
        kind="street"
        city={parts.city}
        country={parts.country || DEFAULT_ADDRESS_COUNTRY}
        value={parts.street}
        disabled={disabled}
        placeholder={t('address.streetShort')}
        inputClassName={inputClass}
        onValueChange={(next) => updateField('street', next)}
        onPick={onStreetPicked}
      />
      <div className="grid grid-cols-2 gap-1">
        <input
          value={parts.zipCode}
          disabled={disabled}
          placeholder={t('address.zipShort')}
          onChange={(event) => updateField('zipCode', event.target.value)}
          className={inputClass}
        />
        <input
          value={parts.city}
          disabled={disabled}
          placeholder={t('address.cityShort')}
          onChange={(event) => updateField('city', event.target.value)}
          className={inputClass}
        />
      </div>
      <input
        value={parts.country || DEFAULT_ADDRESS_COUNTRY}
        disabled={disabled}
        placeholder={t('address.countryShort')}
        onChange={(event) => updateField('country', event.target.value)}
        className={inputClass}
      />

      {verifying ? (
        <p className="flex items-center gap-1 text-[11px] text-slate-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          {t('address.verifying')}
        </p>
      ) : location ? (
        <p
          className={cn(
            'flex items-start gap-1 text-[11px]',
            location.truckAccess === 'reachable'
              ? 'text-emerald-600'
              : location.truckAccess === 'unreachable'
                ? 'text-red-600'
                : 'text-amber-600',
          )}
        >
          {location.truckAccess === 'reachable' ? (
            <CheckCircle2 className="mt-px h-3 w-3 shrink-0" />
          ) : (
            <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
          )}
          <span>
            {location.truckAccess === 'reachable'
              ? t('address.truckAccess.reachable')
              : location.truckAccess === 'unreachable'
                ? t('address.truckAccess.unreachable')
                : t('address.truckAccess.unverified')}
          </span>
        </p>
      ) : null}
    </div>
  );
}
