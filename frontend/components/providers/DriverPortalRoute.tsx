'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getPostLoginPath, getUser, isAuthenticated } from '@/lib/auth';

interface DriverPortalRouteProps {
  children: React.ReactNode;
}

export function DriverPortalRoute({ children }: DriverPortalRouteProps) {
  const router = useRouter();
  const [canRender, setCanRender] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login');
      setCanRender(false);
      return;
    }

    const user = getUser();
    if (user?.role !== 'driver') {
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
