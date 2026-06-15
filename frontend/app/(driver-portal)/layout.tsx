'use client';

import { useEffect } from 'react';
import { DriverPortalRoute } from '@/components/providers/DriverPortalRoute';
import { driverPortalApi } from '@/lib/api';
import { isFeierabendPausedToday } from '@/lib/work-session-feierabend';

export default function DriverPortalLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (isFeierabendPausedToday()) {
      return;
    }
    void driverPortalApi.startWorkSession().catch(() => undefined);
    return () => {
      void driverPortalApi.endWorkSession('app_background').catch(() => undefined);
    };
  }, []);

  return <DriverPortalRoute>{children}</DriverPortalRoute>;
}
