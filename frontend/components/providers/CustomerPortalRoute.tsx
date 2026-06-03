'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getPostLoginPath, getUser, isAuthenticated } from '@/lib/auth';

interface CustomerPortalRouteProps {
  children: React.ReactNode;
}

export function CustomerPortalRoute({ children }: CustomerPortalRouteProps) {
  const router = useRouter();
  const [canRender, setCanRender] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login');
      setCanRender(false);
      return;
    }

    const user = getUser();
    if (user?.role !== 'customer') {
      router.replace(getPostLoginPath(user?.role ?? 'office'));
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
