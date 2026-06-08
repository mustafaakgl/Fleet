'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Loader2, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { fleetOpsApi, type FleetOpsTenant } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { isPasswordStrong } from '@/lib/password-policy';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function AdminTenantsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tenants, setTenants] = useState<FleetOpsTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    fleet_name: '',
    admin_full_name: '',
    admin_email: '',
    admin_password: '',
    contact_email: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fleetOpsApi.listTenants();
      setTenants(rows);
    } catch {
      setError(t('fleetOps.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const user = getUser();
    if (!user?.fleet_ops) {
      setAllowed(false);
      router.replace('/dashboard');
      return;
    }
    setAllowed(true);
    void load();
  }, [load, router]);

  async function createTenant() {
    if (!form.fleet_name.trim() || !form.admin_full_name.trim() || !form.admin_email.trim()) {
      setError(t('fleetOps.requiredFields'));
      return;
    }
    if (!isPasswordStrong(form.admin_password)) {
      setError(t('auth.passwordPolicy.weak'));
      return;
    }

    setCreating(true);
    setError(null);
    try {
      await fleetOpsApi.provisionTenant({
        fleet_name: form.fleet_name.trim(),
        admin_full_name: form.admin_full_name.trim(),
        admin_email: form.admin_email.trim(),
        admin_password: form.admin_password,
        contact_email: form.contact_email.trim() || undefined,
      });
      setShowForm(false);
      setForm({
        fleet_name: '',
        admin_full_name: '',
        admin_email: '',
        admin_password: '',
        contact_email: '',
      });
      await load();
    } catch {
      setError(t('fleetOps.createError'));
    } finally {
      setCreating(false);
    }
  }

  async function toggleStatus(tenant: FleetOpsTenant) {
    const next = tenant.status === 'active' ? 'suspended' : 'active';
    setError(null);
    try {
      await fleetOpsApi.updateTenantStatus(tenant.id, next);
      await load();
    } catch {
      setError(t('fleetOps.statusError'));
    }
  }

  if (allowed === null || loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-700" />
      </div>
    );
  }

  if (!allowed) {
    return null;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-blue-100 p-3">
            <Building2 className="h-6 w-6 text-blue-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t('fleetOps.title')}</h1>
            <p className="mt-1 text-sm text-slate-600">{t('fleetOps.subtitle')}</p>
          </div>
        </div>
        <Button type="button" onClick={() => setShowForm((v) => !v)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('fleetOps.newTenant')}
        </Button>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{t('fleetOps.formTitle')}</CardTitle>
            <CardDescription>{t('fleetOps.formHint')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="fleet_name">{t('fleetOps.fleetName')}</Label>
              <Input
                id="fleet_name"
                value={form.fleet_name}
                onChange={(e) => setForm((f) => ({ ...f, fleet_name: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="contact_email">{t('fleetOps.contactEmail')}</Label>
              <Input
                id="contact_email"
                type="email"
                value={form.contact_email}
                onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="admin_full_name">{t('fleetOps.adminName')}</Label>
              <Input
                id="admin_full_name"
                value={form.admin_full_name}
                onChange={(e) => setForm((f) => ({ ...f, admin_full_name: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="admin_email">{t('fleetOps.adminEmail')}</Label>
              <Input
                id="admin_email"
                type="email"
                value={form.admin_email}
                onChange={(e) => setForm((f) => ({ ...f, admin_email: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="admin_password">{t('fleetOps.adminPassword')}</Label>
              <Input
                id="admin_password"
                type="password"
                value={form.admin_password}
                onChange={(e) => setForm((f) => ({ ...f, admin_password: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="button" disabled={creating} onClick={createTenant}>
                {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t('fleetOps.createTenant')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('fleetOps.listTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {tenants.length === 0 ? (
            <p className="text-sm text-slate-500">{t('fleetOps.empty')}</p>
          ) : (
            tenants.map((tenant) => (
              <div
                key={tenant.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3"
              >
                <div>
                  <p className="font-medium text-slate-900">{tenant.name}</p>
                  <p className="text-xs text-slate-500">
                    {tenant.slug} · {tenant.status} · {t('fleetOps.counts', tenant.counts)}
                  </p>
                  {tenant.subscription && (
                    <p className="text-xs text-slate-500">
                      {tenant.subscription.plan} / {tenant.subscription.status}
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => toggleStatus(tenant)}
                >
                  {tenant.status === 'active'
                    ? t('fleetOps.suspend')
                    : t('fleetOps.activate')}
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
