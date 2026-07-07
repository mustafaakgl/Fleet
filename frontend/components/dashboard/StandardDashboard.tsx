'use client';

import { useState } from 'react';
import { getUser } from '@/lib/auth';
import type { AuthUser } from '@/lib/types';
import { BossTrendDashboard } from './BossTrendDashboard';
import { AccountingDashboard } from './AccountingDashboard';
import { MyDashboard } from './MyDashboard';

export function StandardDashboard() {
  const [user] = useState<AuthUser | null>(() => getUser());

  if (user?.role === 'boss' || user?.role === 'admin') {
    return <BossTrendDashboard />;
  }

  if (user?.role === 'accounting') {
    return <AccountingDashboard />;
  }

  return <MyDashboard />;
}
