'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronLeft, Loader2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { driversApi } from '@/lib/api';

const schema = z.object({
  first_name: z.string().min(1, 'Required'),
  last_name: z.string().min(1, 'Required'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  license_number: z.string().optional(),
  license_expiry_date: z.string().optional(),
  passport_number: z.string().optional(),
  passport_expiry_date: z.string().optional(),
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
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    setServerError(null);
    try {
      const driver = await driversApi.create(data);
      router.push(`/drivers/${driver.id}`);
    } catch {
      setServerError('Failed to create driver. Please try again.');
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Back */}
      <Button variant="ghost" size="sm" asChild>
        <Link href="/drivers">
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back to Drivers
        </Link>
      </Button>

      <div className="flex items-center gap-3">
        <UserPlus className="w-6 h-6 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900">Add New Driver</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Personal Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FieldGroup>
              <Field label="First Name *" error={errors.first_name?.message}>
                <Input {...register('first_name')} placeholder="Ali" />
              </Field>
              <Field label="Last Name *" error={errors.last_name?.message}>
                <Input {...register('last_name')} placeholder="Yilmaz" />
              </Field>
            </FieldGroup>
            <FieldGroup>
              <Field label="Email" error={errors.email?.message}>
                <Input type="email" {...register('email')} placeholder="ali@example.com" />
              </Field>
              <Field label="Phone" error={errors.phone?.message}>
                <Input {...register('phone')} placeholder="+49 123 456 789" />
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        {/* Documents */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Documents</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FieldGroup>
              <Field label="License Number" error={errors.license_number?.message}>
                <Input {...register('license_number')} placeholder="B123456" />
              </Field>
              <Field label="License Expiry Date" error={errors.license_expiry_date?.message}>
                <Input type="date" {...register('license_expiry_date')} />
              </Field>
            </FieldGroup>
            <FieldGroup>
              <Field label="Passport Number" error={errors.passport_number?.message}>
                <Input {...register('passport_number')} placeholder="P123456" />
              </Field>
              <Field label="Passport Expiry Date" error={errors.passport_expiry_date?.message}>
                <Input type="date" {...register('passport_expiry_date')} />
              </Field>
            </FieldGroup>
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
              'Create Driver'
            )}
          </Button>
          <Button variant="outline" type="button" asChild>
            <Link href="/drivers">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
