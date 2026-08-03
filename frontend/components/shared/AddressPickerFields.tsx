'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, HelpCircle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AddressSuggestInput } from '@/components/shared/AddressSuggestInput';
import {
  DEFAULT_ADDRESS_COUNTRY,
  formatStructuredAddress,
  parseFormattedAddress,
  type StructuredAddress,
} from '@/lib/address-format';
import { routingApi, type AddressSuggestion, type PickedLocation } from '@/lib/api';

interface AddressPickerFieldsProps {
  label: string;
  value: string;
  onChange: (formatted: string) => void;
  onPartsChange?: (parts: StructuredAddress) => void;
  /**
   * Dogrulanmis Location. Kullanici elle yazmaya donerse null gelir ve sunucu
   * eski (adres metninden cozumleme) yoluna duser.
   */
  onLocationChange?: (location: PickedLocation | null) => void;
  disabled?: boolean;
  className?: string;
}

function TruckAccessBadge({ location }: { location: PickedLocation }) {
  const { t } = useTranslation();

  if (location.truckAccess === 'reachable') {
    return (
      <p className="mt-1 flex items-center gap-1 text-xs text-emerald-600">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {t('address.truckAccess.reachable')}
        {location.truckSnapDistanceM !== null
          ? ` (${Math.round(location.truckSnapDistanceM)} m)`
          : null}
      </p>
    );
  }

  if (location.truckAccess === 'unreachable') {
    return (
      <p className="mt-1 flex items-start gap-1 text-xs text-red-600">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{t('address.truckAccess.unreachable')}</span>
      </p>
    );
  }

  return (
    <p className="mt-1 flex items-start gap-1 text-xs text-amber-600">
      <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{t('address.truckAccess.unverified')}</span>
    </p>
  );
}

/**
 * Sehir ve sokagi oneri listesinden sectiren adres alani.
 *
 * Sira bilincli: once sehir, sonra sokak. Sehirsiz sokak aramasi olculdu ve
 * guvenilir degil — "Bahnhofstr" sehir baglami olmadan Zürich donduruyor.
 *
 * Secim yapildiginda koordinat dogrudan secilen adaydan gelir; sunucu adresi
 * yeniden aramaz. Elle yazmak da calisir: o zaman dogrulama rozeti cikmaz ve
 * sunucu adres metninden cozumlemeye duser.
 */
export function AddressPickerFields({
  label,
  value,
  onChange,
  onPartsChange,
  onLocationChange,
  disabled = false,
  className,
}: AddressPickerFieldsProps) {
  const { t } = useTranslation();
  const [parts, setParts] = useState<StructuredAddress>(() => parseFormattedAddress(value));
  const [location, setLocation] = useState<PickedLocation | null>(null);
  const [verifying, setVerifying] = useState(false);
  /**
   * En son disari verdigimiz bicimlenmis metin.
   *
   * Bicimlendirme/ayristirma gidis-donusu kayipli: sadece sokak doluyken
   * formatStructuredAddress "Duisb, Deutschland" uretiyor ve bunu geri
   * ayristirmak ulkeyi sehir alanina tasiyordu. Kendi urettigimiz degeri
   * yeniden ayristirmayarak dongsuyu kiriyoruz; disaridan gelen degisiklikler
   * (form sifirlama, duzenleme) yine islenir.
   */
  const lastEmitted = useRef<string | null>(null);

  useEffect(() => {
    if (value === lastEmitted.current) {
      return;
    }
    setParts(parseFormattedAddress(value));
  }, [value]);

  function emit(nextParts: StructuredAddress, nextLocation: PickedLocation | null) {
    const formatted = formatStructuredAddress(nextParts);
    lastEmitted.current = formatted;
    setParts(nextParts);
    onChange(formatted);
    onPartsChange?.(nextParts);
    setLocation(nextLocation);
    onLocationChange?.(nextLocation);
  }

  function updateField<K extends keyof StructuredAddress>(key: K, nextValue: string) {
    // Elle degisiklik dogrulamayi gecersiz kilar — rozet yaniltici olmamali
    emit({ ...parts, [key]: nextValue }, null);
  }

  function onCityPicked(suggestion: AddressSuggestion) {
    // Sehir degisince sokak ve posta kodu artik o sehre ait degil
    emit(
      {
        ...parts,
        city: suggestion.city ?? suggestion.label,
        street: '',
        zipCode: '',
        // countryCode ISO kodu ("DE"); bu alan gorunen ad tutuyor ("Deutschland").
        // Kullaniciya "DE" gostermemek icin mevcut deger korunuyor. ISO kod
        // ayrica pick cagrisina gonderiliyor.
        country: parts.country || DEFAULT_ADDRESS_COUNTRY,
      },
      null,
    );
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
    onPartsChange?.(nextParts);

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

  return (
    <div className={className}>
      <Label className="mb-2 block">{label}</Label>
      <div className="space-y-2">
        <AddressSuggestInput
          kind="city"
          value={parts.city}
          disabled={disabled}
          placeholder={t('address.cityPlaceholder')}
          onValueChange={(next) => updateField('city', next)}
          onPick={onCityPicked}
        />

        <AddressSuggestInput
          kind="street"
          city={parts.city}
          value={parts.street}
          disabled={disabled}
          placeholder={t('address.streetPlaceholder')}
          hint={t('address.pickCityFirst')}
          onValueChange={(next) => updateField('street', next)}
          onPick={onStreetPicked}
        />

        <div className="grid grid-cols-2 gap-2">
          <Input
            value={parts.zipCode}
            disabled={disabled}
            placeholder={t('address.zipPlaceholder')}
            onChange={(event) => updateField('zipCode', event.target.value)}
          />
          <Input
            value={parts.country || DEFAULT_ADDRESS_COUNTRY}
            disabled={disabled}
            placeholder={t('address.countryPlaceholder')}
            onChange={(event) => updateField('country', event.target.value)}
          />
        </div>
      </div>

      {verifying ? (
        <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t('address.verifying')}
        </p>
      ) : location ? (
        <TruckAccessBadge location={location} />
      ) : null}
    </div>
  );
}
