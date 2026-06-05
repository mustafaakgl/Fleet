'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { AxiosError } from 'axios';
import { useTranslation } from 'react-i18next';
import { MyFleetLogo } from '@/components/brand/MyFleetLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { onboardingApi } from '@/lib/api';
import { isPasswordStrong } from '@/lib/password-policy';

function buildSchema(t: (key: string) => string) {
  return z
    .object({
      fleet_name: z.string().min(2, t('onboarding.errors.fleetName')),
      admin_full_name: z.string().min(2, t('onboarding.errors.adminName')),
      admin_email: z.string().email(t('auth.errors.invalidEmail')),
      admin_password: z
        .string()
        .min(1, t('auth.passwordPolicy.required'))
        .refine(isPasswordStrong, t('auth.passwordPolicy.weak')),
      confirmPassword: z.string().min(1, t('auth.passwordPolicy.confirmRequired')),
      contact_email: z.string().email(t('auth.errors.invalidEmail')).optional().or(z.literal('')),
    })
    .refine((data) => data.admin_password === data.confirmPassword, {
      message: t('auth.passwordPolicy.mismatch'),
      path: ['confirmPassword'],
    });
}

type FormData = z.infer<ReturnType<typeof buildSchema>>;

export default function OnboardingPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const schema = buildSchema(t);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      fleet_name: '',
      admin_full_name: '',
      admin_email: '',
      admin_password: '',
      confirmPassword: '',
      contact_email: '',
    },
  });

  useEffect(() => {
    onboardingApi
      .status()
      .then((status) => {
        if (!status.needs_setup) {
          router.replace('/login');
        }
      })
      .catch(() => {
        setError(t('onboarding.errors.status'));
      })
      .finally(() => setChecking(false));
  }, [router, t]);

  async function onSubmit(data: FormData) {
    setError(null);
    try {
      await onboardingApi.setup({
        fleet_name: data.fleet_name.trim(),
        admin_full_name: data.admin_full_name.trim(),
        admin_email: data.admin_email.trim(),
        admin_password: data.admin_password,
        contact_email: data.contact_email?.trim() || undefined,
      });
      router.replace('/login');
    } catch (err) {
      const axiosErr = err as AxiosError<{ message?: string | string[] }>;
      const message = axiosErr.response?.data?.message;
      setError(Array.isArray(message) ? message.join(' ') : message || t('onboarding.errors.setup'));
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-700" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="flex justify-center mb-6">
          <MyFleetLogo className="h-10" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('onboarding.title')}</CardTitle>
            <CardDescription>{t('onboarding.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <Label htmlFor="fleet_name">{t('onboarding.fleetName')}</Label>
                <Input id="fleet_name" {...register('fleet_name')} />
                {errors.fleet_name && (
                  <p className="text-sm text-red-600 mt-1">{errors.fleet_name.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="admin_full_name">{t('onboarding.adminName')}</Label>
                <Input id="admin_full_name" {...register('admin_full_name')} />
                {errors.admin_full_name && (
                  <p className="text-sm text-red-600 mt-1">{errors.admin_full_name.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="admin_email">{t('onboarding.adminEmail')}</Label>
                <Input id="admin_email" type="email" {...register('admin_email')} />
                {errors.admin_email && (
                  <p className="text-sm text-red-600 mt-1">{errors.admin_email.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="contact_email">{t('onboarding.contactEmail')}</Label>
                <Input id="contact_email" type="email" {...register('contact_email')} />
              </div>

              <div>
                <Label htmlFor="admin_password">{t('onboarding.adminPassword')}</Label>
                <Input id="admin_password" type="password" {...register('admin_password')} />
                {errors.admin_password && (
                  <p className="text-sm text-red-600 mt-1">{errors.admin_password.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="confirmPassword">{t('auth.reset.confirmPassword')}</Label>
                <Input id="confirmPassword" type="password" {...register('confirmPassword')} />
                {errors.confirmPassword && (
                  <p className="text-sm text-red-600 mt-1">{errors.confirmPassword.message}</p>
                )}
              </div>

              {error && (
                <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {t('onboarding.submitting')}
                  </>
                ) : (
                  t('onboarding.submit')
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
