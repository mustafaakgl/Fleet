'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Circle, Clock, Loader2, MoreHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { onboardingApi } from '@/lib/api';
import { getUser } from '@/lib/auth';
import {
  isOnboardingWidgetStepId,
  ONBOARDING_WIDGET_LABEL_KEYS,
  ONBOARDING_WIDGET_STEP_IDS,
} from '@/lib/onboarding-steps';

function dismissStorageKey(tenantId: string) {
  return `onboarding-widget-dismissed:${tenantId}`;
}

export function OnboardingTasksWidget() {
  const { t } = useTranslation();
  const user = getUser();
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [progress, setProgress] = useState<Awaited<ReturnType<typeof onboardingApi.getProgress>> | null>(
    null,
  );

  const reload = useCallback(() => {
    setLoading(true);
    onboardingApi
      .getProgress()
      .then((data) => {
        setProgress(data);
        const key = dismissStorageKey(data.tenant.id);
        setDismissed(localStorage.getItem(key) === '1');
      })
      .catch(() => setProgress(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const widgetSteps = useMemo(() => {
    if (!progress) return [];
    return progress.steps.filter((step) => isOnboardingWidgetStepId(step.id));
  }, [progress]);

  const widgetProgressPercent = useMemo(() => {
    if (widgetSteps.length === 0) return 0;
    const completed = widgetSteps.filter((step) => step.complete).length;
    return Math.round((completed / widgetSteps.length) * 100);
  }, [widgetSteps]);

  const allWidgetStepsComplete = widgetSteps.length > 0 && widgetSteps.every((step) => step.complete);

  function handleDismiss() {
    if (!progress) return;
    localStorage.setItem(dismissStorageKey(progress.tenant.id), '1');
    setDismissed(true);
    setMenuOpen(false);
  }

  if (user?.role !== 'admin') {
    return null;
  }

  if (loading) {
    return (
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </CardContent>
      </Card>
    );
  }

  if (!progress || dismissed || allWidgetStepsComplete) {
    return null;
  }

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-semibold text-slate-900">
          {t('onboardingWidget.title')}
        </CardTitle>
        <div className="relative">
          <button
            type="button"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label={t('onboardingWidget.menu')}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-10 cursor-default"
                aria-label={t('common.close')}
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 z-20 mt-1 min-w-[10rem] rounded-md border border-slate-200 bg-white py-1 shadow-md">
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                  onClick={handleDismiss}
                >
                  {t('onboardingWidget.dismiss')}
                </button>
                <Link
                  href="/getting-started"
                  className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  onClick={() => setMenuOpen(false)}
                >
                  {t('onboardingWidget.viewAll')}
                </Link>
              </div>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${widgetProgressPercent}%` }}
          />
        </div>

        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <Clock className="h-3.5 w-3.5" />
          {t('onboardingWidget.estimatedTime')}
        </p>

        <ul className="divide-y divide-slate-100">
          {ONBOARDING_WIDGET_STEP_IDS.map((stepId) => {
            const step = widgetSteps.find((item) => item.id === stepId);
            if (!step) return null;

            return (
              <li key={stepId}>
                <Link
                  href={step.href}
                  className="flex items-center justify-between gap-3 py-3 text-sm transition-colors hover:text-blue-700"
                >
                  <span className={step.complete ? 'text-slate-500 line-through' : 'text-slate-800'}>
                    {t(ONBOARDING_WIDGET_LABEL_KEYS[stepId])}
                  </span>
                  {step.complete ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-slate-300" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        <Link
          href="/getting-started"
          className="inline-block text-sm font-medium text-blue-700 hover:underline"
        >
          {t('onboardingWidget.viewAll')}
        </Link>
      </CardContent>
    </Card>
  );
}
