'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { authApi, usersApi } from '@/lib/api';
import { getUser, updateLocalUser } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  buildDisplayName,
  DEFAULT_USER_PROFILE_PREFERENCES,
  loadUserProfilePreferences,
  saveUserProfilePreferences,
  splitDisplayName,
  type FuelEconomyDisplay,
  type TableDensity,
  type UserProfilePreferences,
} from '@/lib/user-profile-preferences';
import { loadContactProfile, saveContactProfile } from '@/lib/contact-profile-storage';

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs text-slate-500">{children}</p>;
}

function RadioOption({
  name,
  value,
  checked,
  label,
  onChange,
}: {
  name: string;
  value: string;
  checked: boolean;
  label: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="mt-0.5 h-4 w-4 border-slate-300 text-emerald-600 focus:ring-emerald-500"
      />
      <span>{label}</span>
    </label>
  );
}

const FUEL_ECONOMY_OPTIONS: FuelEconomyDisplay[] = ['mpg_us', 'mpg_uk', 'l_per_100km', 'km_per_l'];

export function UserProfilePage() {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const currentUser = getUser();
  const canEditAccount = currentUser?.role === 'admin' || currentUser?.role === 'boss';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [prefs, setPrefs] = useState<UserProfilePreferences>({ ...DEFAULT_USER_PROFILE_PREFERENCES });

  useEffect(() => {
    authApi
      .me()
      .then((user) => {
        const split = splitDisplayName(user.name ?? user.email);
        const storedPrefs = loadUserProfilePreferences(user.id);
        const contactProfile = loadContactProfile(user.id, user.email);

        setUserId(user.id);
        setFirstName(split.firstName);
        setLastName(split.lastName);
        setEmail(user.email);
        setPrefs({
          ...storedPrefs,
          profilePhotoDataUrl:
            storedPrefs.profilePhotoDataUrl ?? contactProfile.profilePhotoDataUrl,
        });
      })
      .catch(() => setError(t('settings.profile.loadError')))
      .finally(() => setLoading(false));
  }, [t]);

  function updatePref<K extends keyof UserProfilePreferences>(key: K, value: UserProfilePreferences[K]) {
    setPrefs((current) => ({ ...current, [key]: value }));
  }

  function handlePhotoPick(file: File | null) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/tiff'].includes(file.type)) {
      setError(t('settings.general.logoTypes'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      updatePref(
        'profilePhotoDataUrl',
        typeof reader.result === 'string' ? reader.result : undefined,
      );
    };
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    if (!userId) return;

    if (!firstName.trim()) {
      setError(t('settings.profile.validation.firstName'));
      return;
    }

    const fullName = buildDisplayName(firstName, lastName);
    const itemsPerPage = Math.min(200, Math.max(10, prefs.itemsPerPage ?? 50));

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      if (canEditAccount) {
        await usersApi.update(userId, {
          full_name: fullName,
          email: email.trim(),
        });
      }

      updateLocalUser({ name: fullName, email: email.trim() });
      saveUserProfilePreferences(userId, { ...prefs, itemsPerPage });

      const contactProfile = loadContactProfile(userId, email);
      saveContactProfile(userId, {
        ...contactProfile,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        profilePhotoDataUrl: prefs.profilePhotoDataUrl,
      });

      setNotice(
        canEditAccount
          ? t('settings.profile.saveSuccess')
          : t('settings.profile.saveSuccessLocal'),
      );
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setError(Array.isArray(message) ? message.join(' ') : message || t('settings.profile.saveError'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('accountMenu.userProfile')}</h1>
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

      <Card>
        <CardContent className="space-y-6 pt-6">
          <div>
            <Label>{t('settings.contacts.fields.profilePhoto')}</Label>
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              {prefs.profilePhotoDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={prefs.profilePhotoDataUrl}
                  alt=""
                  className="h-14 w-14 rounded-full border border-slate-200 object-cover"
                />
              ) : null}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/tiff"
                className="hidden"
                onChange={(event) => handlePhotoPick(event.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-emerald-600 text-emerald-700 hover:bg-emerald-50"
                onClick={() => fileInputRef.current?.click()}
              >
                {t('settings.general.pickFile')}
              </Button>
              <span className="rounded-md border border-dashed border-slate-300 px-4 py-2 text-sm text-slate-500">
                {t('settings.general.dropFile')}
              </span>
            </div>
            <FieldHint>{t('settings.contacts.fields.noFileSelected')}</FieldHint>
          </div>

          <div>
            <Label htmlFor="first_name">
              {t('settings.contacts.fields.firstName')} <span className="text-red-500">*</span>
            </Label>
            <Input
              id="first_name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="last_name">
              {t('settings.contacts.fields.lastName')} <span className="text-red-500">*</span>
            </Label>
            <Input
              id="last_name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="email">{t('settings.contacts.fields.email')}</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={!canEditAccount}
              className="mt-1.5"
            />
            <FieldHint>{t('settings.profile.emailHint')}</FieldHint>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-900">
              {t('settings.profile.fuelEconomyLabel')}{' '}
              <span className="text-red-500">*</span>
            </p>
            <div className="mt-3 space-y-2">
              {FUEL_ECONOMY_OPTIONS.map((option) => (
                <RadioOption
                  key={option}
                  name="fuel_economy"
                  value={option}
                  checked={(prefs.fuelEconomyDisplay ?? 'l_per_100km') === option}
                  label={t(`settings.profile.fuelEconomy.${option}`)}
                  onChange={(value) => updatePref('fuelEconomyDisplay', value as FuelEconomyDisplay)}
                />
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="items_per_page">
              {t('settings.profile.itemsPerPage')} <span className="text-red-500">*</span>
            </Label>
            <Input
              id="items_per_page"
              type="number"
              min={10}
              max={200}
              value={prefs.itemsPerPage ?? 50}
              onChange={(event) =>
                updatePref('itemsPerPage', Number(event.target.value) || 50)
              }
              className="mt-1.5 max-w-[120px]"
            />
            <FieldHint>{t('settings.profile.itemsPerPageHint')}</FieldHint>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-900">
              {t('settings.profile.tableDensity')} <span className="text-red-500">*</span>
            </p>
            <div className="mt-3 space-y-2">
              {(['default', 'compact'] as TableDensity[]).map((option) => (
                <RadioOption
                  key={option}
                  name="table_density"
                  value={option}
                  checked={(prefs.tableDensity ?? 'default') === option}
                  label={t(`settings.profile.tableDensityOptions.${option}`)}
                  onChange={(value) => updatePref('tableDensity', value as TableDensity)}
                />
              ))}
            </div>
            <FieldHint>{t('settings.profile.tableDensityHint')}</FieldHint>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end border-t border-slate-200 pt-6">
        <Button
          type="button"
          disabled={saving || !firstName.trim()}
          className="bg-emerald-600 hover:bg-emerald-700"
          onClick={() => void handleSave()}
        >
          {saving ? t('settings.saving') : t('settings.profile.save')}
        </Button>
      </div>
    </div>
  );
}
