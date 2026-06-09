'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronRight, Loader2, MapPin, Truck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { driverPortalApi } from '@/lib/api';
import { buildAssignmentRouteName } from '@/lib/address-format';
import type { DriverPortalAssignment } from '@/lib/types';
import { cn } from '@/lib/utils';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function statusClass(status: string): string {
  if (status === 'in_progress') return 'bg-emerald-50 text-emerald-700';
  if (status === 'confirmed') return 'bg-blue-50 text-blue-700';
  if (status === 'completed') return 'bg-slate-100 text-slate-600';
  return 'bg-amber-50 text-amber-700';
}

export function DriverAssignmentsPanel() {
  const { t } = useTranslation();
  const [assignments, setAssignments] = useState<DriverPortalAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    driverPortalApi
      .todayAssignments(todayIso())
      .then((rows) => {
        if (!active) return;
        setAssignments(rows);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setAssignments([]);
        setError(err instanceof Error ? err.message : t('driverPortal.assignments.loadError'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [t]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Truck className="h-5 w-5 text-[#1a4d7a]" />
          {t('driverPortal.assignments.title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('driverPortal.assignments.loading')}
          </div>
        ) : error ? (
          <p className="py-4 text-sm text-red-600">{error}</p>
        ) : assignments.length === 0 ? (
          <p className="py-4 text-sm text-slate-500">{t('driverPortal.assignments.empty')}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {assignments.map((assignment) => (
              <li key={assignment.id}>
                <Link
                  href={`/driver/assignments/${assignment.id}`}
                  className="flex items-start justify-between gap-3 py-3 transition hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900">{assignment.vehicle.plateNumber}</p>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                          statusClass(assignment.status),
                        )}
                      >
                        {assignment.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-600">{assignment.company.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {assignment.startTime} – {assignment.endTime} · {assignment.cargoName}
                    </p>
                    <p className="mt-1 flex items-start gap-1 text-xs text-slate-500">
                      <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                      <span className="line-clamp-2">
                        {assignment.routeName ||
                          buildAssignmentRouteName(assignment.pickupAddress, assignment.deliveryAddress) ||
                          assignment.deliveryAddress}
                      </span>
                    </p>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
