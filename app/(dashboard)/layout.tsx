'use client';

import { AppShell } from '@/components/layout/AppShell';
import { FleetDataProvider } from '@/context/FleetDataContext';
import { isAuthenticated } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [canRender, setCanRender] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login');
      setCanRender(false);
      return;
    }

    setCanRender(true);
  }, [router]);

  if (!canRender) {
    return null;
  }

  return (
    <FleetDataProvider>
      <AppShell>{children}</AppShell>
    </FleetDataProvider>
  );
}
