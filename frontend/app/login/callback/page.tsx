'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { authApi } from '@/lib/api';
import { getPostLoginPath, saveAuth } from '@/lib/auth';

function LoginCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    if (!code) {
      setError(t('auth.sso.missingToken'));
      return;
    }

    authApi
      .oidcExchange(code)
      .then((res) => {
        if (res.mfa_required && res.mfa_token) {
          router.replace(`/login?mfa_token=${encodeURIComponent(res.mfa_token)}`);
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
        router.replace(getPostLoginPath(res.user.role));
      })
      .catch(() => {
        setError(t('auth.sso.callbackError'));
      });
  }, [router, searchParams, t]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <p className="text-sm text-rose-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-sm text-slate-600">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      {t('auth.sso.completing')}
    </div>
  );
}

export default function LoginCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center p-6 text-sm text-slate-600">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        </div>
      }
    >
      <LoginCallbackContent />
    </Suspense>
  );
}
