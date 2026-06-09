'use client';

import { DriverPortalRoute } from '@/components/providers/DriverPortalRoute';

export default function DriverPortalLayout({ children }: { children: React.ReactNode }) {
  return <DriverPortalRoute>{children}</DriverPortalRoute>;
}
