'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight, Camera, CheckCircle2, ClipboardCheck, Loader2, Truck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DriverWorkSessionCard } from '@/components/driver-portal/DriverWorkSessionCard';
import { phaseStartsWorkSession, type DriverDayPhase } from '@/lib/driver-day-phase';
import { cn } from '@/lib/utils';
import type { DriverPortalAssignment } from '@/lib/types';

/**
 * The one thing the driver should do right now.
 *
 * Deliberately renders a single filled button. The old home offered five primary
 * actions at once and left the ordering to the driver; the phase decides here so
 * the screen does not have to argue with itself.
 *
 * The end-of-shift phase delegates to DriverWorkSessionCard rather than
 * reimplementing it — that component already owns heartbeat, reconciliation and
 * the Feierabend pause.
 */

interface DriverNowCardProps {
  phase: DriverDayPhase;
  assignment: DriverPortalAssignment | null;
  handover: { assignmentId: string; vehicleId: string } | null;
  starting: boolean;
  onStartDay: () => void;
}

/** warning = something is on you, danger = report a problem, secondary = done. */
type Tone = 'warning' | 'primary' | 'secondary' | 'neutral';

const TONE_CARD: Record<Tone, string> = {
  warning: 'border-amber-300 bg-amber-50',
  primary: 'border-blue-200 bg-blue-50',
  secondary: 'border-emerald-300 bg-emerald-50',
  neutral: 'border-slate-200 bg-white',
};

const TONE_BUTTON: Record<Tone, string> = {
  warning: 'bg-amber-600 text-white hover:bg-amber-700',
  primary: 'bg-blue-900 text-white hover:bg-blue-800',
  secondary: 'bg-emerald-600 text-white hover:bg-emerald-700',
  neutral: 'bg-blue-900 text-white hover:bg-blue-800',
};

export function DriverNowCardSkeleton() {
  // Same height as a real card so the screen does not jump when data lands.
  return (
    <Card className="border-slate-200 bg-white">
      <CardContent className="space-y-3 p-4">
        <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
        <div className="h-6 w-3/4 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
        <div className="h-12 w-full animate-pulse rounded-lg bg-slate-200" />
      </CardContent>
    </Card>
  );
}

export function DriverNowCard({ phase, assignment, handover, starting, onStartDay }: DriverNowCardProps) {
  const { t } = useTranslation();

  // The shift close keeps its own card: it owns heartbeat and reconciliation.
  if (phase === 'end_shift') {
    return <DriverWorkSessionCard />;
  }

  const context = assignment ? (
    <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      <dt className="text-slate-600">{t('driverPortal.now.vehicle')}</dt>
      <dd className="font-semibold text-slate-900">{assignment.vehicle.plateNumber}</dd>
      <dt className="text-slate-600">{t('driverPortal.now.window')}</dt>
      <dd className="font-semibold text-slate-900">
        {assignment.startTime} – {assignment.endTime}
      </dd>
      {assignment.routeName ? (
        <>
          <dt className="text-slate-600">{t('driverPortal.now.route')}</dt>
          <dd className="font-semibold text-slate-900">{assignment.routeName}</dd>
        </>
      ) : null}
    </dl>
  ) : null;

  const view: {
    tone: Tone;
    icon: typeof Truck;
    title: string;
    body: string;
    action?: { label: string; href?: string; onClick?: () => void };
    secondary?: { label: string; href: string };
  } = (() => {
    switch (phase) {
      case 'no_assignment':
        return {
          tone: 'neutral',
          icon: CheckCircle2,
          title: t('driverPortal.now.noAssignment.title'),
          body: t('driverPortal.now.noAssignment.body'),
          action: { label: t('driverPortal.now.noAssignment.action'), href: '/driver/requests' },
          secondary: { label: t('driverPortal.now.messagesLink'), href: '/driver/messages' },
        };
      case 'departure_check':
        return {
          tone: 'warning',
          icon: ClipboardCheck,
          title: t('driverPortal.now.departureCheck.title'),
          body: t('driverPortal.now.departureCheck.body'),
          action: { label: t('driverPortal.now.departureCheck.action'), href: '/driver/departure-check' },
        };
      case 'start_tour':
        return {
          tone: 'primary',
          icon: Truck,
          title: t('driverPortal.now.startTour.title'),
          body: t('driverPortal.now.startTour.body'),
          action: { label: t('driverPortal.now.startTour.action'), onClick: onStartDay },
        };
      case 'on_tour':
        return {
          tone: 'primary',
          icon: Truck,
          title: t('driverPortal.now.onTour.title'),
          body: t('driverPortal.now.onTour.body'),
          action: assignment
            ? { label: t('driverPortal.now.onTour.action'), href: `/driver/assignments/${assignment.id}` }
            : undefined,
          secondary: { label: t('driverPortal.now.reportLink'), href: '/driver/reports' },
        };
      case 'handover':
        return {
          tone: 'warning',
          icon: Camera,
          title: t('driverPortal.now.handover.title'),
          body: t('driverPortal.now.handover.body'),
          action: {
            label: t('driverPortal.now.handover.action'),
            href: handover
              ? `/driver/handover?assignmentId=${handover.assignmentId}&vehicleId=${handover.vehicleId}`
              : '/driver/handover',
          },
        };
      case 'day_closed':
      default:
        return {
          tone: 'secondary',
          icon: CheckCircle2,
          title: t('driverPortal.now.dayClosed.title'),
          body: t('driverPortal.now.dayClosed.body'),
        };
    }
  })();

  const Icon = view.icon;

  return (
    <Card className={cn('shadow-sm', TONE_CARD[view.tone])}>
      <CardContent className="p-4">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
          <Icon className="h-4 w-4" />
          {t('driverPortal.now.label')}
        </p>
        <h2 className="mt-2 text-xl font-bold leading-tight text-slate-900">{view.title}</h2>
        <p className="mt-1 text-sm text-slate-600">{view.body}</p>

        {context}

        {phaseStartsWorkSession(phase) ? (
          // The session opens from this action rather than a separate button, so
          // say it out loud — the driver must never wonder when the clock started.
          <p className="mt-3 text-xs text-slate-600">{t('driverPortal.now.sessionNotice')}</p>
        ) : null}

        {view.action ? (
          <div className="mt-4">
            {view.action.href ? (
              <Button asChild className={cn('h-12 w-full text-base font-semibold', TONE_BUTTON[view.tone])}>
                <Link href={view.action.href}>
                  {view.action.label}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            ) : (
              <Button
                type="button"
                onClick={view.action.onClick}
                disabled={starting}
                className={cn('h-12 w-full text-base font-semibold', TONE_BUTTON[view.tone])}
              >
                {starting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
                {view.action.label}
              </Button>
            )}
          </div>
        ) : null}

        {view.secondary ? (
          <div className="mt-2">
            <Button asChild variant="outline" className="h-11 w-full">
              <Link href={view.secondary.href}>{view.secondary.label}</Link>
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Shown under the Now card when the office is waiting on something unrelated. */
export function DriverBlockingTaskLink({ equipmentIssuanceId }: { equipmentIssuanceId: string }) {
  const { t } = useTranslation();
  return (
    <Link
      href={`/driver/equipment-issuance?id=${equipmentIssuanceId}`}
      className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5"
    >
      <span className="flex items-center gap-2 text-sm font-medium text-slate-900">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        {t('driverPortal.home.equipmentIssuanceTaskTitle')}
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-600" />
    </Link>
  );
}
