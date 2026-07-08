'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getPostLoginPath, getUser, isAuthenticated } from '@/lib/auth';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [canRender, setCanRender] = useState(false);

  const allowDevLiveTrackingPreview =
    process.env.NODE_ENV !== 'production' && pathname === '/live-tracking';

  useEffect(() => {
    if (!isAuthenticated()) {
      if (allowDevLiveTrackingPreview) {
        setCanRender(true);
        return;
      }

      router.replace('/login');
      setCanRender(false);
      return;
    }

    const user = getUser();
    if (user?.role === 'customer' || user?.role === 'driver') {
      router.replace(getPostLoginPath(user.role));
      setCanRender(false);
      return;
    }

    setCanRender(true);
  }, [allowDevLiveTrackingPreview, router]);

  if (!canRender) {
    return null;
  }

  return <>{children}</>;
}
