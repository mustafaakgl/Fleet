'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { onboardingApi } from '@/lib/api';
import { getUser } from '@/lib/auth';
import {
  isOnboardingWidgetStepId,
  ONBOARDING_WIDGET_STEP_IDS,
} from '@/lib/onboarding-steps';

function dismissStorageKey(tenantId: string) {
  return `getting-started-pill-dismissed:${tenantId}`;
}

function ProgressRing({ percent, size = 28 }: { percent: number; size?: number }) {
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90" aria-hidden>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.25)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#ffffff"
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function GettingStartedPill() {
  const { t } = useTranslation();
  const user = getUser();
  const [dismissed, setDismissed] = useState(false);
  const [progress, setProgress] = useState<Awaited<ReturnType<typeof onboardingApi.getProgress>> | null>(
    null,
  );

  const reload = useCallback(() => {
    onboardingApi
      .getProgress()
      .then((data) => {
        setProgress(data);
        setDismissed(localStorage.getItem(dismissStorageKey(data.tenant.id)) === '1');
      })
      .catch(() => setProgress(null));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const widgetSteps = useMemo(() => {
    if (!progress) return [];
    return progress.steps.filter((step) => isOnboardingWidgetStepId(step.id));
  }, [progress]);

  const completed = widgetSteps.filter((step) => step.complete).length;
  const total = ONBOARDING_WIDGET_STEP_IDS.length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const allComplete = total > 0 && completed >= total;

  if (user?.role !== 'admin' || !progress || dismissed || allComplete) {
    return null;
  }

  return (
    <Link
      href="/getting-started"
      className="group flex items-center justify-between gap-4 rounded-xl bg-brand-secondary px-4 py-3 text-white shadow-sm transition hover:bg-brand-secondary"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="text-sm font-semibold sm:text-base">{t('nav.gettingStarted')}</span>
        <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-medium tabular-nums">
          {completed}/{total}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="hidden text-xs text-white/80 sm:inline">
          {t('gettingStarted.progress', { percent })}
        </span>
        <ProgressRing percent={percent} />
      </div>
    </Link>
  );
}
