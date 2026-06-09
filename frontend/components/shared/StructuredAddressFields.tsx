'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DEFAULT_ADDRESS_COUNTRY,
  formatStructuredAddress,
  parseFormattedAddress,
  type StructuredAddress,
} from '@/lib/address-format';

interface StructuredAddressFieldsProps {
  label: string;
  value: string;
  onChange: (formatted: string) => void;
  onPartsChange?: (parts: StructuredAddress) => void;
  disabled?: boolean;
  className?: string;
}

export function StructuredAddressFields({
  label,
  value,
  onChange,
  onPartsChange,
  disabled = false,
  className,
}: StructuredAddressFieldsProps) {
  const { t } = useTranslation();
  const [parts, setParts] = useState<StructuredAddress>(() => parseFormattedAddress(value));

  useEffect(() => {
    setParts(parseFormattedAddress(value));
  }, [value]);

  function updateField<K extends keyof StructuredAddress>(key: K, nextValue: string) {
    const nextParts = { ...parts, [key]: nextValue };
    setParts(nextParts);
    onChange(formatStructuredAddress(nextParts));
    onPartsChange?.(nextParts);
  }

  return (
    <div className={className}>
      <Label className="mb-2 block">{label}</Label>
      <div className="space-y-2">
        <Input
          value={parts.street}
          disabled={disabled}
          placeholder={t('address.streetPlaceholder')}
          onChange={(event) => updateField('street', event.target.value)}
        />
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={parts.zipCode}
            disabled={disabled}
            placeholder={t('address.zipPlaceholder')}
            onChange={(event) => updateField('zipCode', event.target.value)}
          />
          <Input
            value={parts.city}
            disabled={disabled}
            placeholder={t('address.cityPlaceholder')}
            onChange={(event) => updateField('city', event.target.value)}
          />
        </div>
        <Input
          value={parts.country || DEFAULT_ADDRESS_COUNTRY}
          disabled={disabled}
          placeholder={t('address.countryPlaceholder')}
          onChange={(event) => updateField('country', event.target.value)}
        />
      </div>
    </div>
  );
}
