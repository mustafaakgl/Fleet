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
import { invitationsApi } from '@/lib/api';
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

export default function AcceptInvitePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const token = searchParams.get('token')?.trim() ?? '';

  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
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
      return;
    }

    invitationsApi
      .validate(token)
      .then((result) => {
        setTokenValid(result.valid);
        if (result.valid) {
          setUserEmail(result.email ?? null);
          setUserName(result.full_name ?? null);
        }
      })
      .catch(() => setTokenValid(false))
      .finally(() => setValidating(false));
  }, [token]);

  async function onSubmit(data: FormData) {
    setError(null);
    try {
      await invitationsApi.accept(token, data.password);
      setSuccess(true);
      window.setTimeout(() => router.replace('/login'), 2000);
    } catch (err) {
      const axiosErr = err as AxiosError<{ message?: string | string[] }>;
      const message = axiosErr.response?.data?.message;
      setError(Array.isArray(message) ? message.join(' ') : message || t('invite.errors.accept'));
    }
  }

  if (validating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-700" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <MyFleetLogo className="h-10" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('invite.title')}</CardTitle>
            <CardDescription>
              {tokenValid && userName
                ? t('invite.subtitleNamed', { name: userName })
                : t('invite.subtitle')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!token || !tokenValid ? (
              <p className="text-sm text-red-600">{t('invite.invalidToken')}</p>
            ) : success ? (
              <p className="text-sm text-emerald-700">{t('invite.success')}</p>
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                {userEmail && (
                  <p className="text-sm text-slate-600">
                    {t('invite.emailLabel')}: <span className="font-medium">{userEmail}</span>
                  </p>
                )}

                <div>
                  <Label htmlFor="password">{t('invite.password')}</Label>
                  <Input id="password" type="password" {...register('password')} />
                  {errors.password && (
                    <p className="text-sm text-red-600 mt-1">{errors.password.message}</p>
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
                      {t('invite.submitting')}
                    </>
                  ) : (
                    t('invite.submit')
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
