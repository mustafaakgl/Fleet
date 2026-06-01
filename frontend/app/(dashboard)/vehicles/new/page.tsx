'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronLeft, Loader2, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { vehiclesApi } from '@/lib/api';
import type { Vehicle } from '@/lib/types';

const schema = z.object({
  plate_number: z.string().min(1, 'Required'),
  brand: z.string().min(1, 'Required'),
  model: z.string().min(1, 'Required'),
  year: z.string().optional(),
  tuv_expiry_date: z.string().optional(),
  sp_expiry_date: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function NewVehiclePage() {
  const router = useRouter();
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
      const payload: Partial<Vehicle> = {
        plate_number: data.plate_number,
        brand: data.brand,
        model: data.model,
        year: data.year ? Number(data.year) : undefined,
        tuv_expiry_date: data.tuv_expiry_date || undefined,
        sp_expiry_date: data.sp_expiry_date || undefined,
      };

      const vehicle = await vehiclesApi.create(payload);
      router.push(`/vehicles/${vehicle.id}`);
    } catch {
      setServerError('Failed to create vehicle. Please try again.');
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/vehicles">
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back to Vehicles
        </Link>
      </Button>

      <div className="flex items-center gap-3">
        <Truck className="w-6 h-6 text-purple-600" />
        <h1 className="text-2xl font-bold text-gray-900">Add New Vehicle</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vehicle Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Plate Number *" error={errors.plate_number?.message}>
                <Input {...register('plate_number')} placeholder="B-AB-1234" />
              </Field>
              <Field label="Year" error={errors.year?.message}>
                <Input type="number" {...register('year')} placeholder="2021" />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Brand *" error={errors.brand?.message}>
                <Input {...register('brand')} placeholder="Mercedes" />
              </Field>
              <Field label="Model *" error={errors.model?.message}>
                <Input {...register('model')} placeholder="Actros" />
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Inspection Dates</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="TÜV Expiry Date" error={errors.tuv_expiry_date?.message}>
                <Input type="date" {...register('tuv_expiry_date')} />
              </Field>
              <Field label="SP Expiry Date" error={errors.sp_expiry_date?.message}>
                <Input type="date" {...register('sp_expiry_date')} />
              </Field>
            </div>
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
                Creating...
              </>
            ) : (
              'Create Vehicle'
            )}
          </Button>
          <Button variant="outline" type="button" asChild>
            <Link href="/vehicles">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
