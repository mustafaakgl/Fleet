'use client';

import { useState } from 'react';
import { getUser } from '@/lib/auth';
import { OfficeBriefingDashboard } from '@/components/dashboard/OfficeBriefingDashboard';
import { StandardDashboard } from '@/components/dashboard/StandardDashboard';
import type { AuthUser } from '@/lib/types';

export default function DashboardPage() {
  const [user] = useState<AuthUser | null>(() => getUser());
  const isOffice = user?.role === 'office';

  if (isOffice) {
    return <OfficeBriefingDashboard />;
  }

  return <StandardDashboard />;
}
