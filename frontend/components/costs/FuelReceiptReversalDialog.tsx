'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { fuelReceiptReviewApi } from '@/lib/api';
import { extractApiErrorCode } from '@/lib/fuel-station-view';
import {
  MAX_REVERSAL_REASON,
  MIN_REVERSAL_REASON,
  isReversalReasonValid,
  reasonLabelKey,
  reversalErrorKey,
} from '@/lib/fuel-reversal-view';
import { formatFleetCurrency, formatFleetDate } from '@/lib/locale-format';
import { FUEL_REVERSAL_REASONS, type FuelReceiptReviewDetail, type FuelReversalReasonCode } from '@/lib/types';

/**
 * Onayi tersine cevirme onayi.
 *
 * KULLANICIYA SONUCU ANLATIYOR, sadece "emin misiniz?" diye sormuyor: hangi
 * fisin, hangi tutarin ve hangi aracin etkilenecegi ekranda duruyor. Bir
 * muhasebe islemini ozetsiz onaylatmak, yanlis satirda calismayi kolaylastirir.
 */
export function FuelReceiptReversalDialog({
  detail,
  onClose,
  onReversed,
}: {
  detail: FuelReceiptReviewDetail;
  onClose: () => void;
  onReversed: (replacementId: string | null) => void;
}) {
  const { t } = useTranslation();

  const [reasonCode, setReasonCode] = useState<FuelReversalReasonCode>('incorrect_amount');
  const [reason, setReason] = useState('');
  const [createReplacement, setCreateReplacement] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const firstFieldRef = useRef<HTMLSelectElement | null>(null);
  /** Modal kapaninca odak GERI DONMELI, sayfanin basina firlamamali. */
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null;
    firstFieldRef.current?.focus();
    return () => openerRef.current?.focus?.();
  }, []);

  /** Odak tuzagi: Tab modalin disina cikmamali. */
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), select, textarea, input, [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [busy, onClose],
  );

  const reasonValid = isReversalReasonValid(reason);

  const submit = useCallback(async () => {
    // CIFT SUBMIT ENGELI: `busy` hem dugmeyi kapatiyor hem de bu erken
    // donusle ikinci istegi kesiyor — hizli iki tik iki ters kayit denemesi
    // uretmesin.
    if (busy) return;
    setTouched(true);
    if (!reasonValid) return;

    setBusy(true);
    setErrorKey(null);
    try {
      const result = await fuelReceiptReviewApi.reverse(detail.id, {
        expectedUpdatedAt: detail.updatedAt,
        reasonCode,
        reason: reason.trim(),
        createReplacement,
      });
      onReversed(result.replacement?.id ?? null);
    } catch (caught) {
      // Ham kod GOSTERILMEZ; form degerleri de KORUNUR ki kullanici yazdigi
      // aciklamayi bastan yazmak zorunda kalmasin.
      setErrorKey(reversalErrorKey(extractApiErrorCode(caught)));
    } finally {
      setBusy(false);
    }
  }, [busy, createReplacement, detail.id, detail.updatedAt, onReversed, reason, reasonCode, reasonValid]);

  const showReasonError = touched && !reasonValid;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onKeyDown={onKeyDown}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reversal-title"
        aria-describedby="reversal-consequences"
        data-testid="reversal-dialog"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-background p-5 shadow-xl"
      >
        <h2 id="reversal-title" className="text-lg font-semibold">
          {t('costs.fuelReceipts.reversal.title')}
        </h2>

        {/* Hangi fis — ozet olmadan onay istemek yanlis satirda calismayi
            kolaylastirir. */}
        <dl
          className="mt-3 grid grid-cols-2 gap-2 rounded-md border p-3 text-sm"
          data-testid="reversal-summary"
        >
          <Row label={t('costs.fuelReceipts.vehicle')} value={detail.vehicle.plateNumber} />
          <Row label={t('costs.fuelReceipts.driver')} value={detail.driver.name} />
          <Row
            label={t('costs.fuelReceipts.date')}
            value={formatFleetDate(detail.purchasedAt)}
          />
          <Row label={t('costs.fuelReceipts.station')} value={detail.stationName ?? '—'} />
          <Row
            label={t('costs.fuelReceipts.reversal.fuelType')}
            value={
              detail.fuelProduct
                ? t(`vehicleDetail.fuelCompatibility.products.${detail.fuelProduct}`)
                : '—'
            }
          />
          <Row
            label={t('costs.fuelReceipts.liters')}
            value={detail.liters === null ? '—' : `${detail.liters} l`}
          />
          <Row
            label={t('costs.fuelReceipts.fuelTotal')}
            value={
              detail.fuelGrossAmount === null
                ? '—'
                : formatFleetCurrency(detail.fuelGrossAmount, detail.currency)
            }
          />
          <Row label={t('costs.fuelReceipts.reversal.currency')} value={detail.currency} />
        </dl>

        {/* Sebep kodu */}
        <div className="mt-4">
          <label htmlFor="reversal-reason-code" className="text-sm font-medium">
            {t('costs.fuelReceipts.reversal.reasonCodeLabel')}
          </label>
          <select
            id="reversal-reason-code"
            ref={firstFieldRef}
            data-testid="reversal-reason-code"
            className="mt-1 w-full rounded-md border bg-background p-2 text-sm"
            value={reasonCode}
            disabled={busy}
            onChange={(event) => setReasonCode(event.target.value as FuelReversalReasonCode)}
          >
            {FUEL_REVERSAL_REASONS.map((code) => (
              <option key={code} value={code}>
                {t(reasonLabelKey(code))}
              </option>
            ))}
          </select>
        </div>

        {/* Serbest aciklama */}
        <div className="mt-3">
          <label htmlFor="reversal-reason" className="text-sm font-medium">
            {t('costs.fuelReceipts.reversal.reasonLabel')}
          </label>
          <textarea
            id="reversal-reason"
            data-testid="reversal-reason"
            className="mt-1 w-full rounded-md border bg-background p-2 text-sm"
            rows={3}
            value={reason}
            disabled={busy}
            maxLength={MAX_REVERSAL_REASON}
            // Hata metni ALANLA ILISKILI: ekran okuyucu hangi alanin
            // sorunlu oldugunu tahmin etmek zorunda kalmasin.
            aria-invalid={showReasonError}
            aria-describedby={showReasonError ? 'reversal-reason-error' : 'reversal-reason-hint'}
            onChange={(event) => setReason(event.target.value)}
            onBlur={() => setTouched(true)}
          />
          <p id="reversal-reason-hint" className="mt-1 text-xs text-muted-foreground">
            {t('costs.fuelReceipts.reversal.reasonHint', { min: MIN_REVERSAL_REASON })}
          </p>
          {showReasonError ? (
            <p
              id="reversal-reason-error"
              role="alert"
              data-testid="reversal-reason-error"
              className="mt-1 text-xs text-red-700"
            >
              {t('costs.fuelReceipts.reversal.reasonRequired', { min: MIN_REVERSAL_REASON })}
            </p>
          ) : null}
        </div>

        {/* Duzeltilmis kopya */}
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            data-testid="reversal-create-replacement"
            className="mt-1"
            checked={createReplacement}
            disabled={busy}
            onChange={(event) => setCreateReplacement(event.target.checked)}
          />
          <span>
            {t('costs.fuelReceipts.reversal.createReplacement')}
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {t('costs.fuelReceipts.reversal.createReplacementHint')}
            </span>
          </span>
        </label>

        {/* SONUC ACIKCA yaziyor — "emin misiniz?" tek basina bilgi degildir. */}
        <ul
          id="reversal-consequences"
          data-testid="reversal-consequences"
          className="mt-4 space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"
        >
          <li>{t('costs.fuelReceipts.reversal.consequenceKept')}</li>
          <li>{t('costs.fuelReceipts.reversal.consequenceRemovedFromCosts')}</li>
          {createReplacement ? (
            <li>{t('costs.fuelReceipts.reversal.consequenceReplacementPending')}</li>
          ) : null}
          <li>{t('costs.fuelReceipts.reversal.consequenceIrreversible')}</li>
        </ul>

        {errorKey ? (
          <p role="alert" data-testid="reversal-error" className="mt-3 text-sm text-red-700">
            {t(errorKey)}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            data-testid="reversal-submit"
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : null}
            {t('costs.fuelReceipts.reversal.confirm')}
          </Button>
        </div>

        {/* Ekran okuyucu icin islem durumu. */}
        <p className="sr-only" role="status">
          {busy ? t('costs.fuelReceipts.reversal.working') : ''}
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
