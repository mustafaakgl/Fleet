'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isValidDateParam(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function usePlanningDate(defaultDate?: string) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const today = useMemo(() => formatLocalDate(new Date()), []);
  const planningDate = isValidDateParam(searchParams.get('date'))
    ? searchParams.get('date')!
    : defaultDate ?? today;

  const setPlanningDate = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === today) {
        params.delete('date');
      } else {
        params.set('date', next);
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams, today],
  );

  const shiftPlanningDate = useCallback(
    (days: number) => {
      const base = new Date(`${planningDate}T12:00:00`);
      base.setDate(base.getDate() + days);
      setPlanningDate(formatLocalDate(base));
    },
    [planningDate, setPlanningDate],
  );

  return { planningDate, today, setPlanningDate, shiftPlanningDate, isToday: planningDate === today };
}
