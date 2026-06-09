'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CreditCard, ExternalLink, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { billingApi, onboardingApi, type BillingPlanInfo, type BillingStatusResponse } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function BillingPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<BillingStatusResponse | null>(null);
  const [plans, setPlans] = useState<BillingPlanInfo[]>([]);
  const [billingEmail, setBillingEmail] = useState('');
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [manualRef, setManualRef] = useState('');
  const [manualSaving, setManualSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, plansRes, tenantRes] = await Promise.all([
        billingApi.getStatus(),
        billingApi.getPlans(),
        onboardingApi.getTenant().catch(() => null),
      ]);
      setStatus(statusRes);
      setPlans(plansRes);
      setBillingEmail(statusRes.subscription.billing_email ?? '');
      if (tenantRes) {
        setTenantId(tenantRes.id);
      }
    } catch {
      setError(t('billing.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const checkout = searchParams.get('checkout');
    if (checkout === 'success') {
      setNotice(t('billing.checkoutSuccess'));
    } else if (checkout === 'canceled') {
      setNotice(t('billing.checkoutCanceled'));
    }
  }, [searchParams, t]);

  async function startCheckout(planId: string) {
    if (!billingEmail.trim()) {
      setError(t('billing.emailRequired'));
      return;
    }
    setCheckoutLoading(planId);
    setError(null);
    try {
      const session = await billingApi.startCheckout(planId, billingEmail.trim());
      window.location.href = session.url;
    } catch {
      setError(t('billing.checkoutError'));
      setCheckoutLoading(null);
    }
  }

  async function openPortal() {
    setError(null);
    try {
      const session = await billingApi.openPortal();
      window.location.href = session.url;
    } catch {
      setError(t('billing.portalError'));
    }
  }

  async function saveManualPlan() {
    if (!tenantId) return;
    setManualSaving(true);
    setError(null);
    try {
      await billingApi.setManual({
        tenant_id: tenantId,
        plan: status?.subscription.plan ?? 'pro',
        billing_email: billingEmail.trim() || undefined,
        invoice_reference: manualRef.trim() || undefined,
      });
      await load();
    } catch {
      setError(t('billing.manualError'));
    } finally {
      setManualSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-700" />
      </div>
    );
  }

  const sub = status?.subscription;

  return (
    <div className="mx-auto max-w-5xl space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{t('billing.title')}</h1>
        <p className="text-sm text-slate-600">{t('billing.subtitle')}</p>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}
      {notice && (
        <p className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {notice}
        </p>
      )}

      <p className="text-sm text-slate-600">{t('billing.sepaHint')}</p>

      {sub && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              {t('billing.currentPlan')}
            </CardTitle>
            <CardDescription>
              {sub.plan_name_de} — {sub.monthly_amount_formatted}/{t('billing.perMonth')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-slate-500">{t('billing.status')}</p>
                <p className="font-medium capitalize">{sub.status}</p>
              </div>
              <div>
                <p className="text-slate-500">{t('billing.mode')}</p>
                <p className="font-medium">{sub.billing_mode}</p>
              </div>
              {sub.manual_invoice_reference && (
                <div>
                  <p className="text-slate-500">{t('billing.invoiceRef')}</p>
                  <p className="font-medium">{sub.manual_invoice_reference}</p>
                </div>
              )}
              {sub.trial_ends_at && (
                <div>
                  <p className="text-slate-500">{t('billing.trialEnds')}</p>
                  <p className="font-medium">{new Date(sub.trial_ends_at).toLocaleDateString('de-DE')}</p>
                </div>
              )}
            </div>

            {status && (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <p className="font-medium text-slate-900">{t('billing.usage')}</p>
                <p className="mt-1 text-slate-700">
                  {t('billing.vehiclesUsed', {
                    used: status.usage.vehicles,
                    limit: status.usage.vehicle_limit,
                  })}
                </p>
                <p className="text-slate-700">
                  {t('billing.seatsUsed', {
                    used: status.usage.seats,
                    limit: status.usage.seat_limit,
                  })}
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {sub.stripe_configured && sub.billing_mode === 'stripe' && (
                <Button type="button" variant="outline" onClick={openPortal}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {t('billing.manageStripe')}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        <Label htmlFor="billingEmail">{t('billing.billingEmail')}</Label>
        <Input
          id="billingEmail"
          type="email"
          value={billingEmail}
          onChange={(e) => setBillingEmail(e.target.value)}
          placeholder="rechnung@firma.de"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.id} className={sub?.plan === plan.id ? 'border-blue-500' : ''}>
            <CardHeader>
              <CardTitle>{plan.name_de}</CardTitle>
              <CardDescription>
                {plan.monthly_amount_formatted}/{t('billing.perMonth')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <ul className="space-y-1 text-slate-600">
                {plan.features_de.map((feature) => (
                  <li key={feature}>• {feature}</li>
                ))}
              </ul>
              {plan.stripe_available ? (
                <Button
                  type="button"
                  className="w-full"
                  disabled={checkoutLoading === plan.id}
                  onClick={() => startCheckout(plan.id)}
                >
                  {checkoutLoading === plan.id ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {t('billing.subscribeSepa')}
                </Button>
              ) : (
                <p className="text-xs text-slate-500">{t('billing.stripeNotConfigured')}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('billing.manualTitle')}</CardTitle>
          <CardDescription>{t('billing.manualHint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="manualRef">{t('billing.invoiceRef')}</Label>
            <Input
              id="manualRef"
              value={manualRef}
              onChange={(e) => setManualRef(e.target.value)}
              placeholder="RE-2026-0042"
            />
          </div>
          <Button type="button" variant="outline" disabled={manualSaving || !tenantId} onClick={saveManualPlan}>
            {manualSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t('billing.activateManual')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
