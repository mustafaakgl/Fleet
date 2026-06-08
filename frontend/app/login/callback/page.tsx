'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { authApi } from '@/lib/api';
import { getPostLoginPath, saveAuth } from '@/lib/auth';

export default function LoginCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get('access_token');
    if (!token) {
      setError(t('auth.sso.missingToken'));
      return;
    }

    authApi
      .meWithToken(token)
      .then((user) => {
        saveAuth(token, {
          ...user,
          name: user.name ?? user.email,
        });
        router.replace(getPostLoginPath(user.role));
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
