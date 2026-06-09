'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { isAxiosError } from 'axios';
import { ChevronLeft, Loader2, Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { driversApi } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { canEditDriverVacationEntitlement } from '@/lib/permissions';
import type { DriverStatus } from '@/lib/types';

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
  status: z.enum(['active', 'inactive', 'on_leave', 'sick', 'terminated']),
  vacation_entitlement_days: z.coerce.number().min(0).max(365).optional(),
  vacation_carry_over_days: z.coerce.number().min(-365).max(365).optional(),
});

type FormData = z.infer<typeof schema>;

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

function toDateInputValue(iso?: string): string {
  if (!iso) return '';
  return iso.slice(0, 10);
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

export default function EditDriverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { t } = useTranslation();
  const canEditVacation = canEditDriverVacationEntitlement(getUser()?.role ?? 'customer');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema) as unknown as Resolver<FormData>,
  });

  useEffect(() => {
    driversApi
      .getById(id)
      .then((driver) => {
        reset({
          first_name: driver.first_name,
          last_name: driver.last_name,
          email: driver.email ?? '',
          phone: driver.phone ?? '',
          license_number: driver.license_number ?? '',
          license_expiry_date: toDateInputValue(driver.license_expiry_date),
          passport_number: driver.passport_number ?? '',
          passport_expiry_date: toDateInputValue(driver.passport_expiry_date),
          date_of_birth: toDateInputValue(driver.date_of_birth ?? undefined),
          status: driver.status as DriverStatus,
          vacation_entitlement_days: driver.vacation_entitlement_days ?? 24,
          vacation_carry_over_days: driver.vacation_carry_over_days ?? 0,
        });
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id, reset]);

  async function onSubmit(data: FormData) {
    setServerError(null);
    try {
      const payload = blankToUndefined(data);
      await driversApi.update(id, payload);
      router.push(`/drivers/${id}`);
    } catch (e) {
      setServerError(extractServerError(e, t('form.updateDriverError')));
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="py-20 text-center">
        <p className="text-lg text-gray-500">{t('form.driverNotFound')}</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/drivers">{t('form.back')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/drivers/${id}`}>
          <ChevronLeft className="w-4 h-4 mr-1" />
          {t('form.back')}
        </Link>
      </Button>

      <div className="flex items-center gap-3">
        <Pencil className="w-6 h-6 text-blue-600" />
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{t('form.editDriver')}</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('form.personalInfo')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={`${t('form.firstName')} *`} error={t(errors.first_name?.message ?? '')}>
                <Input {...register('first_name')} />
              </Field>
              <Field label={`${t('form.lastName')} *`} error={t(errors.last_name?.message ?? '')}>
                <Input {...register('last_name')} />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t('form.email')} error={t(errors.email?.message ?? '')}>
                <Input type="email" {...register('email')} />
              </Field>
              <Field label={t('form.phone')} error={t(errors.phone?.message ?? '')}>
                <Input {...register('phone')} />
              </Field>
            </div>
            <Field label={t('form.dateOfBirth')} error={t(errors.date_of_birth?.message ?? '')}>
              <Input type="date" {...register('date_of_birth')} />
            </Field>
            <Field label={t('form.status')} error={t(errors.status?.message ?? '')}>
              <Select {...register('status')}>
                <option value="active">{t('form.driverStatus.active')}</option>
                <option value="on_leave">{t('form.driverStatus.on_leave')}</option>
                <option value="sick">{t('form.driverStatus.sick')}</option>
                <option value="inactive">{t('form.driverStatus.inactive')}</option>
                <option value="terminated">{t('form.driverStatus.terminated')}</option>
              </Select>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('form.documents')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t('form.licenseNumber')} error={t(errors.license_number?.message ?? '')}>
                <Input {...register('license_number')} />
              </Field>
              <Field label={t('form.licenseExpiry')} error={t(errors.license_expiry_date?.message ?? '')}>
                <Input type="date" {...register('license_expiry_date')} />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t('form.passportNumber')} error={t(errors.passport_number?.message ?? '')}>
                <Input {...register('passport_number')} />
              </Field>
              <Field label={t('form.passportExpiry')} error={t(errors.passport_expiry_date?.message ?? '')}>
                <Input type="date" {...register('passport_expiry_date')} />
              </Field>
            </div>
          </CardContent>
        </Card>

        {canEditVacation && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('drivers.vacationEntitlementSection')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  label={t('drivers.vacationEntitlement')}
                  error={t(errors.vacation_entitlement_days?.message ?? '')}
                >
                  <Input type="number" step="0.5" min={0} max={365} {...register('vacation_entitlement_days')} />
                </Field>
                <Field
                  label={t('drivers.vacationCarryOver')}
                  error={t(errors.vacation_carry_over_days?.message ?? '')}
                >
                  <Input type="number" step="0.5" min={-365} max={365} {...register('vacation_carry_over_days')} />
                </Field>
              </div>
            </CardContent>
          </Card>
        )}

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
                {t('form.saving')}
              </>
            ) : (
              t('form.saveChanges')
            )}
          </Button>
          <Button variant="outline" type="button" asChild>
            <Link href={`/drivers/${id}`}>{t('form.cancel')}</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
