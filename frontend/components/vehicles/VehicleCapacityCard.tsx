'use client';

import { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, HelpCircle, Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getApiErrorMessage, vehiclesApi } from '@/lib/api';
import { showToast } from '@/lib/toast';
import {
  ADR_CHOICES,
  CAPACITY_FIELDS,
  CAPACITY_FIELD_COUNT,
  buildCapacityPayload,
  errorLabelKey,
  fieldLabelKey,
  isDirty as draftIsDirty,
  toDraft,
  unverifiedCount,
  validateDraft,
  type AdrValue,
  type CapacityDraft,
  type CapacityFieldKey,
  type CapacityValues,
} from '@/lib/vehicle-capacity';
import type { Vehicle } from '@/lib/types';

interface VehicleCapacityCardProps {
  vehicleId: string;
  vehicle: Partial<CapacityValues>;
  /** Duzenleme yetkisi. false ise duzenleme aksiyonu HIC render edilmez. */
  canEdit: boolean;
  onSaved?: (vehicle: Vehicle) => void;
}

/**
 * ARAC KAPASITESI VE KISITLARI (Faz 17g).
 *
 * EKSIK BILGI ACIKCA "DOGRULANAMADI" GORUNUR. Bos bir alani "0" ya da "-"
 * gostermek, dispatcher'a olculmus bir deger izlenimi verirdi; oysa uygunluk
 * motoru o alani `unknown` sayiyor ve `unknown` hicbir zaman "uygun" degil.
 * Bu yuzden eksik alanlar ikon + metin ile isaretleniyor — renk tek basina
 * anlam tasimiyor.
 *
 * DEMO/VARSAYILAN DEGER URETILMIYOR: kart yalnizca sunucudan geleni gosterir.
 * "Ornek" bir kapasite yazsaydik, o deger gercek veriden ayirt edilemezdi.
 *
 * ROL: `canEdit` sunucudaki `@RequiresWrite()` ile ayni kumeyi tasimali
 * (admin/boss/office). Muhasebe araci GORUR ama kaydedemez; buraya eklenirse
 * arayuz duzenleme acar ve kullanici kaydederken 403 alir.
 */
export function VehicleCapacityCard({
  vehicleId,
  vehicle,
  canEdit,
  onSaved,
}: VehicleCapacityCardProps) {
  const { t, i18n } = useTranslation();

  const savedDraft = useMemo(() => toDraft(vehicle), [vehicle]);
  const [draft, setDraft] = useState<CapacityDraft>(savedDraft);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const errors = useMemo(() => validateDraft(draft), [draft]);
  const hasErrors = Object.keys(errors).length > 0;
  const dirty = useMemo(() => draftIsDirty(draft, savedDraft), [draft, savedDraft]);
  const missing = useMemo(() => unverifiedCount(vehicle), [vehicle]);

  const numberFormat = useMemo(
    () => new Intl.NumberFormat(i18n.language),
    [i18n.language],
  );

  const startEditing = useCallback(() => {
    setDraft(savedDraft);
    setFormError(null);
    setEditing(true);
  }, [savedDraft]);

  const cancelEditing = useCallback(() => {
    setDraft(savedDraft);
    setFormError(null);
    setEditing(false);
  }, [savedDraft]);

  const setField = useCallback((key: CapacityFieldKey, value: string) => {
    setFormError(null);
    setDraft((previous) => ({ ...previous, [key]: value }));
  }, []);

  const setAdr = useCallback((value: AdrValue) => {
    setFormError(null);
    setDraft((previous) => ({ ...previous, adr_certified: value }));
  }, []);

  const save = useCallback(async () => {
    if (hasErrors) {
      setFormError(t('vehicleDetail.capacity.fixErrors'));
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const updated = await vehiclesApi.update(vehicleId, buildCapacityPayload(draft) as never);
      setEditing(false);
      onSaved?.(updated);
      showToast({ message: t('vehicleDetail.capacity.saveSuccess'), type: 'success' });
    } catch (error) {
      // Ham hata kodu ya da Ingilizce backend metni GOSTERILMEZ.
      const message = t(getApiErrorMessage(error, 'vehicleDetail.capacity.saveError'));
      setFormError(message);
      showToast({ message, type: 'error' });
      // Duzenleme modu ve girilen degerler KORUNUYOR: kullanici bastan girmesin.
    } finally {
      setSaving(false);
    }
  }, [draft, hasErrors, onSaved, t, vehicleId]);

  const adrLabel = useMemo(() => {
    const choice = ADR_CHOICES.find((item) => item.value === (vehicle.adr_certified ?? null));
    return choice ? t(choice.labelKey) : t('vehicleDetail.capacity.adr.unknown');
  }, [t, vehicle.adr_certified]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>{t('vehicleDetail.capacity.title')}</CardTitle>
          {canEdit && !editing ? (
            <Button
              variant="outline"
              size="sm"
              onClick={startEditing}
              data-testid="vehicle-capacity-edit"
            >
              <span className="inline-flex items-center">
                <Pencil className="mr-1 h-4 w-4" aria-hidden="true" />
                {t('vehicleDetail.capacity.edit')}
              </span>
            </Button>
          ) : null}
        </div>
        <p className="text-sm text-slate-500">{t('vehicleDetail.capacity.subtitle')}</p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* EKSIK ALAN SAYISI BASLIKTA: dispatcher plan yapmadan once neyin
            dogrulanmadigini gormeli. */}
        {missing > 0 ? (
          <p
            role="status"
            data-testid="vehicle-capacity-unverified"
            className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {t('vehicleDetail.capacity.unverifiedSummary', {
                missing,
                total: CAPACITY_FIELD_COUNT,
              })}
            </span>
          </p>
        ) : null}

        {editing ? (
          <div className="space-y-5">
            <fieldset className="space-y-3" disabled={saving}>
              <legend className="text-sm font-semibold text-slate-900">
                {t('vehicleDetail.capacity.numbersGroup')}
              </legend>
              <p className="text-xs text-slate-600">{t('vehicleDetail.capacity.emptyMeansUnknown')}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {CAPACITY_FIELDS.map((spec) => {
                  const inputId = `capacity-${spec.key}`;
                  const errorCode = errors[spec.key];
                  return (
                    <div key={spec.key} className="flex flex-col gap-1">
                      <label htmlFor={inputId} className="text-sm font-medium text-slate-800">
                        {t(fieldLabelKey(spec.key))}
                        {spec.unit ? (
                          <span className="ml-1 font-normal text-slate-500">{`(${spec.unit})`}</span>
                        ) : null}
                      </label>
                      <input
                        id={inputId}
                        data-testid={inputId}
                        // `text` + `inputMode`: `number` girdisi Almanca
                        // klavyede virgullu degeri sessizce dusuruyordu.
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-[#1a4d7a]"
                        value={draft[spec.key]}
                        aria-invalid={errorCode ? true : undefined}
                        aria-describedby={errorCode ? `${inputId}-error` : `${inputId}-hint`}
                        onChange={(event) => setField(spec.key, event.target.value)}
                      />
                      {errorCode ? (
                        <p
                          id={`${inputId}-error`}
                          role="alert"
                          className="text-xs font-medium text-red-700"
                        >
                          {t(errorLabelKey(errorCode), { max: numberFormat.format(spec.max) })}
                        </p>
                      ) : (
                        <p id={`${inputId}-hint`} className="text-xs text-slate-500">
                          {t('vehicleDetail.capacity.maxHint', {
                            max: numberFormat.format(spec.max),
                          })}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="space-y-2" disabled={saving}>
              <legend className="text-sm font-semibold text-slate-900">
                {t('vehicleDetail.capacity.adrGroup')}
              </legend>
              {/* UC DURUMLU VE UCU DE ACIK BIR SECIM: "bilinmiyor" bir onay
                  kutusunun kapali hali DEGIL, ayri bir cevap. */}
              <p className="text-xs text-slate-600">{t('vehicleDetail.capacity.adrHint')}</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
                {ADR_CHOICES.map((choice) => {
                  const id = `capacity-adr-${String(choice.value)}`;
                  return (
                    <div key={id} className="flex items-center gap-2">
                      <input
                        id={id}
                        data-testid={id}
                        type="radio"
                        name="capacity-adr"
                        className="h-4 w-4 border-slate-300 text-[#1a4d7a] focus:ring-2 focus:ring-[#1a4d7a]"
                        checked={draft.adr_certified === choice.value}
                        onChange={() => setAdr(choice.value)}
                      />
                      <label htmlFor={id} className="text-sm text-slate-800">
                        {t(choice.labelKey)}
                      </label>
                    </div>
                  );
                })}
              </div>
            </fieldset>

            {formError ? (
              <p role="alert" className="text-sm font-medium text-red-700">
                {formError}
              </p>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                onClick={() => void save()}
                disabled={saving || !dirty || hasErrors}
                data-testid="vehicle-capacity-save"
              >
                {saving ? t('vehicleDetail.capacity.saving') : t('vehicleDetail.capacity.save')}
              </Button>
              <Button variant="outline" onClick={cancelEditing} disabled={saving}>
                {t('vehicleDetail.capacity.cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CAPACITY_FIELDS.map((spec) => {
              const value = vehicle[spec.key];
              const known = value !== null && value !== undefined;
              return (
                <div key={spec.key} className="rounded-lg border border-slate-200 p-3">
                  <dt className="text-xs font-medium text-slate-600">
                    {t(fieldLabelKey(spec.key))}
                  </dt>
                  <dd
                    className="mt-1 text-sm text-slate-900"
                    data-testid={`capacity-value-${spec.key}`}
                  >
                    {known ? (
                      <span className="font-semibold">
                        {numberFormat.format(value)}
                        {spec.unit ? <span className="ml-1 font-normal">{spec.unit}</span> : null}
                      </span>
                    ) : (
                      /* EKSIK ALAN: ikon + metin. "0" ya da "-" DEGIL. */
                      <span className="inline-flex items-center gap-1 text-amber-800">
                        <HelpCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {t('vehicleDetail.capacity.unverified')}
                      </span>
                    )}
                  </dd>
                </div>
              );
            })}

            <div className="rounded-lg border border-slate-200 p-3">
              <dt className="text-xs font-medium text-slate-600">
                {t('vehicleDetail.capacity.adrGroup')}
              </dt>
              <dd className="mt-1 text-sm" data-testid="capacity-value-adr_certified">
                {vehicle.adr_certified === null || vehicle.adr_certified === undefined ? (
                  <span className="inline-flex items-center gap-1 text-amber-800">
                    <HelpCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {t('vehicleDetail.capacity.unverified')}
                  </span>
                ) : (
                  /* Durum METINLE de yaziliyor — yalnizca badge rengiyle
                     ayirt edilmemeli. */
                  <Badge variant={vehicle.adr_certified ? 'success' : 'secondary'}>
                    {adrLabel}
                  </Badge>
                )}
              </dd>
            </div>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
