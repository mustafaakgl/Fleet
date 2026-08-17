'use client';

import { useCallback, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { fuelReceiptReviewApi } from '@/lib/api';
import { extractApiErrorCode } from '@/lib/fuel-station-view';
import { reversalErrorKey } from '@/lib/fuel-reversal-view';
import type { FuelReceiptReviewDetail } from '@/lib/types';

/**
 * Duzeltilmis kopyanin duzenlenmesi.
 *
 * KAYDETMEK ONAYLAMAZ. Onay, mevcut "Onayla" aksiyonuyla ve AYRI bir istekle
 * gecer — tek tikla hem duzelt hem onayla, "iki goz" kuralini yok ederdi.
 *
 * Hata halinde form degerleri KORUNUYOR: sunucu reddettiginde kullanicinin
 * yeniden yazmasi gereken hicbir sey yok.
 */
export function FuelReceiptCorrectionForm({
  detail,
  onSaved,
}: {
  detail: FuelReceiptReviewDetail;
  onSaved: () => void;
}) {
  const { t } = useTranslation();

  const [form, setForm] = useState({
    purchasedAt: detail.purchasedAt.slice(0, 16),
    liters: detail.liters ?? 0,
    pricePerLiter: detail.pricePerLiter ?? '',
    fuelGrossAmount: detail.fuelGrossAmount ?? 0,
    currency: detail.currency,
    stationName: detail.stationName ?? '',
    receiptNumber: detail.receiptNumber ?? '',
    odometerKm: detail.odometerKm ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setSavedAt(null);
  };

  const save = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setErrorKey(null);
    try {
      await fuelReceiptReviewApi.updateCorrection(detail.id, {
        expectedUpdatedAt: detail.updatedAt,
        purchasedAt: new Date(form.purchasedAt).toISOString(),
        // Yakit turu bu formda DEGISTIRILMIYOR: fisin uzerindeki urun,
        // duzeltmenin konusu degil; yanlissa fisin kendisi yanlistir.
        fuelProduct: detail.fuelProduct,
        liters: Number(form.liters),
        pricePerLiter: form.pricePerLiter === '' ? undefined : Number(form.pricePerLiter),
        fuelGrossAmount: Number(form.fuelGrossAmount),
        currency: form.currency.trim().toUpperCase(),
        stationName: form.stationName.trim() || undefined,
        receiptNumber: form.receiptNumber.trim() || undefined,
        odometerKm: form.odometerKm === '' ? undefined : Number(form.odometerKm),
      });
      setSavedAt(Date.now());
      onSaved();
    } catch (caught) {
      setErrorKey(reversalErrorKey(extractApiErrorCode(caught)));
    } finally {
      setBusy(false);
    }
  }, [busy, detail.fuelProduct, detail.id, detail.updatedAt, form, onSaved]);

  return (
    <div className="space-y-3 rounded-md border p-3" data-testid="correction-form">
      <h3 className="text-sm font-semibold">{t('costs.fuelReceipts.correction.title')}</h3>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          id="correction-purchased-at"
          label={t('costs.fuelReceipts.date')}
          type="datetime-local"
          value={form.purchasedAt}
          disabled={busy}
          onChange={(value) => set('purchasedAt', value)}
        />
        <Field
          id="correction-station"
          label={t('costs.fuelReceipts.station')}
          value={String(form.stationName)}
          disabled={busy}
          onChange={(value) => set('stationName', value)}
        />
        <Field
          id="correction-liters"
          label={t('costs.fuelReceipts.liters')}
          type="number"
          value={String(form.liters)}
          disabled={busy}
          onChange={(value) => set('liters', value as never)}
        />
        <Field
          id="correction-price"
          label={t('costs.fuelReceipts.pricePerLiter')}
          type="number"
          value={String(form.pricePerLiter)}
          disabled={busy}
          onChange={(value) => set('pricePerLiter', value as never)}
        />
        <Field
          id="correction-amount"
          label={t('costs.fuelReceipts.fuelTotal')}
          type="number"
          value={String(form.fuelGrossAmount)}
          disabled={busy}
          onChange={(value) => set('fuelGrossAmount', value as never)}
        />
        <Field
          id="correction-currency"
          label={t('costs.fuelReceipts.reversal.currency')}
          value={form.currency}
          disabled={busy}
          onChange={(value) => set('currency', value)}
        />
      </div>

      {/* Beklentiyi ACIKCA kur: kaydetmek onaylamaz. */}
      <p className="text-xs text-muted-foreground" data-testid="correction-no-auto-approve">
        {t('costs.fuelReceipts.correction.noAutoApprove')}
      </p>

      {errorKey ? (
        <p role="alert" data-testid="correction-error" className="text-sm text-red-700">
          {t(errorKey)}
        </p>
      ) : null}
      {savedAt ? (
        <p role="status" data-testid="correction-saved" className="text-sm text-emerald-700">
          {t('costs.fuelReceipts.correction.saved')}
        </p>
      ) : null}

      <Button type="button" size="sm" disabled={busy} data-testid="correction-save" onClick={() => void save()}>
        {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
        {t('costs.fuelReceipts.correction.save')}
      </Button>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  type = 'text',
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  type?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      {/* label/input iliskisi ACIK: ekran okuyucu alani adiyla okur. */}
      <label htmlFor={id} className="text-xs font-medium">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        disabled={disabled}
        className="mt-1 w-full rounded-md border bg-background p-2 text-sm"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
