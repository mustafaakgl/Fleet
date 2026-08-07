'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DriverAssignmentsPanel } from '@/components/driver-portal/DriverAssignmentsPanel';
import {
  DriverBlockingTaskLink,
  DriverNowCard,
  DriverNowCardSkeleton,
} from '@/components/driver-portal/DriverNowCard';
import { DriverPendingTasksCard } from '@/components/driver-portal/DriverPendingTasksCard';
import { DriverPortalShell } from '@/components/driver-portal/DriverPortalShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { driverPortalApi } from '@/lib/api';
import { resolveDriverDayPhase, type DriverDayPhase } from '@/lib/driver-day-phase';
import { driverTodayIso } from '@/lib/driver-portal-utils';
import type { DriverPortalAssignment } from '@/lib/types';

/**
 * The driver's home answers one question: what should I do right now.
 *
 * It used to stack every capability at equal weight — work session, check-in,
 * handover, location sharing, unread counters, a quick-action grid — with the
 * day's actual assignment seventh down the page. The day phase now decides, and
 * everything else is demoted to context.
 */
export default function DriverPortalHomePage() {
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [driverName, setDriverName] = useState<string | null>(null);
  const [assignment, setAssignment] = useState<DriverPortalAssignment | null>(null);
  const [handover, setHandover] = useState<{ assignmentId: string; vehicleId: string } | null>(null);
  const [equipmentIssuanceId, setEquipmentIssuanceId] = useState<string | null>(null);
  const [morningCheckinDone, setMorningCheckinDone] = useState(false);
  const [workSessionActive, setWorkSessionActive] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const today = driverTodayIso();
    const results = await Promise.allSettled([
      driverPortalApi.me(),
      driverPortalApi.todayAssignments(today),
      driverPortalApi.listHandovers({ date: today, photoStatus: 'missing' }),
      driverPortalApi.listEquipmentIssuances(),
      driverPortalApi.listMorningCheckins(today),
      driverPortalApi.getCurrentWorkSession(),
    ]);
    const [profile, assignments, handovers, equipment, checkins, session] = results;

    if (profile.status === 'fulfilled') {
      setDriverName(profile.value.driver.firstName);
    }

    if (assignments.status === 'fulfilled') {
      // The office may plan several; the one still open is the one to act on.
      const open = assignments.value.find(
        (row) => row.status !== 'completed' && row.status !== 'cancelled',
      );
      setAssignment(open ?? assignments.value[0] ?? null);
    }

    if (handovers.status === 'fulfilled') {
      const pending = handovers.value.find((row) => row.photoRequired && row.status !== 'completed');
      setHandover(
        pending?.assignmentId && pending.vehicleId
          ? { assignmentId: pending.assignmentId, vehicleId: pending.vehicleId }
          : null,
      );
    }

    if (equipment.status === 'fulfilled') {
      setEquipmentIssuanceId(equipment.value.find((row) => row.status === 'pending_signature')?.id ?? null);
    }

    if (checkins.status === 'fulfilled') {
      setMorningCheckinDone(checkins.value.length > 0);
    }

    if (session.status === 'fulfilled') {
      setWorkSessionActive(session.value.active);
    }

    // Only the two reads the phase depends on are worth alarming about; a failed
    // counter should not put a red box above the driver's actual task.
    const critical = assignments.status === 'rejected' || session.status === 'rejected';
    setLoadError(critical ? t('driverPortal.home.loadErrorSummary') : null);
    setLoading(false);
  }, [t]);

  useEffect(() => {
    let active = true;
    void load().catch(() => {
      if (active) {
        setLoadError(t('driverPortal.home.loadErrorSummary'));
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [load, t]);

  /**
   * Opens the working day. The work session starts from this action rather than
   * its own button, and today's check-in is filled from the assignment the office
   * already planned, so the driver is not asked to retype what the system knows.
   */
  const handleStartDay = useCallback(async () => {
    setStarting(true);
    setActionError(null);
    try {
      if (!workSessionActive) {
        await driverPortalApi.startWorkSession();
      }
      if (!morningCheckinDone && assignment) {
        await driverPortalApi.createMorningCheckin({
          date: driverTodayIso(),
          vehiclePlate: assignment.vehicle.plateNumber,
          companyName: assignment.company.name,
          cargoName: assignment.cargoName || undefined,
        });
      }
      await load();
    } catch {
      setActionError(t('driverPortal.now.startFailed'));
    } finally {
      setStarting(false);
    }
  }, [assignment, load, morningCheckinDone, t, workSessionActive]);

  const phase: DriverDayPhase = resolveDriverDayPhase({
    assignmentStatus: assignment?.status ?? null,
    // No page for the vehicle check yet (plan step 4); leaving this null keeps the
    // gate out of the way instead of parking the driver on a dead end.
    departureCheckDone: null,
    morningCheckinDone,
    handoverPhotosPending: handover !== null,
    workSessionActive,
  });

  const todayLabel = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  return (
    <DriverPortalShell>
      <div className="space-y-4">
        <div>
          <p className="text-base font-semibold text-slate-900">
            {t('driverPortal.greeting', { name: driverName ?? t('driverPortal.driver') })}
          </p>
          <p className="text-sm text-slate-600">{todayLabel}</p>
        </div>

        {loadError ? (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <p className="text-sm font-medium text-slate-900">{loadError}</p>
              <Button type="button" variant="outline" onClick={() => window.location.reload()}>
                {t('common.retry')}
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {loading ? (
          <DriverNowCardSkeleton />
        ) : (
          <DriverNowCard
            phase={phase}
            assignment={assignment}
            handover={handover}
            starting={starting}
            onStartDay={handleStartDay}
          />
        )}

        {actionError ? <p className="text-sm text-red-700">{actionError}</p> : null}

        {equipmentIssuanceId ? <DriverBlockingTaskLink equipmentIssuanceId={equipmentIssuanceId} /> : null}

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-900">{t('driverPortal.now.todaySection')}</h2>
          <DriverAssignmentsPanel />
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-900">{t('driverPortal.now.pendingSection')}</h2>
          <DriverPendingTasksCard />
          <Link
            href="/driver/requests"
            className="flex min-h-11 items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900"
          >
            {t('driverPortal.home.openRequests')}
            <span className="text-slate-400">→</span>
          </Link>
        </section>
      </div>
    </DriverPortalShell>
  );
}
