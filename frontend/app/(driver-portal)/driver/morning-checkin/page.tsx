'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DriverPageBack } from '@/components/driver-portal/DriverPageBack';
import { DriverPortalShell } from '@/components/driver-portal/DriverPortalShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { driverPortalApi } from '@/lib/api';
import { driverTodayIso } from '@/lib/driver-portal-utils';
import type { DriverMorningCheckin } from '@/lib/types';

export default function DriverMorningCheckinPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [existing, setExisting] = useState<DriverMorningCheckin | null>(null);
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [cargoName, setCargoName] = useState('');
  const [cargoQuantity, setCargoQuantity] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    driverPortalApi
      .listMorningCheckins(driverTodayIso())
      .then((rows) => setExisting(rows[0] ?? null))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!vehiclePlate.trim() || !companyName.trim() || !cargoName.trim() || !cargoQuantity.trim()) {
      setError(t('driverPortal.morningCheckin.validationRequired'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await driverPortalApi.createMorningCheckin({
        date: driverTodayIso(),
        vehiclePlate: vehiclePlate.trim(),
        companyName: companyName.trim(),
        cargoName: cargoName.trim(),
        cargoQuantity: cargoQuantity.trim(),
      });
      const rows = await driverPortalApi.listMorningCheckins(driverTodayIso());
      setExisting(rows[0] ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('driverPortal.morningCheckin.submitFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DriverPortalShell>
      <DriverPageBack label={t('driverPortal.backToToday')} />
      <Card>
        <CardHeader>
          <CardTitle>{t('driverPortal.morningCheckin.title')}</CardTitle>
          <p className="text-sm text-slate-600">{t('driverPortal.morningCheckin.subtitle')}</p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('driverPortal.assignments.loading')}
            </div>
          ) : existing ? (
            <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <p className="font-semibold">{t('driverPortal.morningCheckin.alreadyExistsTitle')}</p>
              <p>{t('driverPortal.morningCheckin.alreadyExistsBody')}</p>
              <p className="text-xs">
                {[existing.vehiclePlate, existing.companyName, existing.cargoName, existing.cargoQuantity]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
              <p className="text-sm text-slate-600">{t('driverPortal.morningCheckin.locationHint')}</p>
              <div className="space-y-2">
                <Label>{t('driverPortal.morningCheckin.vehiclePlate')}</Label>
                <Input value={vehiclePlate} onChange={(e) => setVehiclePlate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t('driverPortal.morningCheckin.companyName')}</Label>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t('driverPortal.morningCheckin.cargoName')}</Label>
                <Input value={cargoName} onChange={(e) => setCargoName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t('driverPortal.morningCheckin.cargoQuantity')}</Label>
                <Input value={cargoQuantity} onChange={(e) => setCargoQuantity(e.target.value)} />
              </div>
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              <Button type="submit" className="w-full bg-[#1a4d7a] hover:bg-[#163a5c]" disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t('driverPortal.morningCheckin.submit')}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </DriverPortalShell>
  );
}
