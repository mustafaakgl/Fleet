'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Droplets } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  driversApi,
  fleetFuelEntriesApi,
  getApiErrorMessage,
  vehiclesApi,
} from '@/lib/api';
import { FLEET_LIST_CARD, FLEET_PAGE, FLEET_PAGE_TITLE } from '@/lib/fleet-table';
import { showToast } from '@/lib/toast';
import type { Driver, Vehicle } from '@/lib/types';

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-border bg-background px-3 text-[13px]';

function nowLocalDate(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function nowLocalTime(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(11, 16);
}

export default function AddFuelEntryPage() {
  const { t } = useTranslation();
  const router = useRouter();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [date, setDate] = useState(nowLocalDate);
  const [time, setTime] = useState(nowLocalTime);
  const [odometerKm, setOdometerKm] = useState('');
  const [liters, setLiters] = useState('');
  const [pricePerLiter, setPricePerLiter] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [totalCostTouched, setTotalCostTouched] = useState(false);
  const [isFullTank, setIsFullTank] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      vehiclesApi.list({ limit: 200 }),
      driversApi.list({ limit: 200 }),
    ])
      .then(([vehicleResult, driverResult]) => {
        if (cancelled) return;
        setVehicles(vehicleResult.data);
        setDrivers(driverResult.data);
      })
      .catch(() => {
        /* selects stay empty; form validation will catch missing vehicle */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-compute total cost from liters × price/liter unless user edited it manually.
  useEffect(() => {
    if (totalCostTouched) return;
    const litersNum = Number(liters);
    const priceNum = Number(pricePerLiter);
    if (litersNum > 0 && priceNum > 0) {
      setTotalCost((litersNum * priceNum).toFixed(2));
    }
  }, [liters, pricePerLiter, totalCostTouched]);

  const selectedVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.id === vehicleId) ?? null,
    [vehicles, vehicleId],
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const litersNum = Number(liters);
    const totalNum = Number(totalCost);
    if (!vehicleId) {
      setError(t('fuelHistory.form.vehicleRequired', 'Lütfen bir araç seçin.'));
      return;
    }
    if (!(litersNum > 0)) {
      setError(t('fuelHistory.form.litersRequired', 'Lütfen geçerli bir litre değeri girin.'));
      return;
    }
    if (!(totalNum > 0)) {
      setError(t('fuelHistory.form.totalRequired', 'Lütfen geçerli bir toplam tutar girin.'));
      return;
    }
    if (!selectedVehicle?.current_driver && !driverId) {
      setError(
        t(
          'fuelHistory.form.driverRequired',
          'Bu aracın atanmış sürücüsü yok; lütfen bir sürücü seçin.',
        ),
      );
      return;
    }

    setSaving(true);
    try {
      await fleetFuelEntriesApi.create({
        vehicleId,
        driverId: driverId || undefined,
        enteredAt: new Date(`${date}T${time || '00:00'}`).toISOString(),
        liters: litersNum,
        totalCost: totalNum,
        odometerKm: odometerKm ? Number(odometerKm) : undefined,
        isFullTank,
      });
      showToast({ message: t('fuelHistory.form.saveSuccess'), type: 'success' });
      router.push('/fleet-analytics/fuel');
    } catch (e) {
      setError(getApiErrorMessage(e, t('fuelHistory.form.saveError', 'Yakıt girişi kaydedilemedi.')));
      setSaving(false);
    }
  };

  return (
    <div className={FLEET_PAGE}>
      <div>
        <Link
          href="/fleet-analytics/fuel"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-blue-600 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('fuelHistory.title', 'Yakıt Geçmişi')}
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <Droplets className="h-6 w-6 text-primary" />
          <h1 className={FLEET_PAGE_TITLE}>{t('fuelHistory.addEntry', 'Yakıt Girişi Ekle')}</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl">
        <Card className={FLEET_LIST_CARD}>
          <CardContent className="space-y-4 p-4 sm:p-6">
            <div className="space-y-1.5">
              <Label htmlFor="fuel-vehicle">
                {t('fuelHistory.col.vehicle', 'Araç')} <span className="text-red-500">*</span>
              </Label>
              <select
                id="fuel-vehicle"
                className={SELECT_CLASS}
                value={vehicleId}
                onChange={(event) => setVehicleId(event.target.value)}
                required
              >
                <option value="">
                  {t('fuelHistory.form.selectVehicle', 'Araç seçin…')}
                </option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.plate_number} — {vehicle.brand} {vehicle.model}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fuel-driver">{t('fuelHistory.col.driver', 'Sürücü')}</Label>
              <select
                id="fuel-driver"
                className={SELECT_CLASS}
                value={driverId}
                onChange={(event) => setDriverId(event.target.value)}
              >
                <option value="">
                  {selectedVehicle?.current_driver
                    ? t('fuelHistory.form.assignedDriver', 'Atanmış sürücü: {{name}}', {
                        name: `${selectedVehicle.current_driver.first_name} ${selectedVehicle.current_driver.last_name}`,
                      })
                    : t('fuelHistory.form.selectDriver', 'Sürücü seçin…')}
                </option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.first_name} {driver.last_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="fuel-date">
                  {t('fuelHistory.form.date', 'Tarih')} <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="fuel-date"
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fuel-time">{t('fuelHistory.form.time', 'Saat')}</Label>
                <Input
                  id="fuel-time"
                  type="time"
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fuel-odometer">
                {t('fuelHistory.form.odometer', 'Km Sayacı (km)')}
              </Label>
              <Input
                id="fuel-odometer"
                type="number"
                inputMode="decimal"
                min="0"
                step="1"
                placeholder="120000"
                value={odometerKm}
                onChange={(event) => setOdometerKm(event.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="fuel-liters">
                  {t('fuelHistory.form.liters', 'Litre')} <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="fuel-liters"
                  type="number"
                  inputMode="decimal"
                  min="0.001"
                  step="0.001"
                  placeholder="45.5"
                  value={liters}
                  onChange={(event) => setLiters(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fuel-price">
                  {t('fuelHistory.form.pricePerLiter', 'Litre Fiyatı (€)')}
                </Label>
                <Input
                  id="fuel-price"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.001"
                  placeholder="1.789"
                  value={pricePerLiter}
                  onChange={(event) => setPricePerLiter(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fuel-total">
                  {t('fuelHistory.form.total', 'Toplam (€)')} <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="fuel-total"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  placeholder="81.40"
                  value={totalCost}
                  onChange={(event) => {
                    setTotalCostTouched(true);
                    setTotalCost(event.target.value);
                  }}
                  required
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-[13px] text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                checked={isFullTank}
                onChange={(event) => setIsFullTank(event.target.checked)}
              />
              {t('fuelHistory.detail.fullTank', 'Depo Dolumu')}
            </label>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button asChild type="button" variant="outline" size="sm">
                <Link href="/fleet-analytics/fuel">{t('common.cancel', 'İptal')}</Link>
              </Button>
              <Button type="submit" size="sm" disabled={saving}>
                {saving
                  ? t('common.saving', 'Kaydediliyor…')
                  : t('fuelHistory.form.save', 'Yakıt Girişini Kaydet')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
