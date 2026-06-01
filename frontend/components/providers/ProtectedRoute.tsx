'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/drivers',
  '/vehicles',
  '/companies',
  '/documents',
  '/requests',
  '/assignments',
  '/messenger',
];

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [canRender, setCanRender] = useState(false);

  useEffect(() => {
    const needsProtection = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
    if (!needsProtection) {
      setCanRender(true);
      return;
    }

    if (!isAuthenticated()) {
      router.replace('/login');
      setCanRender(false);
      return;
    }

    setCanRender(true);
  }, [pathname, router]);

  if (!canRender) {
    return null;
  }

  return <>{children}</>;
}
