'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { isAxiosError } from 'axios';
import { ChevronLeft, Loader2, UserPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { driversApi } from '@/lib/api';

function blankToUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== '' && v !== undefined && v !== null) {
      (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

function extractServerError(e: unknown, fallback: string): string {
  if (isAxiosError(e)) {
    const data = e.response?.data as { message?: string | string[] } | undefined;
    if (data?.message) {
      return Array.isArray(data.message) ? data.message.join('. ') : data.message;
    }
  }
  return fallback;
}

const schema = z.object({
  first_name: z.string().min(1, 'form.required'),
  last_name: z.string().min(1, 'form.required'),
  email: z.string().email('form.invalidEmail').optional().or(z.literal('')),
  phone: z.string().optional(),
  license_number: z.string().optional(),
  license_expiry_date: z.string().optional(),
  passport_number: z.string().optional(),
  passport_expiry_date: z.string().optional(),
  date_of_birth: z.string().optional(),
  home_address_street: z.string().optional(),
  home_address_zip_code: z.string().optional(),
  home_address_city: z.string().optional(),
  home_address_country: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

function FieldGroup({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function NewDriverPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema) as unknown as Resolver<FormData>,
  });

  async function onSubmit(data: FormData) {
    setServerError(null);
    try {
      const payload = blankToUndefined(data);
      const driver = await driversApi.create(payload);
      router.push(`/drivers/${driver.id}`);
    } catch (e) {
      setServerError(extractServerError(e, t('form.createDriverError')));
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Back */}
      <Button variant="ghost" size="sm" asChild>
        <Link href="/drivers">
          <ChevronLeft className="w-4 h-4 mr-1" />
          {t('form.backToDrivers')}
        </Link>
      </Button>

      <div className="flex items-center gap-3">
        <UserPlus className="w-6 h-6 text-blue-600" />
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{t('form.addDriver')}</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6">
        {/* Personal Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('form.personalInfo')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FieldGroup>
              <Field label={`${t('form.firstName')} *`} error={t(errors.first_name?.message ?? '')}>
                <Input {...register('first_name')} placeholder="Ali" />
              </Field>
              <Field label={`${t('form.lastName')} *`} error={t(errors.last_name?.message ?? '')}>
                <Input {...register('last_name')} placeholder="Yilmaz" />
              </Field>
            </FieldGroup>
            <FieldGroup>
              <Field label={t('form.email')} error={t(errors.email?.message ?? '')}>
                <Input type="email" {...register('email')} placeholder="ali@example.com" />
              </Field>
              <Field label={t('form.phone')} error={t(errors.phone?.message ?? '')}>
                <Input {...register('phone')} placeholder="+49 123 456 789" />
              </Field>
            </FieldGroup>
            <Field label={t('form.dateOfBirth')} error={t(errors.date_of_birth?.message ?? '')}>
              <Input type="date" {...register('date_of_birth')} />
            </Field>
          </CardContent>
        </Card>

        {/* Documents */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('form.documents')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FieldGroup>
              <Field label={t('form.licenseNumber')} error={t(errors.license_number?.message ?? '')}>
                <Input {...register('license_number')} placeholder="B123456" />
              </Field>
              <Field label={t('form.licenseExpiry')} error={t(errors.license_expiry_date?.message ?? '')}>
                <Input type="date" {...register('license_expiry_date')} />
              </Field>
            </FieldGroup>
            <FieldGroup>
              <Field label={t('form.passportNumber')} error={t(errors.passport_number?.message ?? '')}>
                <Input {...register('passport_number')} placeholder="P123456" />
              </Field>
              <Field label={t('form.passportExpiry')} error={t(errors.passport_expiry_date?.message ?? '')}>
                <Input type="date" {...register('passport_expiry_date')} />
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('form.homeAddress')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label={t('form.homeAddressStreet')} error={t(errors.home_address_street?.message ?? '')}>
              <Input {...register('home_address_street')} placeholder="Musterstraße 12" />
            </Field>
            <FieldGroup>
              <Field label={t('form.homeAddressZipCode')} error={t(errors.home_address_zip_code?.message ?? '')}>
                <Input {...register('home_address_zip_code')} placeholder="12345" />
              </Field>
              <Field label={t('form.homeAddressCity')} error={t(errors.home_address_city?.message ?? '')}>
                <Input {...register('home_address_city')} placeholder="Berlin" />
              </Field>
            </FieldGroup>
            <Field label={t('form.homeAddressCountry')} error={t(errors.home_address_country?.message ?? '')}>
              <Input {...register('home_address_country')} placeholder="Deutschland" />
            </Field>
          </CardContent>
        </Card>

        {serverError && (
          <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3">
            <p className="text-sm text-red-700">{serverError}</p>
          </div>
        )}

        <div className="flex gap-3">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('form.creating')}
              </>
            ) : (
              t('form.createDriver')
            )}
          </Button>
          <Button variant="outline" type="button" asChild>
            <Link href="/drivers">{t('form.cancel')}</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
