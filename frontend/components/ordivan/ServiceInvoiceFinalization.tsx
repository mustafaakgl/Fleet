'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { vehiclesApi } from '@/lib/api';
import { FLEET_FILTER_SELECT } from '@/lib/fleet-table';
import type {
  AutomationProposalDetail,
  ServiceInvoiceCostBasis,
  ServiceInvoiceDraft,
  Vehicle,
} from '@/lib/types';

export interface ServiceInvoiceConfirmation {
  vehicleId: string;
  costBasis: ServiceInvoiceCostBasis;
  costAmount: number;
  currency: string;
  serviceDate: string;
  repairCompany: string;
  serviceType: string;
  mileageKm?: number;
  notes?: string;
}

/**
 * Servis faturasi onay bloku (Faz 13).
 *
 * IKI KARAR KULLANICININ:
 *   1. HANGI ARAC — ajan arac SECMEZ. Sunucu deterministik eslestirme yapar;
 *      sonuc belirsizse (`unknown`/`failed`) kullanici listeden secmeden onay
 *      verilemez.
 *   2. HANGI TUTAR — `ServiceRecord.costAmount`in net mi brut mu oldugu repoda
 *      ACIK DEGIL. Bu yuzden net, vergi ve brut UCU DE gosteriliyor ve
 *      kaydedilecek olan acikca secttiriliyor.
 *
 * Para birimi EUR VARSAYILMIYOR: bos ise onay acilmiyor.
 */
export function ServiceInvoiceFinalization({
  detail,
  value,
  onChange,
}: {
  detail: AutomationProposalDetail;
  value: ServiceInvoiceConfirmation | null;
  onChange: (next: ServiceInvoiceConfirmation | null) => void;
}) {
  const { t } = useTranslation();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  const draft = detail.payload as ServiceInvoiceDraft;
  const evidence = detail.evidence as
    | { vehicleMatch?: { status: string; vehicleId: string | null; reason: string } }
    | null;
  const match = evidence?.vehicleMatch ?? null;

  useEffect(() => {
    void vehiclesApi
      .list({ limit: 500 })
      .then((response) => setVehicles(response.data ?? []))
      .catch(() => setVehicles([]));
  }, []);

  const costChoices = useMemo(() => {
    const options: Array<{ basis: ServiceInvoiceCostBasis; amount: number }> = [];
    if (typeof draft.netAmount === 'number') options.push({ basis: 'net', amount: draft.netAmount });
    if (typeof draft.grossAmount === 'number') {
      options.push({ basis: 'gross', amount: draft.grossAmount });
    }
    return options;
  }, [draft.netAmount, draft.grossAmount]);

  // Ilk deger: sunucunun kesin eslestirdigi arac (varsa). Belirsizse BOS —
  // kullanici bilincli olarak secmek zorunda.
  useEffect(() => {
    if (value) return;
    onChange({
      vehicleId: match?.status === 'verified' ? (match.vehicleId ?? '') : '',
      costBasis: costChoices[0]?.basis ?? 'gross',
      costAmount: costChoices[0]?.amount ?? 0,
      currency: (draft.currency ?? '').toUpperCase(),
      serviceDate: draft.serviceDate ?? '',
      repairCompany: draft.vendorName ?? '',
      serviceType: draft.serviceDescription ?? '',
      mileageKm: typeof draft.mileageKm === 'number' ? draft.mileageKm : undefined,
    });
  }, [value, match, costChoices, draft, onChange]);

  if (!value) return null;

  const patch = (next: Partial<ServiceInvoiceConfirmation>) => onChange({ ...value, ...next });
  const selectedVehicle = vehicles.find((item) => item.id === value.vehicleId);

  return (
    <div className="space-y-3 rounded-md border p-3" data-testid="service-invoice-finalization">
      <h4 className="text-sm font-semibold">{t('automation.serviceInvoice.title')}</h4>

      {/* --- Arac --- */}
      <div className="space-y-1">
        <label className="text-xs font-medium" htmlFor="service-invoice-vehicle">
          {t('automation.serviceInvoice.vehicle')}
        </label>
        {match ? (
          <p className="text-xs text-muted-foreground" data-testid="service-invoice-match">
            {t(`automation.serviceInvoice.match.${match.status}`, { reason: match.reason })}
          </p>
        ) : null}
        <select
          id="service-invoice-vehicle"
          className={FLEET_FILTER_SELECT}
          value={value.vehicleId}
          onChange={(event) => patch({ vehicleId: event.target.value })}
          data-testid="service-invoice-vehicle-select"
        >
          <option value="">{t('automation.serviceInvoice.selectVehicle')}</option>
          {vehicles.map((vehicle) => (
            <option key={vehicle.id} value={vehicle.id}>
              {vehicle.plate_number}
            </option>
          ))}
        </select>
        {/* Belgeden okunan ipuclari — karar degil, kanit. */}
        <p className="text-xs text-muted-foreground">
          {t('automation.serviceInvoice.extractedVehicle', {
            plate: draft.plateNumber ?? '—',
            vin: draft.vin ?? '—',
          })}
        </p>
      </div>

      {/* --- Tutar: net, vergi ve brut UCU DE gorunuyor --- */}
      <div className="space-y-1">
        <span className="text-xs font-medium">{t('automation.serviceInvoice.amounts')}</span>
        <dl className="grid grid-cols-3 gap-2 text-xs" data-testid="service-invoice-amounts">
          <div>
            <dt className="text-muted-foreground">{t('automation.serviceInvoice.net')}</dt>
            <dd>{draft.netAmount ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('automation.serviceInvoice.tax')}</dt>
            <dd>{draft.taxAmount ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('automation.serviceInvoice.gross')}</dt>
            <dd>{draft.grossAmount ?? '—'}</dd>
          </div>
        </dl>

        <fieldset className="mt-1">
          <legend className="text-xs font-medium">
            {t('automation.serviceInvoice.costBasisLegend')}
          </legend>
          {costChoices.length === 0 ? (
            <p className="text-xs text-red-600">{t('automation.serviceInvoice.noAmount')}</p>
          ) : (
            <div className="flex gap-4">
              {costChoices.map((choice) => (
                <label key={choice.basis} className="flex items-center gap-1 text-xs">
                  <input
                    type="radio"
                    name="service-invoice-cost-basis"
                    checked={value.costBasis === choice.basis}
                    onChange={() => patch({ costBasis: choice.basis, costAmount: choice.amount })}
                    data-testid={`service-invoice-basis-${choice.basis}`}
                  />
                  {t(`automation.serviceInvoice.basis.${choice.basis}`)} · {choice.amount}
                </label>
              ))}
            </div>
          )}
        </fieldset>
      </div>

      {/* --- Zorunlu alanlar --- */}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs" htmlFor="service-invoice-currency">
          {t('automation.serviceInvoice.currency')}
          <Input
            id="service-invoice-currency"
            className="mt-1 text-xs"
            maxLength={3}
            value={value.currency}
            placeholder={t('automation.serviceInvoice.currencyPlaceholder')}
            onChange={(event) => patch({ currency: event.target.value.toUpperCase() })}
            data-testid="service-invoice-currency"
          />
        </label>
        <label className="text-xs" htmlFor="service-invoice-date">
          {t('automation.serviceInvoice.serviceDate')}
          <Input
            id="service-invoice-date"
            type="date"
            className="mt-1 text-xs"
            value={value.serviceDate}
            onChange={(event) => patch({ serviceDate: event.target.value })}
            data-testid="service-invoice-date"
          />
        </label>
        <label className="text-xs" htmlFor="service-invoice-company">
          {t('automation.serviceInvoice.repairCompany')}
          <Input
            id="service-invoice-company"
            className="mt-1 text-xs"
            value={value.repairCompany}
            onChange={(event) => patch({ repairCompany: event.target.value })}
            data-testid="service-invoice-company"
          />
        </label>
        <label className="text-xs" htmlFor="service-invoice-type">
          {t('automation.serviceInvoice.serviceType')}
          <Input
            id="service-invoice-type"
            className="mt-1 text-xs"
            value={value.serviceType}
            onChange={(event) => patch({ serviceType: event.target.value })}
            data-testid="service-invoice-type"
          />
        </label>
      </div>

      {/* --- Onaylandiginda ne olusacak --- */}
      <div className="rounded-md bg-muted/40 p-2 text-xs" data-testid="service-invoice-summary">
        <p className="font-medium">{t('automation.serviceInvoice.summaryTitle')}</p>
        <p>
          {t('automation.serviceInvoice.summaryBody', {
            plate: selectedVehicle?.plate_number ?? '—',
            amount: value.costAmount,
            currency: value.currency || '—',
            basis: t(`automation.serviceInvoice.basis.${value.costBasis}`),
            date: value.serviceDate || '—',
          })}
        </p>
      </div>

      {/* --- Onay sonrasi: olusan kayda ve arac gecmisine baglanti --- */}
      {detail.serviceRecord ? (
        <p className="text-xs" data-testid="service-invoice-created">
          {t('automation.serviceInvoice.created', { id: detail.serviceRecord.id })}{' '}
          <Link
            className="underline underline-offset-2"
            href={`/vehicles/${detail.serviceRecord.vehicleId}`}
          >
            {t('automation.serviceInvoice.openHistory')}
          </Link>
        </p>
      ) : null}

      {/* Fatura satirlari onerinin ICINDE korunuyor — paralel model yok. */}
      {draft.lineItems && draft.lineItems.length > 0 ? (
        <details className="text-xs" data-testid="service-invoice-line-items">
          <summary>{t('automation.serviceInvoice.lineItems', { count: draft.lineItems.length })}</summary>
          <ul className="mt-1 space-y-0.5">
            {draft.lineItems.map((item, index) => (
              <li key={`${item.description}-${index}`}>
                {item.description} · {item.totalPrice ?? '—'}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {value.vehicleId ? null : (
        <p className="text-xs text-red-600" data-testid="service-invoice-vehicle-required">
          {t('automation.serviceInvoice.vehicleRequired')}
        </p>
      )}
      <Badge variant="outline">{t('automation.serviceInvoice.noAutoApprove')}</Badge>
    </div>
  );
}
