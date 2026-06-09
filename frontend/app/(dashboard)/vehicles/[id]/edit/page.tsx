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
import { vehiclesApi } from '@/lib/api';

const schema = z.object({
  plate_number: z.string().min(1, 'form.required'),
  brand: z.string().min(1, 'form.required'),
  model: z.string().min(1, 'form.required'),
  year: z
    .union([z.string().length(0), z.coerce.number().int().min(1900).max(2100)])
    .optional(),
  vin: z.string().optional(),
  status: z.enum(['active', 'maintenance', 'broken', 'inactive']),
  tuv_expiry_date: z.string().optional(),
  sp_expiry_date: z.string().optional(),
  insurance_expiry_date: z.string().optional(),
  registration_expiry_date: z.string().optional(),
  notes: z.string().optional(),
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

export default function EditVehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { t } = useTranslation();
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
    vehiclesApi
      .getById(id)
      .then((v) => {
        reset({
          plate_number: v.plate_number,
          brand: v.brand,
          model: v.model,
          year: v.year ?? undefined,
          vin: undefined,
          status: v.status as FormData['status'],
          tuv_expiry_date: toDateInputValue(v.tuv_expiry_date),
          sp_expiry_date: toDateInputValue(v.sp_expiry_date),
          insurance_expiry_date: '',
          registration_expiry_date: '',
          notes: '',
        });
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id, reset]);

  async function onSubmit(data: FormData) {
    setServerError(null);
    try {
      const payload = blankToUndefined(data);
      await vehiclesApi.update(id, payload as Record<string, unknown>);
      router.push(`/vehicles/${id}`);
    } catch (e) {
      setServerError(extractServerError(e, t('form.updateVehicleError')));
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
        <p className="text-lg text-gray-500">{t('form.vehicleNotFound')}</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/vehicles">{t('form.back')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/vehicles/${id}`}>
          <ChevronLeft className="w-4 h-4 mr-1" />
          {t('form.back')}
        </Link>
      </Button>

      <div className="flex items-center gap-3">
        <Pencil className="w-6 h-6 text-purple-600" />
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{t('form.editVehicle')}</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('form.vehicleInfo')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={`${t('form.plateNumber')} *`} error={t(errors.plate_number?.message ?? '')}>
                <Input {...register('plate_number')} />
              </Field>
              <Field label={t('form.vin')} error={t(errors.vin?.message ?? '')}>
                <Input {...register('vin')} />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={`${t('form.brand')} *`} error={t(errors.brand?.message ?? '')}>
                <Input {...register('brand')} />
              </Field>
              <Field label={`${t('form.model')} *`} error={t(errors.model?.message ?? '')}>
                <Input {...register('model')} />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t('form.year')} error={t(errors.year?.message ?? '')}>
                <Input type="number" {...register('year')} />
              </Field>
              <Field label={t('form.status')} error={t(errors.status?.message ?? '')}>
                <Select {...register('status')}>
                  <option value="active">{t('form.vehicleStatus.active')}</option>
                  <option value="maintenance">{t('form.vehicleStatus.maintenance')}</option>
                  <option value="broken">{t('form.vehicleStatus.broken')}</option>
                  <option value="inactive">{t('form.vehicleStatus.inactive')}</option>
                </Select>
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('form.documentExpiry')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t('form.tuvExpiry')} error={t(errors.tuv_expiry_date?.message ?? '')}>
                <Input type="date" {...register('tuv_expiry_date')} />
              </Field>
              <Field label={t('form.spExpiry')} error={t(errors.sp_expiry_date?.message ?? '')}>
                <Input type="date" {...register('sp_expiry_date')} />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t('form.insuranceExpiry')} error={t(errors.insurance_expiry_date?.message ?? '')}>
                <Input type="date" {...register('insurance_expiry_date')} />
              </Field>
              <Field label={t('form.registrationExpiry')} error={t(errors.registration_expiry_date?.message ?? '')}>
                <Input type="date" {...register('registration_expiry_date')} />
              </Field>
            </div>
            <Field label={t('form.notes')} error={t(errors.notes?.message ?? '')}>
              <Input {...register('notes')} />
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
                {t('form.saving')}
              </>
            ) : (
              t('form.saveChanges')
            )}
          </Button>
          <Button variant="outline" type="button" asChild>
            <Link href={`/vehicles/${id}`}>{t('form.cancel')}</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
