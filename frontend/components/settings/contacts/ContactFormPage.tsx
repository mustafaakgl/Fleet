'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { invitationsApi, usersApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  buildContactFullName,
  EMPTY_CONTACT_PROFILE,
  loadContactProfile,
  saveContactProfile,
  saveContactProfileByEmail,
  splitContactFullName,
  type ContactProfile,
} from '@/lib/contact-profile-storage';
import { isPasswordStrong } from '@/lib/password-policy';
import type { User, UserRole } from '@/lib/types';
import { cn } from '@/lib/utils';

type ContactFormPageProps = {
  userId?: string;
};

const roleValues: UserRole[] = ['admin', 'boss', 'accounting', 'office', 'driver'];

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs text-slate-500">{children}</p>;
}

function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
    </Card>
  );
}

function AccessOption({
  selected,
  title,
  description,
  onSelect,
}: {
  selected: boolean;
  title: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'rounded-lg border p-4 text-left transition-colors',
        selected
          ? 'border-emerald-300 bg-emerald-50'
          : 'border-slate-200 bg-white hover:border-slate-300',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'mt-0.5 flex h-4 w-4 items-center justify-center rounded-full border',
            selected ? 'border-emerald-600' : 'border-slate-300',
          )}
        >
          {selected ? <span className="h-2 w-2 rounded-full bg-emerald-600" /> : null}
        </span>
        <span>
          <span className="block text-sm font-semibold text-slate-900">{title}</span>
          <span className="mt-1 block text-sm text-slate-600">{description}</span>
        </span>
      </div>
    </button>
  );
}

function randomPassword() {
  return `Operion!${Math.random().toString(36).slice(2, 10)}9A`;
}

export function ContactFormPage({ userId }: ContactFormPageProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isEdit = Boolean(userId);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [profile, setProfile] = useState<ContactProfile>({ ...EMPTY_CONTACT_PROFILE });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sendInvite, setSendInvite] = useState(true);
  const [language, setLanguage] = useState('de');

  useEffect(() => {
    if (!userId) return;

    setLoading(true);
    usersApi
      .getById(userId)
      .then((user: User) => {
        const stored = loadContactProfile(user.id, user.email);
        const split = splitContactFullName(user.full_name);
        setProfile({
          ...stored,
          firstName: stored.firstName ?? split.firstName ?? '',
          middleName: stored.middleName ?? split.middleName ?? '',
          lastName: stored.lastName ?? split.lastName ?? '',
          userAccess: stored.userAccess ?? (user.status === 'active' ? 'enabled' : 'none'),
          userRole: stored.userRole ?? user.role,
        });
        setEmail(user.email);
        setLanguage(user.language || 'de');
      })
      .catch(() => setError(t('settings.contacts.loadError')))
      .finally(() => setLoading(false));
  }, [t, userId]);

  function updateProfile<K extends keyof ContactProfile>(key: K, value: ContactProfile[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  function handlePhotoPick(file: File | null) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/tiff'].includes(file.type)) {
      setError(t('settings.general.logoTypes'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      updateProfile(
        'profilePhotoDataUrl',
        typeof reader.result === 'string' ? reader.result : undefined,
      );
    };
    reader.readAsDataURL(file);
  }

  async function persistContact(addAnother: boolean) {
    setError(null);

    if (!profile.firstName?.trim() || !email.trim()) {
      setError(t('settings.contacts.validation.required'));
      return;
    }

    const fullName = buildContactFullName(profile) || profile.firstName.trim();
    const userAccess = profile.userAccess ?? 'none';
    const role = profile.userRole ?? 'office';
    const status = userAccess === 'enabled' ? 'active' : 'inactive';

    setSaving(true);
    try {
      let savedUser: User;

      if (isEdit && userId) {
        savedUser = await usersApi.update(userId, {
          full_name: fullName,
          email: email.trim(),
          role,
          status,
          language,
          ...(password ? { password } : {}),
        });
      } else if (userAccess === 'enabled' && sendInvite && !isEdit) {
        await invitationsApi.create({
          full_name: fullName,
          email: email.trim(),
          role,
          language,
        });
        saveContactProfileByEmail(email.trim(), profile);
        if (addAnother) {
          resetForm();
        } else {
          router.push('/settings/users');
        }
        return;
      } else {
        const nextPassword =
          userAccess === 'enabled'
            ? password && isPasswordStrong(password)
              ? password
              : randomPassword()
            : randomPassword();

        if (userAccess === 'enabled' && password && !isPasswordStrong(password)) {
          setError(t('usersAdmin.passwordMin'));
          return;
        }

        savedUser = await usersApi.create({
          full_name: fullName,
          email: email.trim(),
          password: nextPassword,
          role,
          status,
          language,
        });
      }

      saveContactProfile(savedUser.id, profile);

      if (addAnother) {
        resetForm();
      } else {
        router.push('/settings/users');
      }
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setError(Array.isArray(message) ? message.join(' ') : message || t('settings.contacts.saveError'));
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setProfile({ ...EMPTY_CONTACT_PROFILE });
    setEmail('');
    setPassword('');
    setSendInvite(true);
    setLanguage('de');
    setError(null);
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {isEdit ? t('settings.contacts.editTitle') : t('settings.contacts.addTitle')}
        </h1>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <FormSection title={t('settings.contacts.sections.basicDetails')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="first_name">
              {t('settings.contacts.fields.firstName')} <span className="text-red-500">*</span>
            </Label>
            <Input
              id="first_name"
              value={profile.firstName ?? ''}
              onChange={(event) => updateProfile('firstName', event.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="middle_name">{t('settings.contacts.fields.middleName')}</Label>
            <Input
              id="middle_name"
              value={profile.middleName ?? ''}
              onChange={(event) => updateProfile('middleName', event.target.value)}
              className="mt-1.5"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="last_name">{t('settings.contacts.fields.lastName')}</Label>
          <Input
            id="last_name"
            value={profile.lastName ?? ''}
            onChange={(event) => updateProfile('lastName', event.target.value)}
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
            className="mt-1.5"
          />
          <FieldHint>{t('settings.contacts.fields.emailHint')}</FieldHint>
        </div>

        <div>
          <Label htmlFor="group">{t('settings.contacts.fields.group')}</Label>
          <Select
            id="group"
            value={profile.group ?? ''}
            onChange={(event) => updateProfile('group', event.target.value)}
            className="mt-1.5"
          >
            <option value="">{t('settings.contacts.fields.groupSelect')}</option>
            <option value="operations">{t('settings.contacts.groups.operations')}</option>
            <option value="management">{t('settings.contacts.groups.management')}</option>
            <option value="workshop">{t('settings.contacts.groups.workshop')}</option>
          </Select>
        </div>

        <div>
          <Label>{t('settings.contacts.fields.profilePhoto')}</Label>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/tiff"
              className="hidden"
              onChange={(event) => handlePhotoPick(event.target.files?.[0] ?? null)}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              {t('settings.general.pickFile')}
            </Button>
            <span className="text-sm text-slate-500">{t('settings.general.dropFile')}</span>
          </div>
          <FieldHint>{t('settings.contacts.fields.noFileSelected')}</FieldHint>
        </div>
      </FormSection>

      <FormSection title={t('settings.contacts.sections.classifications')}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex items-start gap-3 rounded-lg border border-slate-100 p-4">
            <input
              type="checkbox"
              checked={Boolean(profile.operator)}
              onChange={(event) => updateProfile('operator', event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600"
            />
            <span>
              <span className="block text-sm font-medium text-slate-900">
                {t('settings.contacts.classifications.operator')}
              </span>
              <FieldHint>{t('settings.contacts.classifications.operatorHint')}</FieldHint>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-lg border border-slate-100 p-4">
            <input
              type="checkbox"
              checked={Boolean(profile.employee)}
              onChange={(event) => updateProfile('employee', event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600"
            />
            <span>
              <span className="block text-sm font-medium text-slate-900">
                {t('settings.contacts.classifications.employee')}
              </span>
              <FieldHint>{t('settings.contacts.classifications.employeeHint')}</FieldHint>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-lg border border-slate-100 p-4 md:col-span-2">
            <input
              type="checkbox"
              checked={Boolean(profile.technician)}
              onChange={(event) => updateProfile('technician', event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600"
            />
            <span>
              <span className="block text-sm font-medium text-slate-900">
                {t('settings.contacts.classifications.technician')}
              </span>
              <FieldHint>{t('settings.contacts.classifications.technicianHint')}</FieldHint>
            </span>
          </label>
        </div>
      </FormSection>

      <FormSection title={t('settings.contacts.sections.userAccess')}>
        <div className="grid gap-4 md:grid-cols-2">
          <AccessOption
            selected={(profile.userAccess ?? 'none') === 'enabled'}
            title={t('settings.contacts.userAccess.enable')}
            description={t('settings.contacts.userAccess.enableHint')}
            onSelect={() => updateProfile('userAccess', 'enabled')}
          />
          <AccessOption
            selected={(profile.userAccess ?? 'none') === 'none'}
            title={t('settings.contacts.userAccess.none')}
            description={t('settings.contacts.userAccess.noneHint')}
            onSelect={() => updateProfile('userAccess', 'none')}
          />
        </div>

        {(profile.userAccess ?? 'none') === 'enabled' ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="user_role">{t('settings.contacts.fields.userRole')}</Label>
              <Select
                id="user_role"
                value={profile.userRole ?? 'office'}
                onChange={(event) => updateProfile('userRole', event.target.value as UserRole)}
                className="mt-1.5"
              >
                {roleValues.map((role) => (
                  <option key={role} value={role}>
                    {t(`usersAdmin.roles.${role}`)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="language">{t('usersAdmin.fieldLanguage')}</Label>
              <Select
                id="language"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                className="mt-1.5"
              >
                <option value="de">{t('usersAdmin.languages.de')}</option>
                <option value="en">{t('usersAdmin.languages.en')}</option>
                <option value="tr">{t('usersAdmin.languages.tr')}</option>
              </Select>
            </div>
            {!isEdit ? (
              <label className="flex items-center gap-2 md:col-span-2">
                <input
                  type="checkbox"
                  checked={sendInvite}
                  onChange={(event) => setSendInvite(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                />
                <span className="text-sm text-slate-700">{t('settings.contacts.fields.sendInvite')}</span>
              </label>
            ) : null}
            {!sendInvite || isEdit ? (
              <div className="md:col-span-2">
                <Label htmlFor="password">
                  {isEdit ? t('usersAdmin.fieldNewPassword') : t('usersAdmin.fieldPassword')}
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-1.5"
                />
                {isEdit ? <FieldHint>{t('usersAdmin.passwordKeepHint')}</FieldHint> : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </FormSection>

      <FormSection title={t('settings.contacts.sections.contactInformation')}>
        <div className="grid gap-4 sm:grid-cols-2">
          {(['mobilePhone', 'homePhone', 'workPhone', 'otherPhone'] as const).map((field) => (
            <div key={field}>
              <Label htmlFor={field}>{t(`settings.contacts.fields.${field}`)}</Label>
              <Input
                id={field}
                value={profile[field] ?? ''}
                onChange={(event) => updateProfile(field, event.target.value)}
                placeholder={t('settings.contacts.fields.phonePlaceholder')}
                className="mt-1.5"
              />
            </div>
          ))}
        </div>

        <div>
          <Label htmlFor="address_line_1">{t('settings.general.address')}</Label>
          <Input
            id="address_line_1"
            value={profile.addressLine1 ?? ''}
            onChange={(event) => updateProfile('addressLine1', event.target.value)}
            className="mt-1.5"
          />
          <FieldHint>{t('settings.general.addressHint')}</FieldHint>
        </div>

        <div>
          <Label htmlFor="address_line_2">{t('settings.general.addressLine2')}</Label>
          <Input
            id="address_line_2"
            value={profile.addressLine2 ?? ''}
            onChange={(event) => updateProfile('addressLine2', event.target.value)}
            className="mt-1.5"
          />
          <FieldHint>{t('settings.general.addressLine2Hint')}</FieldHint>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="city">{t('settings.general.city')}</Label>
            <Input
              id="city"
              value={profile.city ?? ''}
              onChange={(event) => updateProfile('city', event.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="state">{t('settings.general.state')}</Label>
            <Input
              id="state"
              value={profile.state ?? ''}
              onChange={(event) => updateProfile('state', event.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="zip">{t('settings.general.zip')}</Label>
            <Input
              id="zip"
              value={profile.zip ?? ''}
              onChange={(event) => updateProfile('zip', event.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="country">{t('settings.general.country')}</Label>
            <Select
              id="country"
              value={profile.country ?? 'DE'}
              onChange={(event) => updateProfile('country', event.target.value)}
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
      </FormSection>

      <FormSection title={t('settings.contacts.sections.personalDetails')}>
        <div>
          <Label htmlFor="job_title">{t('settings.contacts.fields.jobTitle')}</Label>
          <Input
            id="job_title"
            value={profile.jobTitle ?? ''}
            onChange={(event) => updateProfile('jobTitle', event.target.value)}
            placeholder={t('settings.contacts.fields.jobTitlePlaceholder')}
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="date_of_birth">{t('settings.contacts.fields.dateOfBirth')}</Label>
          <Input
            id="date_of_birth"
            type="date"
            value={profile.dateOfBirth ?? ''}
            onChange={(event) => updateProfile('dateOfBirth', event.target.value)}
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="employee_number">{t('settings.contacts.fields.employeeNumber')}</Label>
          <Input
            id="employee_number"
            value={profile.employeeNumber ?? ''}
            onChange={(event) => updateProfile('employeeNumber', event.target.value)}
            className="mt-1.5"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="start_date">{t('settings.contacts.fields.startDate')}</Label>
            <Input
              id="start_date"
              type="date"
              value={profile.startDate ?? ''}
              onChange={(event) => updateProfile('startDate', event.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="leave_date">{t('settings.contacts.fields.leaveDate')}</Label>
            <Input
              id="leave_date"
              type="date"
              value={profile.leaveDate ?? ''}
              onChange={(event) => updateProfile('leaveDate', event.target.value)}
              className="mt-1.5"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="license_number">{t('settings.contacts.fields.licenseNumber')}</Label>
          <Input
            id="license_number"
            value={profile.licenseNumber ?? ''}
            onChange={(event) => updateProfile('licenseNumber', event.target.value)}
            className="mt-1.5"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="license_class">{t('settings.contacts.fields.licenseClass')}</Label>
            <Input
              id="license_class"
              value={profile.licenseClass ?? ''}
              onChange={(event) => updateProfile('licenseClass', event.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="license_state">{t('settings.contacts.fields.licenseState')}</Label>
            <Input
              id="license_state"
              value={profile.licenseState ?? ''}
              onChange={(event) => updateProfile('licenseState', event.target.value)}
              className="mt-1.5"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="hourly_rate">{t('settings.contacts.fields.hourlyLaborRate')}</Label>
          <div className="relative mt-1.5 max-w-md">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
              €
            </span>
            <Input
              id="hourly_rate"
              type="number"
              min="0"
              step="0.01"
              value={profile.hourlyLaborRate ?? ''}
              onChange={(event) => updateProfile('hourlyLaborRate', event.target.value)}
              className="pl-8"
            />
          </div>
        </div>
      </FormSection>

      <FormSection title={t('settings.contacts.sections.saml')}>
        <div>
          <Label htmlFor="saml_id">{t('settings.contacts.fields.samlId')}</Label>
          <Input
            id="saml_id"
            value={profile.samlId ?? ''}
            onChange={(event) => updateProfile('samlId', event.target.value)}
            className="mt-1.5"
          />
          <FieldHint>{t('settings.contacts.fields.samlHint')}</FieldHint>
        </div>
      </FormSection>

      <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="ghost" asChild>
          <Link href="/settings/users">{t('settings.contacts.cancel')}</Link>
        </Button>
        <div className="flex flex-col gap-2 sm:flex-row">
          {!isEdit ? (
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => void persistContact(true)}
            >
              {t('settings.contacts.saveAndAddAnother')}
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={() => void persistContact(false)}
          >
            {saving ? t('settings.saving') : t('settings.contacts.saveContact')}
          </Button>
        </div>
      </div>
    </div>
  );
}
