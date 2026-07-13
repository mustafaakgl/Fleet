'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { DriverPortalRoute } from '@/components/providers/DriverPortalRoute';
import { driverPortalApi } from '@/lib/api';
import { isFeierabendPausedToday } from '@/lib/work-session-feierabend';

export default function DriverPortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isFeierabendPausedToday()) {
      return;
    }
    let active = true;

    const syncCurrentSession = async () => {
      try {
        const current = await driverPortalApi.getCurrentWorkSession();
        if (!active) {
          return;
        }
        if (current.active && current.needsReconciliation && pathname !== '/driver/work-session/reconcile') {
          router.replace(`/driver/work-session/reconcile?sessionId=${current.session?.id ?? ''}`);
        }
      } catch {
        // Shell should stay usable even when the work-session read model fails.
      }
    };

    void syncCurrentSession();

    const heartbeat = () => {
      if (document.visibilityState === 'visible') {
        void driverPortalApi.heartbeatWorkSession().catch(() => undefined);
      }
    };

    const onVisibilityChange = () => {
      heartbeat();
    };

    const timer = window.setInterval(heartbeat, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [pathname, router]);

  return <DriverPortalRoute>{children}</DriverPortalRoute>;
}
