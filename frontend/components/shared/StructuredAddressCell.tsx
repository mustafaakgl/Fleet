'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_ADDRESS_COUNTRY,
  formatStructuredAddress,
  parseFormattedAddress,
  type StructuredAddress,
} from '@/lib/address-format';
import { FLEET_FILTER_INPUT } from '@/lib/fleet-table';
import { cn } from '@/lib/utils';

interface StructuredAddressCellProps {
  value: string;
  onChange: (formatted: string) => void;
  disabled?: boolean;
}

export function StructuredAddressCell({ value, onChange, disabled = false }: StructuredAddressCellProps) {
  const { t } = useTranslation();
  const [parts, setParts] = useState<StructuredAddress>(() => parseFormattedAddress(value));

  useEffect(() => {
    setParts(parseFormattedAddress(value));
  }, [value]);

  function updateField<K extends keyof StructuredAddress>(key: K, nextValue: string) {
    const nextParts = { ...parts, [key]: nextValue };
    setParts(nextParts);
    onChange(formatStructuredAddress(nextParts));
  }

  const inputClass = cn(
    'w-full rounded-md border border-slate-300 bg-white px-2 text-slate-900 disabled:bg-slate-100',
    FLEET_FILTER_INPUT,
  );

  return (
    <div className="space-y-1 min-w-[150px]">
      <input
        value={parts.street}
        disabled={disabled}
        placeholder={t('address.streetShort')}
        onChange={(event) => updateField('street', event.target.value)}
        className={inputClass}
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
    </div>
  );
}
