'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { isAxiosError } from 'axios';
import { ChevronLeft, Loader2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { vehiclesApi } from '@/lib/api';

const schema = z.object({
  plate_number: z.string().min(1, 'Required'),
  brand: z.string().min(1, 'Required'),
  model: z.string().min(1, 'Required'),
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

function extractServerError(e: unknown): string {
  if (isAxiosError(e)) {
    const data = e.response?.data as { message?: string | string[] } | undefined;
    if (data?.message) {
      return Array.isArray(data.message) ? data.message.join('. ') : data.message;
    }
  }
  return 'Failed to update vehicle. Please try again.';
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
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

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
      setServerError(extractServerError(e));
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
        <p className="text-lg text-gray-500">Vehicle not found.</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/vehicles">Back</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/vehicles/${id}`}>
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back
        </Link>
      </Button>

      <div className="flex items-center gap-3">
        <Pencil className="w-6 h-6 text-purple-600" />
        <h1 className="text-2xl font-bold text-gray-900">Edit Vehicle</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vehicle Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Plate Number *" error={errors.plate_number?.message}>
                <Input {...register('plate_number')} />
              </Field>
              <Field label="VIN" error={errors.vin?.message}>
                <Input {...register('vin')} />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Brand *" error={errors.brand?.message}>
                <Input {...register('brand')} />
              </Field>
              <Field label="Model *" error={errors.model?.message}>
                <Input {...register('model')} />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Year" error={errors.year?.message}>
                <Input type="number" {...register('year')} />
              </Field>
              <Field label="Status" error={errors.status?.message}>
                <Select {...register('status')}>
                  <option value="active">Active</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="broken">Broken</option>
                  <option value="inactive">Inactive</option>
                </Select>
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Document Expiry</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="TÜV Expiry" error={errors.tuv_expiry_date?.message}>
                <Input type="date" {...register('tuv_expiry_date')} />
              </Field>
              <Field label="SP Expiry" error={errors.sp_expiry_date?.message}>
                <Input type="date" {...register('sp_expiry_date')} />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Insurance Expiry" error={errors.insurance_expiry_date?.message}>
                <Input type="date" {...register('insurance_expiry_date')} />
              </Field>
              <Field label="Registration Expiry" error={errors.registration_expiry_date?.message}>
                <Input type="date" {...register('registration_expiry_date')} />
              </Field>
            </div>
            <Field label="Notes" error={errors.notes?.message}>
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
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
          <Button variant="outline" type="button" asChild>
            <Link href={`/vehicles/${id}`}>Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
