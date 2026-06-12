'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { de, enUS, tr } from 'date-fns/locale';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { SettingsToggle } from '@/components/settings/SettingsToggle';
import { billingApi, onboardingApi, type BillingStatusResponse, type TenantProfile } from '@/lib/api';
import { getUser } from '@/lib/auth';
import {
  buildTenantAddress,
  DEFAULT_PREMIUM_FEATURES,
  loadTenantSettingsPreferences,
  saveTenantSettingsPreferences,
  splitTenantAddress,
  type PremiumFeatureKey,
  type TenantSettingsPreferences,
} from '@/lib/tenant-settings-preferences';
import type { AuthUser } from '@/lib/types';

type ProgressCounts = {
  users: number;
  drivers: number;
  vehicles: number;
  companies: number;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function UsageMeter({
  label,
  valueLabel,
  used,
  limit,
}: {
  label: string;
  valueLabel: string;
  used: number;
  limit: number;
}) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-emerald-700">{label}</span>
        <span className="text-slate-700">{valueLabel}</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function SettingsCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
    </Card>
  );
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs text-slate-500">{children}</p>;
}

function RadioOption({
  name,
  value,
  checked,
  disabled,
  label,
  onChange,
}: {
  name: string;
  value: string;
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
        className="h-4 w-4 border-slate-300 text-emerald-600 focus:ring-emerald-500"
      />
      {label}
    </label>
  );
}

const PREMIUM_FEATURE_KEYS: PremiumFeatureKey[] = [
  'tireReadings',
  'bulkManageParts',
  'purchaseOrders',
  'warranties',
  'advancedAnalytics',
];

export function GeneralSettingsPage() {
  const { t, i18n } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [user] = useState<AuthUser | null>(() => getUser());
  const canEdit = user?.role === 'admin' || user?.role === 'boss';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [tenant, setTenant] = useState<TenantProfile | null>(null);
  const [billing, setBilling] = useState<BillingStatusResponse | null>(null);
  const [counts, setCounts] = useState<ProgressCounts | null>(null);

  const [companyName, setCompanyName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [prefs, setPrefs] = useState<TenantSettingsPreferences>({});

  const dateLocale = useMemo(() => {
    if (i18n.language.startsWith('tr')) return tr;
    if (i18n.language.startsWith('de')) return de;
    return enUS;
  }, [i18n.language]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tenantRes, progressRes, billingRes] = await Promise.all([
        onboardingApi.getTenant(),
        onboardingApi.getProgress().catch(() => null),
        billingApi.getStatus().catch(() => null),
      ]);

      setTenant(tenantRes);
      setBilling(billingRes);
      setCounts(progressRes?.counts ?? null);

      const storedPrefs = loadTenantSettingsPreferences(tenantRes.id);
      const parsedAddress = splitTenantAddress(tenantRes.address);

      setCompanyName(tenantRes.name ?? '');
      setContactEmail(tenantRes.contact_email ?? user?.email ?? '');
      setPhone(tenantRes.contact_phone ?? '');
      setPrefs({
        ...storedPrefs,
        addressLine1: storedPrefs.addressLine1 ?? parsedAddress.addressLine1 ?? '',
        addressLine2: storedPrefs.addressLine2 ?? '',
        city: storedPrefs.city ?? parsedAddress.city ?? '',
        state: storedPrefs.state ?? parsedAddress.state ?? '',
        zip: storedPrefs.zip ?? parsedAddress.zip ?? '',
        country: storedPrefs.country ?? parsedAddress.country ?? 'DE',
      });
    } catch {
      setError(t('settings.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t, user?.email]);

  useEffect(() => {
    void load();
  }, [load]);

  function updatePref<K extends keyof TenantSettingsPreferences>(key: K, value: TenantSettingsPreferences[K]) {
    setPrefs((current) => ({ ...current, [key]: value }));
  }

  function updatePremiumFeature(key: PremiumFeatureKey, enabled: boolean) {
    setPrefs((current) => ({
      ...current,
      premiumFeatures: {
        ...DEFAULT_PREMIUM_FEATURES,
        ...(current.premiumFeatures ?? {}),
        [key]: enabled,
      },
    }));
  }

  async function handleSave() {
    if (!tenant || !canEdit) return;

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const nextPrefs: TenantSettingsPreferences = {
        ...prefs,
        addressLine1: prefs.addressLine1 ?? '',
      };

      await onboardingApi.updateTenant({
        fleet_name: companyName.trim(),
        contact_email: contactEmail.trim(),
        contact_phone: phone.trim(),
        address: buildTenantAddress(nextPrefs),
        language: tenant.language,
      });

      saveTenantSettingsPreferences(tenant.id, nextPrefs);
      setNotice(t('settings.saveSuccess'));
      await load();
    } catch {
      setError(t('settings.saveError'));
    } finally {
      setSaving(false);
    }
  }

  function handleLogoPick(file: File | null) {
    if (!file || !tenant) return;

    if (!['image/png', 'image/jpeg', 'image/gif', 'image/tiff'].includes(file.type)) {
      setError(t('settings.general.logoTypes'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      updatePref('logoDataUrl', typeof reader.result === 'string' ? reader.result : undefined);
    };
    reader.readAsDataURL(file);
  }

  const ownerName = user?.name ?? user?.email ?? '—';
  const ownerInitials = initials(ownerName);

  const vehicleUsed = billing?.usage.vehicles ?? counts?.vehicles ?? 0;
  const vehicleLimit = billing?.usage.vehicle_limit ?? 5;
  const seatUsed = billing?.usage.seats ?? counts?.users ?? 0;
  const seatLimit = billing?.usage.seat_limit ?? 15;
  const companyCount = counts?.companies ?? 0;

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('settings.general.title')}</h1>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      ) : null}

      <SettingsCard
        title={t('settings.general.accountOwner')}
        action={
          <Button type="button" variant="outline" size="sm" disabled>
            {t('settings.general.changeOwner')}
          </Button>
        }
      >
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-500 text-lg font-semibold text-white">
            {ownerInitials || 'U'}
          </div>
          <div>
            <p className="text-lg font-semibold text-slate-900">{ownerName}</p>
            <p className="text-sm text-emerald-700">{user?.email ?? contactEmail}</p>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title={t('settings.general.accountUsage')}
        action={
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href="/billing">{t('settings.general.explorePlans')}</Link>
          </Button>
        }
      >
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <UsageMeter
              label={t('settings.usage.documents')}
              valueLabel={t('settings.usage.documentsValue', { used: '0 B', limit: '25.0 GB' })}
              used={0}
              limit={100}
            />
            <UsageMeter
              label={t('settings.usage.vehicles')}
              valueLabel={t('settings.usage.countValue', { used: vehicleUsed, limit: vehicleLimit })}
              used={vehicleUsed}
              limit={vehicleLimit}
            />
            <UsageMeter
              label={t('settings.usage.groups')}
              valueLabel={t('settings.usage.countValue', { used: companyCount, limit: 100 })}
              used={companyCount}
              limit={100}
            />
            <UsageMeter
              label={t('settings.usage.automations')}
              valueLabel={t('settings.usage.countValue', { used: 0, limit: 5 })}
              used={0}
              limit={5}
            />
          </div>
          <div className="space-y-4">
            <UsageMeter
              label={t('settings.usage.roles')}
              valueLabel={t('settings.usage.countValue', { used: seatUsed, limit: seatLimit })}
              used={seatUsed}
              limit={seatLimit}
            />
            <UsageMeter
              label={t('settings.usage.customFields')}
              valueLabel={t('settings.usage.countValue', { used: 0, limit: 50 })}
              used={0}
              limit={50}
            />
            <UsageMeter
              label={t('settings.usage.webhookEvents')}
              valueLabel={t('settings.usage.countValue', { used: 0, limit: 10000 })}
              used={0}
              limit={10000}
            />
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title={t('settings.general.generalSection')}>
        <div>
          <Label htmlFor="company_name">
            {t('settings.general.companyName')} <span className="text-red-500">*</span>
          </Label>
          <Input
            id="company_name"
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
            disabled={!canEdit}
            className="mt-1.5"
          />
          <FieldHint>{t('settings.general.companyNameHint')}</FieldHint>
        </div>

        <div>
          <Label>{t('settings.general.logo')}</Label>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            {prefs.logoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={prefs.logoDataUrl}
                alt=""
                className="h-12 w-12 rounded-md border border-slate-200 object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-400">
                Logo
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/tiff"
              className="hidden"
              onChange={(event) => handleLogoPick(event.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canEdit}
              onClick={() => fileInputRef.current?.click()}
            >
              {t('settings.general.pickFile')}
            </Button>
            <span className="text-sm text-slate-500">{t('settings.general.dropFile')}</span>
          </div>
          <FieldHint>{t('settings.general.logoTypes')}</FieldHint>
        </div>
      </SettingsCard>

      <SettingsCard title={t('settings.general.generalSettingsSection')}>
        <div>
          <Label htmlFor="address_line_1">{t('settings.general.address')}</Label>
          <Input
            id="address_line_1"
            value={prefs.addressLine1 ?? ''}
            onChange={(event) => updatePref('addressLine1', event.target.value)}
            disabled={!canEdit}
            className="mt-1.5"
          />
          <FieldHint>{t('settings.general.addressHint')}</FieldHint>
        </div>

        <div>
          <Label htmlFor="address_line_2">{t('settings.general.addressLine2')}</Label>
          <Input
            id="address_line_2"
            value={prefs.addressLine2 ?? ''}
            onChange={(event) => updatePref('addressLine2', event.target.value)}
            disabled={!canEdit}
            className="mt-1.5"
          />
          <FieldHint>{t('settings.general.addressLine2Hint')}</FieldHint>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label htmlFor="city">{t('settings.general.city')}</Label>
            <Input
              id="city"
              value={prefs.city ?? ''}
              onChange={(event) => updatePref('city', event.target.value)}
              disabled={!canEdit}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="state">{t('settings.general.state')}</Label>
            <Input
              id="state"
              value={prefs.state ?? ''}
              onChange={(event) => updatePref('state', event.target.value)}
              disabled={!canEdit}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="zip">{t('settings.general.zip')}</Label>
            <Input
              id="zip"
              value={prefs.zip ?? ''}
              onChange={(event) => updatePref('zip', event.target.value)}
              disabled={!canEdit}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="country">{t('settings.general.country')}</Label>
            <Select
              id="country"
              value={prefs.country ?? 'DE'}
              onChange={(event) => updatePref('country', event.target.value)}
              disabled={!canEdit}
              className="mt-1.5"
            >
              <option value="DE">{t('settings.countries.de')}</option>
              <option value="AT">{t('settings.countries.at')}</option>
              <option value="CH">{t('settings.countries.ch')}</option>
              <option value="TR">{t('settings.countries.tr')}</option>
              <option value="US">{t('settings.countries.us')}</option>
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="phone">{t('settings.general.phone')}</Label>
          <Input
            id="phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            disabled={!canEdit}
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="industry">{t('settings.general.industry')}</Label>
          <Select
            id="industry"
            value={prefs.industry ?? 'transportation_logistics'}
            onChange={(event) => updatePref('industry', event.target.value)}
            disabled={!canEdit}
            className="mt-1.5"
          >
            <option value="transportation_logistics">
              {t('settings.industries.transportationLogistics')}
            </option>
            <option value="construction">{t('settings.industries.construction')}</option>
            <option value="services">{t('settings.industries.services')}</option>
            <option value="other">{t('settings.industries.other')}</option>
          </Select>
        </div>
      </SettingsCard>

      <SettingsCard title={t('settings.general.regionalSection')}>
        <div>
          <Label htmlFor="currency">{t('settings.general.currency')}</Label>
          <Select
            id="currency"
            value={prefs.currency ?? 'EUR'}
            onChange={(event) => updatePref('currency', event.target.value)}
            disabled={!canEdit}
            className="mt-1.5"
          >
            <option value="EUR">{t('settings.currencies.eur')}</option>
            <option value="USD">{t('settings.currencies.usd')}</option>
            <option value="GBP">{t('settings.currencies.gbp')}</option>
            <option value="TRY">{t('settings.currencies.try')}</option>
          </Select>
        </div>

        <div>
          <Label htmlFor="short_date_format">{t('settings.general.shortDateFormat')}</Label>
          <Select
            id="short_date_format"
            value={prefs.shortDateFormat ?? 'DD.MM.YYYY'}
            onChange={(event) => updatePref('shortDateFormat', event.target.value)}
            disabled={!canEdit}
            className="mt-1.5"
          >
            <option value="DD.MM.YYYY">DD.MM.YYYY</option>
            <option value="MM/DD/YYYY">MM/DD/YYYY</option>
            <option value="YYYY-MM-DD">YYYY-MM-DD</option>
          </Select>
          <FieldHint>{t('settings.general.shortDateFormatHint')}</FieldHint>
        </div>

        <div>
          <Label htmlFor="time_zone">{t('settings.general.timeZone')}</Label>
          <Select
            id="time_zone"
            value={prefs.timeZone ?? 'Europe/Berlin'}
            onChange={(event) => updatePref('timeZone', event.target.value)}
            disabled={!canEdit}
            className="mt-1.5"
          >
            <option value="Europe/Berlin">{t('settings.timeZones.berlin')}</option>
            <option value="Europe/Istanbul">{t('settings.timeZones.istanbul')}</option>
            <option value="Europe/London">{t('settings.timeZones.london')}</option>
            <option value="America/New_York">{t('settings.timeZones.newYork')}</option>
          </Select>
        </div>
      </SettingsCard>

      <SettingsCard title={t('settings.general.timeFormatSection')}>
        <div className="space-y-2">
          <RadioOption
            name="time_format"
            value="12"
            checked={prefs.timeFormat === '12'}
            disabled={!canEdit}
            label={t('settings.general.time12')}
            onChange={(value) => updatePref('timeFormat', value as '12' | '24')}
          />
          <RadioOption
            name="time_format"
            value="24"
            checked={(prefs.timeFormat ?? '24') === '24'}
            disabled={!canEdit}
            label={t('settings.general.time24')}
            onChange={(value) => updatePref('timeFormat', value as '12' | '24')}
          />
        </div>
        <FieldHint>{t('settings.general.timeFormatHint')}</FieldHint>
      </SettingsCard>

      <SettingsCard title={t('settings.general.defaultUnitsSection')}>
        <div className="space-y-6">
          <div>
            <p className="text-sm font-medium text-slate-900">{t('settings.general.usageUnit')}</p>
            <div className="mt-2 space-y-2">
              {(['miles', 'kilometers', 'hours'] as const).map((unit) => (
                <RadioOption
                  key={unit}
                  name="usage_unit"
                  value={unit}
                  checked={(prefs.usageUnit ?? 'kilometers') === unit}
                  disabled={!canEdit}
                  label={t(`settings.units.usage.${unit}`)}
                  onChange={(value) => updatePref('usageUnit', value as typeof unit)}
                />
              ))}
            </div>
            <FieldHint>{t('settings.general.usageUnitHint')}</FieldHint>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-900">{t('settings.general.fuelVolume')}</p>
            <div className="mt-2 space-y-2">
              {(['gallons_us', 'gallons_uk', 'liters'] as const).map((unit) => (
                <RadioOption
                  key={unit}
                  name="fuel_volume"
                  value={unit}
                  checked={(prefs.fuelVolumeUnit ?? 'liters') === unit}
                  disabled={!canEdit}
                  label={t(`settings.units.fuel.${unit}`)}
                  onChange={(value) => updatePref('fuelVolumeUnit', value as typeof unit)}
                />
              ))}
            </div>
            <FieldHint>{t('settings.general.fuelVolumeHint')}</FieldHint>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-900">{t('settings.general.measurementSystem')}</p>
            <div className="mt-2 space-y-2">
              {(['imperial', 'metric'] as const).map((unit) => (
                <RadioOption
                  key={unit}
                  name="measurement_system"
                  value={unit}
                  checked={(prefs.measurementSystem ?? 'metric') === unit}
                  disabled={!canEdit}
                  label={t(`settings.units.measurement.${unit}`)}
                  onChange={(value) => updatePref('measurementSystem', value as typeof unit)}
                />
              ))}
            </div>
            <FieldHint>{t('settings.general.measurementSystemHint')}</FieldHint>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-900">{t('settings.general.vehicleSystemLabel')}</p>
            <div className="mt-2 space-y-2">
              {(['vehicle', 'asset'] as const).map((unit) => (
                <RadioOption
                  key={unit}
                  name="vehicle_system_label"
                  value={unit}
                  checked={(prefs.vehicleSystemLabel ?? 'vehicle') === unit}
                  disabled={!canEdit}
                  label={t(`settings.units.label.${unit}`)}
                  onChange={(value) => updatePref('vehicleSystemLabel', value as typeof unit)}
                />
              ))}
            </div>
            <FieldHint>{t('settings.general.vehicleSystemLabelHint')}</FieldHint>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title={t('settings.general.taxSection')}>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={Boolean(prefs.taxFreeLabor)}
            disabled={!canEdit}
            onChange={(event) => updatePref('taxFreeLabor', event.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span>
            <span className="block text-sm font-medium text-slate-900">
              {t('settings.general.taxFreeLabor')}
            </span>
            <FieldHint>{t('settings.general.taxFreeLaborHint')}</FieldHint>
          </span>
        </label>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={Boolean(prefs.secondaryTax)}
            disabled={!canEdit}
            onChange={(event) => updatePref('secondaryTax', event.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span>
            <span className="block text-sm font-medium text-slate-900">
              {t('settings.general.secondaryTax')}
            </span>
            <FieldHint>{t('settings.general.secondaryTaxHint')}</FieldHint>
          </span>
        </label>

        <div>
          <Label htmlFor="default_tax_1">{t('settings.general.defaultTax1')}</Label>
          <Input
            id="default_tax_1"
            value={prefs.defaultTax1 ?? ''}
            onChange={(event) => updatePref('defaultTax1', event.target.value)}
            disabled={!canEdit}
            className="mt-1.5"
          />
          <FieldHint>{t('settings.general.defaultTax1Hint')}</FieldHint>
        </div>

        <div>
          <Label htmlFor="default_tax_2">{t('settings.general.defaultTax2')}</Label>
          <Input
            id="default_tax_2"
            value={prefs.defaultTax2 ?? ''}
            onChange={(event) => updatePref('defaultTax2', event.target.value)}
            disabled={!canEdit}
            className="mt-1.5"
          />
          <FieldHint>{t('settings.general.defaultTax2Hint')}</FieldHint>
        </div>

        <div>
          <Label htmlFor="default_tax_type">{t('settings.general.defaultTaxType')}</Label>
          <Select
            id="default_tax_type"
            value={prefs.defaultTaxType ?? ''}
            onChange={(event) => updatePref('defaultTaxType', event.target.value as '' | 'percentage' | 'fixed')}
            disabled={!canEdit}
            className="mt-1.5"
          >
            <option value="">{t('settings.general.taxTypeSelect')}</option>
            <option value="percentage">{t('settings.general.taxTypePercentage')}</option>
            <option value="fixed">{t('settings.general.taxTypeFixed')}</option>
          </Select>
          <FieldHint>{t('settings.general.defaultTaxTypeHint')}</FieldHint>
        </div>
      </SettingsCard>

      <SettingsCard title={t('settings.general.premiumSection')}>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={Boolean(prefs.hidePremiumFeatures)}
            disabled={!canEdit}
            onChange={(event) => updatePref('hidePremiumFeatures', event.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span className="text-sm font-medium text-slate-900">
            {t('settings.general.hidePremiumFeatures')}
          </span>
        </label>

        <div className="divide-y divide-slate-100 rounded-lg border border-slate-100">
          {PREMIUM_FEATURE_KEYS.map((key) => (
            <div key={key} className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="text-sm text-slate-800">{t(`settings.premium.${key}`)}</span>
              <SettingsToggle
                label={t(`settings.premium.${key}`)}
                checked={prefs.premiumFeatures?.[key] ?? DEFAULT_PREMIUM_FEATURES[key]}
                disabled={!canEdit}
                onChange={(enabled) => updatePremiumFeature(key, enabled)}
              />
            </div>
          ))}
        </div>
      </SettingsCard>

      <div className="flex flex-col gap-4 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
        {tenant ? (
          <p className="text-sm text-emerald-700">
            {t('settings.meta.created', {
              time: formatDistanceToNow(new Date(tenant.created_at), {
                addSuffix: true,
                locale: dateLocale,
              }),
            })}
            {' · '}
            {t('settings.meta.updated', {
              time: formatDistanceToNow(new Date(tenant.updated_at), {
                addSuffix: true,
                locale: dateLocale,
              }),
            })}
          </p>
        ) : null}
        <Button
          type="button"
          onClick={handleSave}
          disabled={!canEdit || saving || !companyName.trim()}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          {saving ? t('settings.saving') : t('settings.saveAccount')}
        </Button>
      </div>
    </div>
  );
}
