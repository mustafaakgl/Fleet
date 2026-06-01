'use client';

import { AppShell } from '@/components/layout/AppShell';
import { ProtectedRoute } from '@/components/providers/ProtectedRoute';
import { FleetDataProvider } from '@/context/FleetDataContext';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <FleetDataProvider>
        <AppShell>{children}</AppShell>
      </FleetDataProvider>
    </ProtectedRoute>
  );
}
