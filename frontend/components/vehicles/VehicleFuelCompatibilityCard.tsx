'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getApiErrorMessage, vehiclesApi } from '@/lib/api';
import { showToast } from '@/lib/toast';
import {
  ADDITIVE_PRODUCTS,
  PRIMARY_PRODUCTS,
  PRIMARY_USAGES,
  UI_COMPATIBILITY_SOURCE,
  buildCompatibilityPayload,
  fuelCompatibilityErrorKey,
  fuelProductLabelKey,
  fuelSourceLabelKey,
  fuelUsageLabelKey,
  isKnownFuelProduct,
  previewCompatibleProducts,
  selectionFromEntries,
  validateSelections,
  validationErrorKey,
  type FuelCompatibilitySelection,
} from '@/lib/fuel-compatibility';
import type {
  FuelProductType,
  FuelProductUsage,
  VehicleFuelCompatibilityResponse,
} from '@/lib/types';

interface VehicleFuelCompatibilityCardProps {
  vehicleId: string;
  /** Duzenleme yetkisi. false ise duzenleme aksiyonu HIC render edilmez. */
  canEdit: boolean;
}

/** Secim listesinde bir urunun kaydini bulur (kullanim turune bakmadan). */
function findSelection(
  selections: readonly FuelCompatibilitySelection[],
  product: FuelProductType,
): FuelCompatibilitySelection | undefined {
  return selections.find((selection) => selection.productType === product);
}

/**
 * Aracin onayli yakit urunlerini gosterir ve yetkili kullaniciya duzenletir.
 *
 * Neden ayri bilesen: arac detay sayfasi sunucu verisini kendi icinde tutan bir
 * yigin; bu bolum kendi yuklemesini, duzenleme durumunu ve hata metnini
 * tasiyor. Ayrica bilesen olarak test edilebiliyor (vitest yalnizca
 * components/**\/*.test.tsx ve lib/**\/*.test.ts topluyor).
 */
export function VehicleFuelCompatibilityCard({
  vehicleId,
  canEdit,
}: VehicleFuelCompatibilityCardProps) {
  const { t } = useTranslation();

  const [data, setData] = useState<VehicleFuelCompatibilityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [selections, setSelections] = useState<FuelCompatibilitySelection[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await vehiclesApi.getFuelCompatibility(vehicleId);
      setData(response);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [vehicleId]);

  useEffect(() => {
    void load();
  }, [load]);

  const entries = useMemo(() => data?.entries ?? [], [data]);

  /** Sunucudaki hali — "degisiklik var mi" karsilastirmasinin dayanagi. */
  const savedSelections = useMemo(() => selectionFromEntries(entries), [entries]);

  const primaryEntries = useMemo(
    () => entries.filter((entry) => entry.usageType !== 'ADDITIVE'),
    [entries],
  );
  const additiveEntries = useMemo(
    () => entries.filter((entry) => entry.usageType === 'ADDITIVE'),
    [entries],
  );

  const startEditing = useCallback(() => {
    setSelections(savedSelections);
    setFormError(null);
    setEditing(true);
  }, [savedSelections]);

  const cancelEditing = useCallback(() => {
    setEditing(false);
    setFormError(null);
    setSelections([]);
  }, []);

  const toggleProduct = useCallback(
    (product: FuelProductType, usageType: FuelProductUsage) => {
      setFormError(null);
      setSelections((previous) => {
        const existing = findSelection(previous, product);
        if (existing) {
          return previous.filter((selection) => selection.productType !== product);
        }
        // Yeni kaydin kaynagi ADMIN: bu ekrandan gelen bilgi ofisin elle
        // isaretlemesi. Mevcut kayitlarin kaynagi asagida KORUNUYOR.
        return [
          ...previous,
          { productType: product, usageType, approved: true, source: UI_COMPATIBILITY_SOURCE },
        ];
      });
    },
    [],
  );

  const changeUsage = useCallback((product: FuelProductType, usageType: FuelProductUsage) => {
    setFormError(null);
    setSelections((previous) =>
      previous.map((selection) =>
        selection.productType === product ? { ...selection, usageType } : selection,
      ),
    );
  }, []);

  /** Tanidigimiz gruplara girmeyen kayitlar — sessizce kaybedilmiyor. */
  const unknownSelections = useMemo(
    () =>
      selections.filter(
        (selection) =>
          !isKnownFuelProduct(selection.productType) ||
          (selection.usageType === 'ADDITIVE'
            ? !ADDITIVE_PRODUCTS.includes(selection.productType)
            : !PRIMARY_PRODUCTS.includes(selection.productType)),
      ),
    [selections],
  );

  const previewProducts = useMemo(() => previewCompatibleProducts(selections), [selections]);

  const isDirty = useMemo(() => {
    const normalize = (list: readonly FuelCompatibilitySelection[]) =>
      [...list]
        .map(
          (selection) =>
            `${selection.productType}:${selection.usageType}:${selection.approved}:${selection.source}`,
        )
        .sort()
        .join('|');
    return normalize(selections) !== normalize(savedSelections);
  }, [selections, savedSelections]);

  const save = useCallback(async () => {
    const validationCode = validateSelections(selections);
    if (validationCode) {
      setFormError(t(validationErrorKey(validationCode)));
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const response = await vehiclesApi.replaceFuelCompatibility(
        vehicleId,
        buildCompatibilityPayload(selections),
      );
      setData(response);
      setEditing(false);
      setSelections([]);
      showToast({
        message: t('vehicleDetail.fuelCompatibility.saveSuccess'),
        type: 'success',
      });
    } catch (error) {
      // Bilinen makine kodu -> cevrilmis metin. Bilinmiyorsa mevcut genel hata
      // yaklasimi. Ham kod ya da Ingilizce backend metni gosterilmez.
      const knownKey = fuelCompatibilityErrorKey(error);
      const message = knownKey
        ? t(knownKey)
        : t(getApiErrorMessage(error, 'vehicleDetail.fuelCompatibility.saveError'));
      setFormError(message);
      showToast({ message, type: 'error' });
      // Duzenleme modu ve secimler KORUNUYOR: kullanici bastan girmesin.
    } finally {
      setSaving(false);
    }
  }, [selections, t, vehicleId]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>{t('vehicleDetail.fuelCompatibility.title')}</CardTitle>
          {canEdit && !editing && !loading && !loadError ? (
            <Button variant="outline" size="sm" onClick={startEditing}>
              <span className="inline-flex items-center">
                <Pencil className="mr-1 h-4 w-4" />
                {t('vehicleDetail.fuelCompatibility.edit')}
              </span>
            </Button>
          ) : null}
        </div>
        <p className="text-sm text-slate-500">{t('vehicleDetail.fuelCompatibility.subtitle')}</p>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-3" data-testid="fuel-compatibility-skeleton">
            <Skeleton className="h-4 w-32" />
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-6 w-28" />
            </div>
            <Skeleton className="h-4 w-40" />
          </div>
        ) : loadError ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">
              {t('vehicleDetail.fuelCompatibility.loadError')}
            </p>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              {t('vehicleDetail.fuelCompatibility.retry')}
            </Button>
          </div>
        ) : editing ? (
          <div className="space-y-5">
            <fieldset className="space-y-3" disabled={saving}>
              <legend className="text-sm font-semibold text-slate-900">
                {t('vehicleDetail.fuelCompatibility.primaryGroup')}
              </legend>
              <p className="text-xs text-slate-600">
                {t('vehicleDetail.fuelCompatibility.primaryGroupHint')}
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {PRIMARY_PRODUCTS.map((product) => {
                  const selection = findSelection(selections, product);
                  const checkboxId = `fuel-primary-${product}`;
                  const usageId = `fuel-primary-usage-${product}`;
                  return (
                    <div
                      key={product}
                      className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          id={checkboxId}
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-[#1a4d7a] focus:ring-2 focus:ring-[#1a4d7a]"
                          checked={Boolean(selection)}
                          onChange={() => toggleProduct(product, 'PRIMARY')}
                        />
                        <label
                          htmlFor={checkboxId}
                          className="text-sm font-medium text-slate-800"
                        >
                          {t(fuelProductLabelKey(product))}
                        </label>
                      </div>
                      {selection ? (
                        <div className="space-y-1">
                          <label htmlFor={usageId} className="block text-xs text-slate-600">
                            {t('vehicleDetail.fuelCompatibility.usageLabel')}
                          </label>
                          <select
                            id={usageId}
                            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 focus:ring-2 focus:ring-[#1a4d7a]"
                            value={selection.usageType}
                            onChange={(event) =>
                              changeUsage(product, event.target.value as FuelProductUsage)
                            }
                          >
                            {PRIMARY_USAGES.map((usage) => (
                              <option key={usage} value={usage}>
                                {t(fuelUsageLabelKey(usage))}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="space-y-3" disabled={saving}>
              <legend className="text-sm font-semibold text-slate-900">
                {t('vehicleDetail.fuelCompatibility.additiveGroup')}
              </legend>
              <p className="text-xs text-slate-600">
                {t('vehicleDetail.fuelCompatibility.additiveGroupHint')}
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {ADDITIVE_PRODUCTS.map((product) => {
                  const selection = findSelection(selections, product);
                  const checkboxId = `fuel-additive-${product}`;
                  return (
                    <div
                      key={product}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 p-3"
                    >
                      <input
                        id={checkboxId}
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-[#1a4d7a] focus:ring-2 focus:ring-[#1a4d7a]"
                        checked={Boolean(selection)}
                        // ADDITIVE sabit: AdBlue baska bir kullanim turuyle
                        // kaydedilemez (backend adblue_must_be_additive).
                        onChange={() => toggleProduct(product, 'ADDITIVE')}
                      />
                      <label htmlFor={checkboxId} className="text-sm font-medium text-slate-800">
                        {t(fuelProductLabelKey(product))}
                      </label>
                    </div>
                  );
                })}
              </div>
            </fieldset>

            {unknownSelections.length > 0 ? (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-700">
                  {t('vehicleDetail.fuelCompatibility.otherGroup')}
                </p>
                <p className="text-xs text-slate-600">
                  {t('vehicleDetail.fuelCompatibility.otherGroupHint')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {unknownSelections.map((selection) => (
                    <Badge
                      key={`${selection.productType}-${selection.usageType}`}
                      variant="secondary"
                    >
                      {isKnownFuelProduct(selection.productType)
                        ? t(fuelProductLabelKey(selection.productType))
                        : selection.productType}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            {previewProducts.length === 0 ? (
              <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{t('vehicleDetail.fuelCompatibility.noPrimaryWarning')}</span>
              </p>
            ) : null}

            {formError ? (
              <p role="alert" className="text-sm font-medium text-red-700">
                {formError}
              </p>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={() => void save()} disabled={saving || !isDirty}>
                {saving
                  ? t('vehicleDetail.fuelCompatibility.saving')
                  : t('vehicleDetail.fuelCompatibility.save')}
              </Button>
              <Button variant="outline" onClick={cancelEditing} disabled={saving}>
                {t('vehicleDetail.fuelCompatibility.cancel')}
              </Button>
            </div>
          </div>
        ) : entries.length === 0 ? (
          <p
            role="status"
            className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
          >
            {/* Renk tek basina anlam tasimiyor: ikon + metin birlikte. */}
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t('vehicleDetail.fuelCompatibility.empty')}</span>
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-900">
                {t('vehicleDetail.fuelCompatibility.primaryGroup')}
              </p>
              {primaryEntries.length === 0 ? (
                <p className="flex items-start gap-2 text-sm text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{t('vehicleDetail.fuelCompatibility.noPrimaryWarning')}</span>
                </p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {primaryEntries.map((entry) => (
                    <li key={entry.id}>
                      <Badge variant={entry.approved ? 'success' : 'secondary'}>
                        <span>
                          {isKnownFuelProduct(entry.productType)
                            ? t(fuelProductLabelKey(entry.productType))
                            : entry.productType}
                        </span>
                        {/* Onay durumu ve kullanim turu METINLE de yaziliyor —
                            yalnizca badge rengiyle ayirt edilmemeli. */}
                        <span className="ml-1 font-normal">
                          {`· ${t(fuelUsageLabelKey(entry.usageType))}`}
                        </span>
                        {!entry.approved ? (
                          <span className="ml-1 font-normal">
                            {`· ${t('vehicleDetail.fuelCompatibility.notApproved')}`}
                          </span>
                        ) : null}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-900">
                {t('vehicleDetail.fuelCompatibility.additiveGroup')}
              </p>
              {additiveEntries.length === 0 ? (
                <p className="text-sm text-slate-500">
                  {t('vehicleDetail.fuelCompatibility.noAdditives')}
                </p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {additiveEntries.map((entry) => (
                    <li key={entry.id}>
                      <Badge variant="outline">
                        {isKnownFuelProduct(entry.productType)
                          ? t(fuelProductLabelKey(entry.productType))
                          : entry.productType}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <dl className="text-xs text-slate-600">
              <dt className="font-medium">{t('vehicleDetail.fuelCompatibility.sourceLabel')}</dt>
              <dd>
                {[...new Set(entries.map((entry) => entry.source))]
                  .map((source) => t(fuelSourceLabelKey(source)))
                  .join(', ')}
              </dd>
            </dl>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
