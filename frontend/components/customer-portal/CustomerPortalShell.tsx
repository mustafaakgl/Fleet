'use client';

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { MyFleetLogo } from '@/components/brand/MyFleetLogo';
import { Button } from '@/components/ui/button';
import { clearAuth, getUser } from '@/lib/auth';

interface CustomerPortalShellProps {
  children: React.ReactNode;
}

export function CustomerPortalShell({ children }: CustomerPortalShellProps) {
  const router = useRouter();
  const user = getUser();
  const companyLabel =
    user?.companies?.map((company) => company.name).join(', ') ??
    user?.companyId ??
    'Customer Portal';

  function handleLogout() {
    clearAuth();
    router.replace('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <MyFleetLogo height={40} href={null} />
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-blue-600">Customer Portal</p>
              <p className="truncate text-sm text-gray-600">{companyLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-gray-900">{user?.name ?? user?.email}</p>
              <p className="text-xs text-gray-500">{user?.email}</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
