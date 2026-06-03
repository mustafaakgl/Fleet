'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getPostLoginPath, getUser, isAuthenticated } from '@/lib/auth';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const router = useRouter();
  const [canRender, setCanRender] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login');
      setCanRender(false);
      return;
    }

    const user = getUser();
    if (user?.role === 'customer') {
      router.replace(getPostLoginPath('customer'));
      setCanRender(false);
      return;
    }

    setCanRender(true);
  }, [router]);

  if (!canRender) {
    return null;
  }

  return <>{children}</>;
}
