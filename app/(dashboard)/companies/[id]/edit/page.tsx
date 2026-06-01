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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { companiesApi } from '@/lib/api';

const schema = z.object({
  name: z.string().min(1, 'Required'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  contact_person: z.string().optional(),
  default_daily_revenue: z
    .union([z.string().length(0), z.coerce.number().min(0)])
    .optional(),
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
  return 'Failed to update company. Please try again.';
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

export default function EditCompanyPage({ params }: { params: Promise<{ id: string }> }) {
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
    companiesApi
      .getById(id)
      .then((c) => {
        reset({
          name: c.name,
          email: c.email ?? '',
          phone: c.phone ?? '',
          address: c.address ?? '',
          contact_person: c.contact_person ?? '',
          default_daily_revenue: c.default_daily_revenue ?? undefined,
          notes: c.notes ?? '',
        });
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id, reset]);

  async function onSubmit(data: FormData) {
    setServerError(null);
    try {
      const payload = blankToUndefined(data);
      await companiesApi.update(id, payload as Record<string, unknown>);
      router.push(`/companies/${id}`);
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
        <p className="text-lg text-gray-500">Company not found.</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/companies">Back</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/companies/${id}`}>
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back
        </Link>
      </Button>

      <div className="flex items-center gap-3">
        <Pencil className="w-6 h-6 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900">Edit Company</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Company Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Name *" error={errors.name?.message}>
              <Input {...register('name')} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Email" error={errors.email?.message}>
                <Input type="email" {...register('email')} />
              </Field>
              <Field label="Phone" error={errors.phone?.message}>
                <Input {...register('phone')} />
              </Field>
            </div>
            <Field label="Address" error={errors.address?.message}>
              <Input {...register('address')} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Contact Person" error={errors.contact_person?.message}>
                <Input {...register('contact_person')} />
              </Field>
              <Field label="Default Daily Revenue (€)" error={errors.default_daily_revenue?.message}>
                <Input type="number" step="0.01" {...register('default_daily_revenue')} />
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
            <Link href={`/companies/${id}`}>Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
