'use client';

import { Settings } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getUser } from '@/lib/auth';
import { useEffect, useState } from 'react';
import type { AuthUser } from '@/lib/types';

export default function SettingsPage() {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setUser(getUser());
  }, []);

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Settings className="w-6 h-6 text-gray-600" />
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current User</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4">
            {[
              { label: 'Name', value: user?.name },
              { label: 'Email', value: user?.email },
              { label: 'Role', value: user?.role?.replace('_', ' ') },
              { label: 'Department', value: user?.department },
            ].map(({ label, value }) => (
              <div key={label}>
                <dt className="text-xs text-gray-500 uppercase tracking-wide font-medium">{label}</dt>
                <dd className="mt-1 text-sm text-gray-900 capitalize">{value ?? '—'}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">System Info</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">
            Fleet Management System · MVP Phase 1
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Backend: {process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
