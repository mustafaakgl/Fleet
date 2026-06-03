'use client';

import { CustomerPortalRoute } from '@/components/providers/CustomerPortalRoute';

export default function CustomerPortalLayout({ children }: { children: React.ReactNode }) {
  return <CustomerPortalRoute>{children}</CustomerPortalRoute>;
}
