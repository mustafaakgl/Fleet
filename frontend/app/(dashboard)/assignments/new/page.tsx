'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronLeft, Loader2, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { assignmentsApi } from '@/lib/api';

const schema = z.object({
  driver_id: z.string().uuid('Must be a valid UUID'),
  vehicle_id: z.string().uuid('Must be a valid UUID'),
  company_name: z.string().min(1, 'Required'),
  work_date: z.string().min(1, 'Required'),
  start_time: z.string().min(1, 'Required'),
  end_time: z.string().min(1, 'Required'),
  notes: z.string().optional(),
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

export default function NewAssignmentPage() {
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
      await assignmentsApi.create(data);
      router.push('/assignments');
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setServerError(
        message === 'CONFLICT'
          ? 'Conflict detected: driver or vehicle already assigned on this date.'
          : 'Failed to create assignment. Please try again.',
      );
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/assignments">
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back to Einsatzplan
        </Link>
      </Button>

      <div className="flex items-center gap-3">
        <CalendarDays className="w-6 h-6 text-green-600" />
        <h1 className="text-2xl font-bold text-gray-900">New Assignment</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assignment Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Driver ID *" error={errors.driver_id?.message}>
                <Input {...register('driver_id')} placeholder="UUID of the driver" />
              </Field>
              <Field label="Vehicle ID *" error={errors.vehicle_id?.message}>
                <Input {...register('vehicle_id')} placeholder="UUID of the vehicle" />
              </Field>
            </div>
            <Field label="Company Name *" error={errors.company_name?.message}>
              <Input {...register('company_name')} placeholder="e.g. DHL" />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Work Date *" error={errors.work_date?.message}>
                <Input type="date" {...register('work_date')} />
              </Field>
              <Field label="Start Time *" error={errors.start_time?.message}>
                <Input type="time" {...register('start_time')} />
              </Field>
              <Field label="End Time *" error={errors.end_time?.message}>
                <Input type="time" {...register('end_time')} />
              </Field>
            </div>
            <Field label="Notes" error={errors.notes?.message}>
              <Input {...register('notes')} placeholder="Optional notes..." />
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
                Creating...
              </>
            ) : (
              'Create Assignment'
            )}
          </Button>
          <Button variant="outline" type="button" asChild>
            <Link href="/assignments">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
