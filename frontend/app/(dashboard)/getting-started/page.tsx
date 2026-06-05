'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Circle, Loader2, Mail, Rocket } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { onboardingApi, mailApi } from '@/lib/api';

type ProgressStep = {
  id: string;
  complete: boolean;
  href: string;
};

type ProgressResponse = {
  smtp_enabled: boolean;
  progress_percent: number;
  complete: boolean;
  counts: {
    users: number;
    drivers: number;
    vehicles: number;
    assignments: number;
    pending_invitations: number;
  };
  steps: ProgressStep[];
  tenant: {
    name: string;
    contact_email?: string;
  };
};

const STEP_LABELS: Record<string, string> = {
  tenant_profile: 'gettingStarted.steps.tenant',
  invite_team: 'gettingStarted.steps.invite',
  import_data: 'gettingStarted.steps.import',
  first_assignment: 'gettingStarted.steps.assignment',
  smtp_ready: 'gettingStarted.steps.smtp',
};

export default function GettingStartedPage() {
  const { t } = useTranslation();
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contactEmail, setContactEmail] = useState('');
  const [savingTenant, setSavingTenant] = useState(false);
  const [testingMail, setTestingMail] = useState(false);
  const [mailTestResult, setMailTestResult] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    onboardingApi
      .getProgress()
      .then((data) => {
        setProgress(data);
        setContactEmail(data.tenant.contact_email ?? '');
      })
      .catch(() => setError(t('gettingStarted.loadError')))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function saveContactEmail() {
    setSavingTenant(true);
    try {
      await onboardingApi.updateTenant({ contact_email: contactEmail.trim() });
      reload();
    } catch {
      setError(t('gettingStarted.saveError'));
    } finally {
      setSavingTenant(false);
    }
  }

  async function testSmtp() {
    setTestingMail(true);
    setMailTestResult(null);
    try {
      const result = await mailApi.sendTest();
      if (result.sent) {
        setMailTestResult(t('gettingStarted.smtpTestSent'));
      } else {
        setMailTestResult(t('gettingStarted.smtpTestLog', { mode: result.mode }));
      }
      reload();
    } catch {
      setMailTestResult(t('gettingStarted.smtpTestFailed'));
    } finally {
      setTestingMail(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-700" />
      </div>
    );
  }

  if (error || !progress) {
    return <p className="p-6 text-sm text-rose-600">{error ?? t('gettingStarted.loadError')}</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-blue-100 p-3">
          <Rocket className="h-6 w-6 text-blue-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('gettingStarted.title')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('gettingStarted.subtitle')}</p>
          <p className="mt-2 text-sm font-medium text-blue-700">
            {t('gettingStarted.progress', { percent: progress.progress_percent })}
          </p>
        </div>
      </div>

      <Card id="tenant">
        <CardHeader>
          <CardTitle>{t('gettingStarted.tenantCard')}</CardTitle>
          <CardDescription>{progress.tenant.name}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="contact_email">{t('gettingStarted.contactEmail')}</Label>
            <Input
              id="contact_email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="kontakt@firma.de"
            />
          </div>
          <Button type="button" onClick={saveContactEmail} disabled={savingTenant}>
            {savingTenant ? t('common.saving') : t('common.save')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('gettingStarted.checklist')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {progress.steps.map((step) => (
            <div
              key={step.id}
              className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                {step.complete ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : (
                  <Circle className="h-5 w-5 text-slate-300" />
                )}
                <span className="text-sm font-medium text-slate-800">
                  {t(STEP_LABELS[step.id] ?? step.id)}
                </span>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href={step.href}>{t('gettingStarted.open')}</Link>
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card id="smtp">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            {t('gettingStarted.smtpCard')}
          </CardTitle>
          <CardDescription>
            {progress.smtp_enabled
              ? t('gettingStarted.smtpEnabled')
              : t('gettingStarted.smtpDisabled')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button type="button" variant="outline" onClick={testSmtp} disabled={testingMail}>
            {testingMail ? t('gettingStarted.smtpTesting') : t('gettingStarted.smtpTest')}
          </Button>
          {mailTestResult && <p className="text-sm text-slate-600">{mailTestResult}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('gettingStarted.stats')}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <p className="text-slate-500">{t('gettingStarted.statUsers')}</p>
            <p className="text-xl font-semibold">{progress.counts.users}</p>
          </div>
          <div>
            <p className="text-slate-500">{t('gettingStarted.statDrivers')}</p>
            <p className="text-xl font-semibold">{progress.counts.drivers}</p>
          </div>
          <div>
            <p className="text-slate-500">{t('gettingStarted.statVehicles')}</p>
            <p className="text-xl font-semibold">{progress.counts.vehicles}</p>
          </div>
          <div>
            <p className="text-slate-500">{t('gettingStarted.statAssignments')}</p>
            <p className="text-xl font-semibold">{progress.counts.assignments}</p>
          </div>
        </CardContent>
      </Card>

      {progress.complete && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {t('gettingStarted.allDone')}
        </div>
      )}
    </div>
  );
}
