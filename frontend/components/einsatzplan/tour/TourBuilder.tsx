'use client';

import { useCallback, useMemo, useState } from 'react';
import { Loader2, Plus, Route } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AddressPickerFields } from '@/components/shared/AddressPickerFields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { getApiErrorMessage, toursApi, type TourDetail } from '@/lib/api';
import {
  blockingStops,
  buildCreatePayload,
  emptyStop,
  moveStop,
  removeStop,
  unverifiedStops,
  validateTourForm,
  type TourBuilderForm,
  type TourBuilderStop,
} from '@/lib/tour-builder';
import { showToast } from '@/lib/toast';
import { TourResultPanel } from './TourResultPanel';
import { TourStopRow } from './TourStopRow';

export interface TourBuilderOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface TourBuilderProps {
  date: string;
  driverId: string;
  driverOptions: TourBuilderOption[];
  companyOptions: TourBuilderOption[];
  vehicleOptions: TourBuilderOption[];
  /** Tur olusup optimize edildiginde: gorev hucresindeki ozeti guncellemek icin */
  onTourChange?: (tour: TourDetail | null) => void;
  onCancel?: () => void;
}

let stopCounter = 0;
function nextStopKey(): string {
  stopCounter += 1;
  return `stop-${stopCounter}`;
}

/**
 * Cok duraklu rota kurma formu.
 *
 * Akis bilincli olarak iki adimli: once tur kurulur ve hesaplanir, sonuc
 * gosterilir; surucuye acilmasi AYRI bir onay ister. Otomatik yayinlamak
 * dispatcher'in gormedigi bir plani sahaya gonderirdi.
 *
 * Adresler yalnizca oneriden secilerek girilebilir (AddressPickerFields ->
 * Photon -> Location). Ham metin gonderilmez: koordinatsiz durak, rota
 * motorunda opak bir hataya donusuyor.
 */
export function TourBuilder({
  date,
  driverId,
  driverOptions,
  companyOptions,
  vehicleOptions,
  onTourChange,
  onCancel,
}: TourBuilderProps) {
  const { t } = useTranslation();

  const [form, setForm] = useState<TourBuilderForm>(() => ({
    driverId,
    company: '',
    vehicle: '',
    startDate: date,
    startTime: '07:00',
    start: emptyStop('start'),
    stops: [emptyStop(nextStopKey())],
    returnToStart: true,
    name: '',
  }));
  const [tour, setTour] = useState<TourDetail | null>(null);
  const [busy, setBusy] = useState<'calculate' | null>(null);
  // Yalnizca bir durak acik kalir: dokuzu birden acikken ekran yine okunmaz olur.
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const issues = useMemo(() => validateTourForm(form), [form]);
  const blocked = useMemo(() => blockingStops(form), [form]);
  const unverified = useMemo(() => unverifiedStops(form), [form]);
  const canCalculate = issues.length === 0 && busy === null;

  const patch = useCallback((changes: Partial<TourBuilderForm>) => {
    setForm((current) => ({ ...current, ...changes }));
  }, []);

  const patchStop = useCallback((key: string, changes: Partial<TourBuilderStop>) => {
    setForm((current) => ({
      ...current,
      stops: current.stops.map((stop) => (stop.key === key ? { ...stop, ...changes } : stop)),
    }));
  }, []);

  const publish = useCallback(
    (next: TourDetail | null) => {
      setTour(next);
      onTourChange?.(next);
    },
    [onTourChange],
  );

  /**
   * Tur kurar ve hemen sirayi hesaplar.
   *
   * Iki cagri tek dugmede birlesiyor cunku dispatcher acisindan tek bir is:
   * "su duraklari en iyi sirayla planla". Optimizasyon reddedilirse tur yine
   * kalir — girdigi duraklar kaybolmaz, sadece sirasi kendi verdigi sira olur.
   */
  async function calculate() {
    if (!canCalculate) return;
    setBusy('calculate');
    try {
      const created = await toursApi.createFromStops(buildCreatePayload(form));
      const result = await toursApi.optimize(created.id);
      publish(result.tour);

      if (!result.optimized) {
        showToast({
          message: result.reasonCode
            ? t(`tours.skip.${result.reasonCode}`)
            : t('tours.notOptimized'),
          type: 'warning',
        });
      }
    } catch (error) {
      // Sunucu ulasilamayan duragi adresiyle bildiriyor; mesaji oldugu gibi
      // gostermek dispatcher'a hangi satiri duzeltecegini soyler.
      showToast({ message: getApiErrorMessage(error, t('tourBuilder.calculateFailed')), type: 'error' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4" data-testid="tour-builder">
      <div className="grid gap-3 lg:grid-cols-4">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          {t('tourBuilder.driver')}
          <Select
            value={form.driverId}
            onChange={(event) => patch({ driverId: event.target.value })}
            className="mt-1"
          >
            {driverOptions.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>

        <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          {t('tourBuilder.company')}
          <Select
            value={form.company}
            onChange={(event) => patch({ company: event.target.value })}
            className="mt-1"
          >
            <option value="">{t('tourBuilder.companyPlaceholder')}</option>
            {companyOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>

        <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          {t('tourBuilder.vehicle')}
          <Select
            value={form.vehicle}
            onChange={(event) => patch({ vehicle: event.target.value })}
            className="mt-1"
          >
            <option value="">{t('tourBuilder.vehiclePlaceholder')}</option>
            {vehicleOptions.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>

        <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          {t('tourBuilder.name')}
          <Input
            value={form.name}
            onChange={(event) => patch({ name: event.target.value })}
            placeholder={t('tourBuilder.namePlaceholder')}
            className="mt-1"
          />
        </label>

        <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          {t('tourBuilder.startDate')}
          <Input
            type="date"
            value={form.startDate}
            onChange={(event) => patch({ startDate: event.target.value })}
            className="mt-1"
          />
        </label>

        <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          {t('tourBuilder.startTime')}
          <Input
            type="time"
            value={form.startTime}
            onChange={(event) => patch({ startTime: event.target.value })}
            className="mt-1"
          />
        </label>

        <div className="lg:col-span-2">
          <AddressPickerFields
            label={t('tourBuilder.startAddress')}
            value={form.start.location?.rawAddress ?? ''}
            onChange={() => {
              /* secim onLocationChange ile gelir */
            }}
            onLocationChange={(location) =>
              setForm((current) => ({ ...current, start: { ...current.start, location } }))
            }
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={form.returnToStart}
          onChange={(event) => patch({ returnToStart: event.target.checked })}
        />
        {t('tourBuilder.returnToStart')}
      </label>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          {t('tourBuilder.stopsTitle', { count: form.stops.length })}
        </p>

        <ol className="space-y-2">
          {form.stops.map((stop, index) => (
            <TourStopRow
              key={stop.key}
              stop={stop}
              index={index}
              total={form.stops.length}
              expanded={expandedKey === stop.key}
              onToggle={() => setExpandedKey((current) => (current === stop.key ? null : stop.key))}
              onChange={(changes) => patchStop(stop.key, changes)}
              onRemove={() => patch({ stops: removeStop(form.stops, stop.key) })}
              onMove={(to) => patch({ stops: moveStop(form.stops, index, to) })}
            />
          ))}
        </ol>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            const created = emptyStop(nextStopKey());
            patch({ stops: [...form.stops, created] });
            setExpandedKey(created.key);
          }}
        >
          <Plus className="mr-2 h-3.5 w-3.5" />
          {t('tourBuilder.addStop')}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => void calculate()} disabled={!canCalculate}>
          {busy === 'calculate' ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Route className="mr-2 h-4 w-4" />
          )}
          {t('tourBuilder.calculate')}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('tourBuilder.cancel')}
          </Button>
        ) : null}

        {/*
          Devre disi bir dugme tek basina neyi duzeltecegini soylemez; sebep
          hemen yaninda duruyor. Engelleyen sebep once gosterilir.
        */}
        {issues.length > 0 ? (
          <span data-testid="tour-blocking-reason" className="text-xs text-rose-700">
            {blocked.length > 0
              ? t('tourBuilder.blockedBy', {
                  count: blocked.length,
                  addresses: blocked.map((stop) => stop.location?.rawAddress).join(', '),
                })
              : t(`tourBuilder.issue.${issues[0]}`)}
          </span>
        ) : null}

        {/*
          "Dogrulanamadi" bir hata degil: rota motoru kapaliysa ya da adres
          harita kapsaminin disindaysa olusur. Sessiz dipnot, engel degil.
        */}
        {unverified.length > 0 ? (
          <span
            data-testid="tour-unverified-note"
            className="ml-auto text-xs text-slate-500"
          >
            {t('tourBuilder.unverifiedNote', { count: unverified.length })}
          </span>
        ) : null}
      </div>

      {tour ? <TourResultPanel tour={tour} onTourChange={publish} /> : null}
    </div>
  );
}
