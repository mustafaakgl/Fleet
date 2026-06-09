'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  CheckCircle2,
  Circle,
  Loader2,
  Mail,
  Rocket,
  Truck,
  UserPlus,
  Users,
} from 'lucide-react';
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
    companies: number;
    assignments: number;
    pending_invitations: number;
  };
  steps: ProgressStep[];
  tenant: {
    name: string;
    contact_email?: string;
    contact_phone?: string;
    address?: string;
  };
};

type StepAction = {
  labelKey: string;
  href: string;
  variant?: 'default' | 'outline';
};

type StepConfig = {
  id: string;
  icon: typeof Building2;
  titleKey: string;
  descriptionKey: string;
  fieldsKey: string;
  countKey?: keyof ProgressResponse['counts'];
  actions: StepAction[];
};

const STEP_CONFIG: StepConfig[] = [
  {
    id: 'tenant_profile',
    icon: Building2,
    titleKey: 'gettingStarted.steps.tenant.title',
    descriptionKey: 'gettingStarted.steps.tenant.description',
    fieldsKey: 'gettingStarted.steps.tenant.fields',
    actions: [],
  },
  {
    id: 'invite_team',
    icon: UserPlus,
    titleKey: 'gettingStarted.steps.users.title',
    descriptionKey: 'gettingStarted.steps.users.description',
    fieldsKey: 'gettingStarted.steps.users.fields',
    countKey: 'users',
    actions: [
      { labelKey: 'gettingStarted.action.invite', href: '/assignments?panel=users' },
      { labelKey: 'gettingStarted.action.import', href: '/import#users', variant: 'outline' },
    ],
  },
  {
    id: 'drivers',
    icon: Users,
    titleKey: 'gettingStarted.steps.drivers.title',
    descriptionKey: 'gettingStarted.steps.drivers.description',
    fieldsKey: 'gettingStarted.steps.drivers.fields',
    countKey: 'drivers',
    actions: [
      { labelKey: 'gettingStarted.action.import', href: '/import#drivers' },
      { labelKey: 'gettingStarted.action.addDriver', href: '/drivers/new', variant: 'outline' },
    ],
  },
  {
    id: 'vehicles',
    icon: Truck,
    titleKey: 'gettingStarted.steps.vehicles.title',
    descriptionKey: 'gettingStarted.steps.vehicles.description',
    fieldsKey: 'gettingStarted.steps.vehicles.fields',
    countKey: 'vehicles',
    actions: [
      { labelKey: 'gettingStarted.action.import', href: '/import#vehicles' },
      { labelKey: 'gettingStarted.action.addVehicle', href: '/vehicles/new', variant: 'outline' },
    ],
  },
  {
    id: 'companies',
    icon: Building2,
    titleKey: 'gettingStarted.steps.companies.title',
    descriptionKey: 'gettingStarted.steps.companies.description',
    fieldsKey: 'gettingStarted.steps.companies.fields',
    countKey: 'companies',
    actions: [
      { labelKey: 'gettingStarted.action.import', href: '/import#companies' },
      { labelKey: 'gettingStarted.action.addCompany', href: '/companies/new', variant: 'outline' },
    ],
  },
  {
    id: 'first_assignment',
    icon: Rocket,
    titleKey: 'gettingStarted.steps.assignment.title',
    descriptionKey: 'gettingStarted.steps.assignment.description',
    fieldsKey: 'gettingStarted.steps.assignment.fields',
    countKey: 'assignments',
    actions: [{ labelKey: 'gettingStarted.action.planAssignment', href: '/assignments/new' }],
  },
];

function StepStatusBadge({ complete, t }: { complete: boolean; t: (key: string) => string }) {
  return (
    <span
      className={
        complete
          ? 'inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700'
          : 'inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700'
      }
    >
      {complete ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : (
        <Circle className="h-3.5 w-3.5" />
      )}
      {complete ? t('gettingStarted.stepComplete') : t('gettingStarted.stepPending')}
    </span>
  );
}

export default function GettingStartedPage() {
  const { t } = useTranslation();
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fleetName, setFleetName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [address, setAddress] = useState('');
  const [savingTenant, setSavingTenant] = useState(false);
  const [testingMail, setTestingMail] = useState(false);
  const [mailTestResult, setMailTestResult] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    onboardingApi
      .getProgress()
      .then((data) => {
        setProgress(data);
        setFleetName(data.tenant.name ?? '');
        setContactEmail(data.tenant.contact_email ?? '');
        setContactPhone(data.tenant.contact_phone ?? '');
        setAddress(data.tenant.address ?? '');
      })
      .catch(() => setError(t('gettingStarted.loadError')))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    reload();
  }, [reload]);

  const stepStatusById = useMemo(() => {
    const map = new Map<string, boolean>();
    progress?.steps.forEach((step) => map.set(step.id, step.complete));
    return map;
  }, [progress?.steps]);

  async function saveTenantProfile() {
    setSavingTenant(true);
    setError(null);
    try {
      await onboardingApi.updateTenant({
        fleet_name: fleetName.trim(),
        contact_email: contactEmail.trim(),
        contact_phone: contactPhone.trim(),
        address: address.trim(),
      });
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

  if (error && !progress) {
    return <p className="p-6 text-sm text-rose-600">{error}</p>;
  }

  if (!progress) {
    return <p className="p-6 text-sm text-rose-600">{t('gettingStarted.loadError')}</p>;
  }

  const smtpStep = progress.steps.find((step) => step.id === 'smtp_ready');
  const masterDataComplete = STEP_CONFIG.every((config) => stepStatusById.get(config.id));

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-blue-100 p-3">
          <Rocket className="h-6 w-6 text-blue-700" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{t('gettingStarted.title')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('gettingStarted.subtitle')}</p>
          <p className="mt-2 text-sm text-slate-500">{t('gettingStarted.intro')}</p>
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium text-blue-700">
                {t('gettingStarted.progress', { percent: progress.progress_percent })}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-blue-600 transition-all"
                style={{ width: `${progress.progress_percent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold text-slate-900">{t('gettingStarted.masterDataTitle')}</h2>
        <p className="mt-1 text-sm text-slate-600">{t('gettingStarted.masterDataSubtitle')}</p>
      </div>

      <div className="space-y-4">
        {STEP_CONFIG.map((config, index) => {
          const complete = stepStatusById.get(config.id) ?? false;
          const Icon = config.icon;
          const count = config.countKey ? progress.counts[config.countKey] : undefined;

          return (
            <Card
              key={config.id}
              id={config.id === 'tenant_profile' ? 'tenant' : undefined}
              className={complete ? 'border-emerald-200' : undefined}
            >
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div
                      className={
                        complete
                          ? 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700'
                          : 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600'
                      }
                    >
                      <span className="text-sm font-bold">{index + 1}</span>
                    </div>
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Icon className="h-4 w-4 text-blue-700" />
                        {t(config.titleKey)}
                      </CardTitle>
                      <CardDescription className="mt-1">{t(config.descriptionKey)}</CardDescription>
                    </div>
                  </div>
                  <StepStatusBadge complete={complete} t={t} />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  <p className="font-medium text-slate-700">{t('gettingStarted.requiredFields')}</p>
                  <p className="mt-1">{t(config.fieldsKey)}</p>
                </div>

                {config.id === 'tenant_profile' ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label htmlFor="fleet_name">{t('gettingStarted.fleetName')}</Label>
                      <Input
                        id="fleet_name"
                        value={fleetName}
                        onChange={(e) => setFleetName(e.target.value)}
                        placeholder={t('gettingStarted.fleetNamePlaceholder')}
                      />
                    </div>
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
                    <div>
                      <Label htmlFor="contact_phone">{t('gettingStarted.contactPhone')}</Label>
                      <Input
                        id="contact_phone"
                        type="tel"
                        value={contactPhone}
                        onChange={(e) => setContactPhone(e.target.value)}
                        placeholder="+49 30 1234567"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor="address">{t('gettingStarted.address')}</Label>
                      <Input
                        id="address"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder={t('gettingStarted.addressPlaceholder')}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Button type="button" onClick={saveTenantProfile} disabled={savingTenant}>
                        {savingTenant ? t('common.saving') : t('gettingStarted.saveProfile')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {typeof count === 'number' && (
                      <p className="text-sm text-slate-600">
                        {t('gettingStarted.countLabel', { count })}
                        {config.id === 'invite_team' && progress.counts.pending_invitations > 0 && (
                          <span className="ml-2 text-amber-700">
                            {t('gettingStarted.pendingInvites', {
                              count: progress.counts.pending_invitations,
                            })}
                          </span>
                        )}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {config.actions.map((action) => (
                        <Button
                          key={action.href}
                          asChild
                          variant={action.variant ?? 'default'}
                          size="sm"
                        >
                          <Link href={action.href}>{t(action.labelKey)}</Link>
                        </Button>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {masterDataComplete && !stepStatusById.get('first_assignment') && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {t('gettingStarted.readyForAssignment')}
        </div>
      )}

      <Card id="smtp">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                {t('gettingStarted.smtpCard')}
              </CardTitle>
              <CardDescription className="mt-1">
                {progress.smtp_enabled
                  ? t('gettingStarted.smtpEnabled')
                  : t('gettingStarted.smtpDisabled')}
              </CardDescription>
            </div>
            {smtpStep && <StepStatusBadge complete={smtpStep.complete} t={t} />}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-600">{t('gettingStarted.smtpHint')}</p>
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
        <CardContent className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
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
            <p className="text-slate-500">{t('gettingStarted.statCompanies')}</p>
            <p className="text-xl font-semibold">{progress.counts.companies}</p>
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
