'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DriverFileInput } from '@/components/driver-portal/DriverFileInput';
import { DriverPageBack } from '@/components/driver-portal/DriverPageBack';
import { DriverPortalShell } from '@/components/driver-portal/DriverPortalShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { driverPortalApi } from '@/lib/api';
import type { DriverTransportFormOptions } from '@/lib/types';

/**
 * Refuelling from the cab. The office already had fuel screens and the endpoint
 * accepted driver-created entries; there was simply no way for a driver to file
 * one, so receipts piled up on paper.
 */
export default function DriverFuelPage() {
  const { t } = useTranslation();
  const [options, setOptions] = useState<DriverTransportFormOptions | null>(null);
  const [vehicleId, setVehicleId] = useState('');
  const [liters, setLiters] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [odometerKm, setOdometerKm] = useState('');
  const [isFullTank, setIsFullTank] = useState(true);
  const [receipt, setReceipt] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let active = true;
    driverPortalApi
      .getTransportFormOptions()
      .then((result) => {
        if (!active) return;
        setOptions(result);
        // One vehicle is the normal case; preselecting saves a tap at the pump.
        if (result.vehicles.length === 1) setVehicleId(result.vehicles[0].id);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    const litersValue = Number(liters.replace(',', '.'));
    const costValue = Number(totalCost.replace(',', '.'));
    const odometerValue = odometerKm.trim() ? Number(odometerKm.replace(',', '.')) : undefined;

    if (!vehicleId) {
      setError(t('driverPortal.fuel.vehicleRequired'));
      return;
    }
    // The endpoint demands liters > 0; catching it here avoids a round trip that
    // comes back as an opaque validation error at the pump.
    if (!Number.isFinite(litersValue) || litersValue <= 0) {
      setError(t('driverPortal.fuel.litersInvalid'));
      return;
    }
    if (!Number.isFinite(costValue) || costValue < 0) {
      setError(t('driverPortal.fuel.costInvalid'));
      return;
    }

    setBusy(true);
    try {
      await driverPortalApi.createFuelEntry(
        {
          vehicleId,
          liters: litersValue,
          totalCost: costValue,
          odometerKm: odometerValue,
          isFullTank,
        },
        receipt[0],
      );
      setSuccess(true);
      setLiters('');
      setTotalCost('');
      setOdometerKm('');
      setReceipt([]);
    } catch {
      setError(t('driverPortal.fuel.submitFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DriverPortalShell>
      <DriverPageBack label={t('driverPortal.backToToday')} />
      <Card>
        <CardHeader>
          <CardTitle>{t('driverPortal.fuel.title')}</CardTitle>
          <p className="text-sm text-slate-600">{t('driverPortal.fuel.subtitle')}</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
            <div className="space-y-2">
              <Label>{t('driverPortal.reports.vehicle')}</Label>
              <Select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                <option value="">{t('driverPortal.requests.selectPlaceholder')}</option>
                {options?.vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.plateNumber}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t('driverPortal.fuel.liters')} *</Label>
                <Input
                  inputMode="decimal"
                  value={liters}
                  onChange={(e) => setLiters(e.target.value)}
                  placeholder="0,00"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('driverPortal.fuel.totalCost')} *</Label>
                <Input
                  inputMode="decimal"
                  value={totalCost}
                  onChange={(e) => setTotalCost(e.target.value)}
                  placeholder="0,00"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('driverPortal.fuel.odometer')}</Label>
              <Input
                inputMode="numeric"
                value={odometerKm}
                onChange={(e) => setOdometerKm(e.target.value)}
              />
            </div>

            <label className="flex min-h-11 items-center gap-3 rounded-md border border-slate-200 px-3">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={isFullTank}
                onChange={(e) => setIsFullTank(e.target.checked)}
              />
              <span className="text-sm text-slate-800">{t('driverPortal.fuel.fullTank')}</span>
            </label>

            <DriverFileInput
              label={t('driverPortal.fuel.receipt')}
              files={receipt}
              onChange={setReceipt}
              maxFiles={1}
              multiple={false}
              accept="image/*,.pdf"
            />

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {success ? (
              <p className="text-sm text-emerald-700">{t('driverPortal.fuel.success')}</p>
            ) : null}

            <Button
              type="submit"
              className="h-12 w-full bg-blue-900 text-white hover:bg-blue-800"
              disabled={busy}
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('driverPortal.fuel.submit')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </DriverPortalShell>
  );
}
