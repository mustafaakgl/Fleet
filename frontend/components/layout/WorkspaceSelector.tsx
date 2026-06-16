'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getUser } from '@/lib/auth';
import { onboardingApi } from '@/lib/api';
import type { AuthUser } from '@/lib/types';

function resolveWorkspaceLabel(user: AuthUser | null, tenantName: string | null) {
  if (tenantName?.trim()) return tenantName.trim();
  if (user?.companies?.[0]?.name?.trim()) return user.companies[0].name.trim();
  return 'Operion';
}

export function WorkspaceSelector() {
  const { t } = useTranslation();
  const [user] = useState<AuthUser | null>(() => getUser());
  const [tenantName, setTenantName] = useState<string | null>(null);
  const workspaceLabel = useMemo(() => resolveWorkspaceLabel(user, tenantName), [tenantName, user]);

  useEffect(() => {
    let cancelled = false;
    onboardingApi.getTenant().then((tenant) => {
      if (!cancelled) setTenantName(tenant.name ?? null);
    }).catch(() => { if (!cancelled) setTenantName(null); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="flex min-w-0 max-w-[10rem] items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 sm:max-w-[12rem]" title={workspaceLabel}>
      <span className="truncate text-sm font-semibold text-gray-900">{workspaceLabel}</span>
      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
      <span className="sr-only">{t('accountMenu.workspace')}</span>
    </div>
  );
}
