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
import { authApi, onboardingApi } from '@/lib/api';
import { isAuthenticated, saveAuth, MOCK_CURRENT_USER, getPostLoginPath, getUser } from '@/lib/auth';

const schema = z.object({
  email: z.string().email('auth.errors.invalidEmail'),
  password: z.string().min(1, 'auth.errors.passwordRequired'),
});

type FormData = z.infer<typeof schema>;

const isDev = process.env.NODE_ENV !== 'production';

export default function LoginPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaSubmitting, setMfaSubmitting] = useState(false);
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [ssoLabel, setSsoLabel] = useState('Sign in with SSO');

  useEffect(() => {
    if (isAuthenticated()) {
      const user = getUser();
      router.replace(getPostLoginPath(user?.role ?? 'office'));
      return;
    }

    onboardingApi
      .status()
      .then((status) => {
        if (status.needs_setup) {
          router.replace('/onboarding');
        }
      })
      .catch(() => {
        // Backend unavailable — stay on login.
      });

    authApi
      .oidcConfig()
      .then((config) => {
        setSsoEnabled(config.enabled);
        setSsoLabel(config.label);
      })
      .catch(() => {
        setSsoEnabled(false);
      });
  }, [router]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormData) {
    setError(null);
    try {
      const email = data.email.trim().toLowerCase();
      const res = await authApi.signIn(email, data.password);
      if (res.mfa_required && res.mfa_token) {
        setMfaToken(res.mfa_token);
        return;
      }
      const token = res.accessToken ?? res.access_token;
      if (!token || !res.user) {
        setError(t('auth.errors.noToken'));
        return;
      }
      saveAuth(token, {
        ...res.user,
        name: res.user.name ?? res.user.email,
      });
      router.push(getPostLoginPath(res.user.role));
    } catch (err) {
      if (err instanceof AxiosError) {
        if (!err.response) {
          setError(t('auth.errors.backendUnreachable'));
          return;
        }
        if (err.response.status === 401) {
          setError(t('auth.errors.invalidCredentials'));
          return;
        }
        if (err.response.status === 429) {
          setError(t('auth.errors.tooManyAttempts'));
          return;
        }
      }
      setError(t('auth.errors.unexpected'));
    }
  }

  async function onSubmitMfa() {
    if (!mfaToken || mfaCode.length !== 6) return;
    setError(null);
    setMfaSubmitting(true);
    try {
      const res = await authApi.verifyMfaLogin(mfaToken, mfaCode);
      const token = res.accessToken ?? res.access_token;
      if (!token || !res.user) {
        setError(t('auth.errors.noToken'));
        return;
      }
      saveAuth(token, {
        ...res.user,
        name: res.user.name ?? res.user.email,
      });
      router.push(getPostLoginPath(res.user.role));
    } catch (err) {
      if (err instanceof AxiosError && err.response?.status === 401) {
        setError(t('auth.mfa.invalidCode'));
        return;
      }
      setError(t('auth.errors.unexpected'));
    } finally {
      setMfaSubmitting(false);
    }
  }

  function handleDemoLogin() {
    saveAuth('dev-demo-token', { ...MOCK_CURRENT_USER, role: 'admin', name: 'Demo Admin' });
    router.push('/dashboard');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <MyFleetLogo height={72} href={null} priority />
          <p className="text-gray-500 text-sm mt-4">{t('auth.adminPanel')}</p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle>{mfaToken ? t('auth.mfa.title') : t('auth.signIn')}</CardTitle>
            <CardDescription>
              {mfaToken ? t('auth.mfa.description') : t('auth.signInDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {mfaToken ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="mfa-code">{t('auth.mfa.codeLabel')}</Label>
                  <Input
                    id="mfa-code"
                    inputMode="numeric"
                    maxLength={6}
                    autoComplete="one-time-code"
                    value={mfaCode}
                    onChange={(event) =>
                      setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    placeholder="123456"
                  />
                </div>
                {error ? (
                  <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                ) : null}
                <Button
                  type="button"
                  className="w-full"
                  disabled={mfaSubmitting || mfaCode.length !== 6}
                  onClick={() => void onSubmitMfa()}
                >
                  {mfaSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('auth.mfa.verifying')}
                    </>
                  ) : (
                    t('auth.mfa.verify')
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setMfaToken(null);
                    setMfaCode('');
                    setError(null);
                  }}
                >
                  {t('auth.mfa.back')}
                </Button>
              </div>
            ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">{t('auth.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@fleet.com"
                  autoComplete="email"
                  {...register('email')}
                />
                {errors.email && (
                  <p className="text-xs text-red-600">{t(errors.email.message ?? '')}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">{t('auth.password')}</Label>
                  <a href="/forgot-password" className="text-xs text-blue-700 hover:underline">
                    {t('auth.forgotPassword.link')}
                  </a>
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  {...register('password')}
                />
                {errors.password && (
                  <p className="text-xs text-red-600">{t(errors.password.message ?? '')}</p>
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
                    {t('auth.signingIn')}
                  </>
                ) : (
                  t('auth.signIn')
                )}
              </Button>

              {ssoEnabled ? (
                <>
                  <div className="relative py-2">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-gray-200" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-white px-2 text-gray-500">{t('auth.sso.or')}</span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      window.location.href = authApi.oidcLoginUrl();
                    }}
                  >
                    {ssoLabel}
                  </Button>
                </>
              ) : null}
            </form>
            )}

            {!mfaToken && isDev && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full mt-3"
                  onClick={handleDemoLogin}
                >
                  Demo login (no backend)
                </Button>

                <div className="mt-6 pt-4 border-t border-gray-100">
                  <p className="text-xs text-gray-500 text-center mb-2">Test credentials (dev only)</p>
                  <div className="grid grid-cols-1 gap-2 text-xs text-gray-600">
                    <div className="bg-gray-50 rounded-md px-2 py-1.5 text-center">
                      <p className="font-medium">Admin</p>
                      <p>admin@fleet.com</p>
                      <p className="text-gray-400">admin123</p>
                    </div>
                    <div className="bg-gray-50 rounded-md px-2 py-1.5 text-center">
                      <p className="font-medium">Customer (DHL)</p>
                      <p>dhl.customer@fleet.com</p>
                      <p className="text-gray-400">customer123</p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-xs text-gray-500">
          <a href="/datenschutz" className="text-blue-700 hover:underline">
            {t('nav.privacy')}
          </a>
        </p>
      </div>
    </div>
  );
}
