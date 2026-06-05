'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { authApi } from '@/lib/api';
import { isPasswordStrong } from '@/lib/password-policy';

function buildSchema(t: (key: string) => string) {
  return z
    .object({
      password: z
        .string()
        .min(1, t('auth.passwordPolicy.required'))
        .refine(isPasswordStrong, t('auth.passwordPolicy.weak')),
      confirmPassword: z.string().min(1, t('auth.passwordPolicy.confirmRequired')),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t('auth.passwordPolicy.mismatch'),
      path: ['confirmPassword'],
    });
}

type FormData = z.infer<ReturnType<typeof buildSchema>>;

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const token = searchParams.get('token')?.trim() ?? '';

  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const schema = buildSchema(t);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (!token) {
      setValidating(false);
      setTokenValid(false);
      return;
    }

    authApi
      .validatePasswordReset(token)
      .then((result) => {
        setTokenValid(result.valid);
        setUserEmail(result.email ?? null);
      })
      .catch(() => setTokenValid(false))
      .finally(() => setValidating(false));
  }, [token]);

  async function onSubmit(data: FormData) {
    setError(null);
    try {
      await authApi.confirmPasswordReset(token, data.password);
      setSuccess(true);
      window.setTimeout(() => router.replace('/login'), 2500);
    } catch (err) {
      if (err instanceof AxiosError) {
        const message = (err.response?.data as { message?: string | string[] } | undefined)?.message;
        setError(Array.isArray(message) ? message.join(' ') : message || t('auth.reset.error'));
        return;
      }
      setError(t('auth.reset.error'));
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4 text-center">
          <div className="flex justify-center">
            <MyFleetLogo className="h-10 w-auto" />
          </div>
          <CardTitle>{t('auth.reset.title')}</CardTitle>
          <CardDescription>{t('auth.reset.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          {validating ? (
            <div className="flex items-center justify-center py-8 text-sm text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('auth.reset.validating')}
            </div>
          ) : !tokenValid ? (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {t('auth.reset.invalidToken')}
            </p>
          ) : success ? (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {t('auth.reset.success')}
            </p>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {userEmail ? (
                <p className="text-sm text-slate-600">
                  {t('auth.reset.forUser', { email: userEmail })}
                </p>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="password">{t('auth.reset.newPassword')}</Label>
                <Input id="password" type="password" autoComplete="new-password" {...register('password')} />
                {errors.password ? (
                  <p className="text-xs text-rose-600">{errors.password.message}</p>
                ) : (
                  <p className="text-xs text-slate-500">{t('auth.passwordPolicy.hint')}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t('auth.reset.confirmPassword')}</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  {...register('confirmPassword')}
                />
                {errors.confirmPassword ? (
                  <p className="text-xs text-rose-600">{errors.confirmPassword.message}</p>
                ) : null}
              </div>

              {error ? (
                <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {error}
                </p>
              ) : null}

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('auth.reset.saving')}
                  </>
                ) : (
                  t('auth.reset.submit')
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
