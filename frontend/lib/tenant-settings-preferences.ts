const STORAGE_PREFIX = 'operion-tenant-settings';

export type TimeFormat = '12' | '24';
export type UsageUnit = 'miles' | 'kilometers' | 'hours';
export type FuelVolumeUnit = 'gallons_us' | 'gallons_uk' | 'liters';
export type MeasurementSystem = 'imperial' | 'metric';
export type VehicleSystemLabel = 'vehicle' | 'asset';
export type TaxType = '' | 'percentage' | 'fixed';

export type PremiumFeatureKey =
  | 'tireReadings'
  | 'bulkManageParts'
  | 'purchaseOrders'
  | 'warranties'
  | 'advancedAnalytics';

export type TenantSettingsPreferences = {
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  industry?: string;
  currency?: string;
  shortDateFormat?: string;
  timeZone?: string;
  timeFormat?: TimeFormat;
  usageUnit?: UsageUnit;
  fuelVolumeUnit?: FuelVolumeUnit;
  measurementSystem?: MeasurementSystem;
  vehicleSystemLabel?: VehicleSystemLabel;
  taxFreeLabor?: boolean;
  secondaryTax?: boolean;
  defaultTax1?: string;
  defaultTax2?: string;
  defaultTaxType?: TaxType;
  hidePremiumFeatures?: boolean;
  premiumFeatures?: Partial<Record<PremiumFeatureKey, boolean>>;
  logoDataUrl?: string;
};

export const DEFAULT_PREMIUM_FEATURES: Record<PremiumFeatureKey, boolean> = {
  tireReadings: true,
  bulkManageParts: true,
  purchaseOrders: true,
  warranties: true,
  advancedAnalytics: true,
};

export const DEFAULT_PREFERENCES: TenantSettingsPreferences = {
  country: 'DE',
  industry: 'transportation_logistics',
  currency: 'EUR',
  shortDateFormat: 'DD.MM.YYYY',
  timeZone: 'Europe/Berlin',
  timeFormat: '24',
  usageUnit: 'kilometers',
  fuelVolumeUnit: 'liters',
  measurementSystem: 'metric',
  vehicleSystemLabel: 'vehicle',
  taxFreeLabor: false,
  secondaryTax: false,
  defaultTax1: '',
  defaultTax2: '',
  defaultTaxType: '',
  hidePremiumFeatures: false,
  premiumFeatures: { ...DEFAULT_PREMIUM_FEATURES },
};

function storageKey(tenantId: string) {
  return `${STORAGE_PREFIX}:${tenantId}`;
}

export function loadTenantSettingsPreferences(tenantId: string): TenantSettingsPreferences {
  if (typeof window === 'undefined') return { ...DEFAULT_PREFERENCES };

  try {
    const raw = localStorage.getItem(storageKey(tenantId));
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const parsed = JSON.parse(raw) as TenantSettingsPreferences;
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      premiumFeatures: {
        ...DEFAULT_PREMIUM_FEATURES,
        ...(parsed.premiumFeatures ?? {}),
      },
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function saveTenantSettingsPreferences(tenantId: string, prefs: TenantSettingsPreferences) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(storageKey(tenantId), JSON.stringify(prefs));
}

export function buildTenantAddress(prefs: TenantSettingsPreferences) {
  const parts = [
    prefs.addressLine1?.trim(),
    prefs.addressLine2?.trim(),
    [prefs.zip?.trim(), prefs.city?.trim()].filter(Boolean).join(' '),
    prefs.state?.trim(),
    prefs.country?.trim(),
  ].filter(Boolean);

  return parts.join(', ');
}

export function splitTenantAddress(address: string | undefined | null): Pick<
  TenantSettingsPreferences,
  'addressLine1' | 'city' | 'state' | 'zip' | 'country'
> {
  if (!address?.trim()) {
    return {};
  }

  return { addressLine1: address.trim() };
}
