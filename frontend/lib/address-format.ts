export interface StructuredAddress {
  street: string;
  zipCode: string;
  city: string;
  country: string;
}

export const DEFAULT_ADDRESS_COUNTRY = 'Deutschland';

export function formatStructuredAddress(parts: Partial<StructuredAddress>): string {
  const street = parts.street?.trim() ?? '';
  const zipCode = parts.zipCode?.trim() ?? '';
  const city = parts.city?.trim() ?? '';
  const country = parts.country?.trim() || DEFAULT_ADDRESS_COUNTRY;
  const locality = [zipCode, city].filter(Boolean).join(' ');
  return [street, locality, country].filter(Boolean).join(', ');
}

export function buildAssignmentRouteName(pickup: string, delivery: string): string {
  const from = pickup.trim();
  const to = delivery.trim();
  if (!from || !to) return '';
  return `${from} → ${to}`;
}

export function parseFormattedAddress(formatted: string): StructuredAddress {
  const trimmed = formatted.trim();
  if (!trimmed) {
    return { street: '', zipCode: '', city: '', country: DEFAULT_ADDRESS_COUNTRY };
  }

  const parts = trimmed.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 1) {
    return { street: parts[0], zipCode: '', city: '', country: DEFAULT_ADDRESS_COUNTRY };
  }

  const country =
    parts.length >= 3 && !/^\d{4,5}\s/.test(parts[parts.length - 1])
      ? parts[parts.length - 1]
      : DEFAULT_ADDRESS_COUNTRY;
  const localityIndex = parts.length >= 3 ? parts.length - 2 : parts.length - 1;
  const locality = parts[localityIndex] ?? '';
  const streetParts = parts.length >= 3 ? parts.slice(0, localityIndex) : [parts[0]];
  const street = streetParts.join(', ').trim();
  const zipMatch = locality.match(/^(\d{4,5})\s+(.+)$/);

  return {
    street: street || (parts.length === 2 ? parts[0] : ''),
    zipCode: zipMatch?.[1] ?? '',
    city: zipMatch?.[2] ?? (zipMatch ? '' : locality),
    country,
  };
}

export function isStructuredAddressComplete(parts: Partial<StructuredAddress>): boolean {
  return Boolean(parts.street?.trim() && parts.zipCode?.trim() && parts.city?.trim());
}
