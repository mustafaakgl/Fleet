'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, FileText, Loader2, X, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { fuelReceiptReviewApi } from '@/lib/api';
import { extractApiErrorCode } from '@/lib/fuel-station-view';
import { canReverse, reasonLabelKey, statusBadge } from '@/lib/fuel-reversal-view';
import { FuelReceiptReversalDialog } from './FuelReceiptReversalDialog';
import { FuelReceiptCorrectionForm } from './FuelReceiptCorrectionForm';
import { formatFleetCurrency } from '@/lib/locale-format';
import { cn } from '@/lib/utils';
import type { FuelReceiptReviewDetail } from '@/lib/types';

const MIN_REASON = 5;

/** Backend kodu -> ceviri anahtari. HAM KOD GOSTERILMEZ. */
function reviewErrorKey(code: string | null): string {
  switch (code) {
    case 'fuel_receipt_review_conflict':
      return 'costs.fuelReceipts.errors.conflict';
    case 'fuel_receipt_not_reviewable':
      return 'costs.fuelReceipts.errors.notReviewable';
    case 'fuel_receipt_not_found':
      return 'costs.fuelReceipts.errors.notFound';
    default:
      return 'costs.fuelReceipts.errors.generic';
  }
}

/**
 * Tek bir fisin inceleme detayi.
 *
 * Solda fis goruntusu, sagda surucunun DOGRULADIGI degerler. OCR ile surucu
 * degeri arasindaki fark ayrica gosteriliyor: muhasebe "surucu neyi
 * duzeltti" sorusunu gormeden karar vermemeli.
 *
 * Onay/ret `expectedUpdatedAt` tasiyor. Cakisma olursa (baska biri kapatti ya
 * da surucu yeniden gonderdi) kayit YENIDEN YUKLENIYOR — eski veriyle ikinci
 * bir karar verilmesin.
 */
/** Rozet tonundan gorsel varyanta — RENK TEK BASINA anlam tasimiyor, her
 *  rozetin ayri bir metni de var. */
const BADGE_VARIANT: Record<
  ReturnType<typeof statusBadge>['tone'],
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  positive: 'default',
  warning: 'secondary',
  danger: 'destructive',
  neutral: 'outline',
};

export function FuelReceiptReviewDrawer({
  receiptId,
  onClose,
  onReviewed,
  onOpenReceipt,
}: {
  receiptId: string;
  onClose: () => void;
  onReviewed: () => void;
  /** Zincirde gezinme: orijinal <-> duzeltilmis kayit. */
  onOpenReceipt?: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();

  const [detail, setDetail] = useState<FuelReceiptReviewDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [reversing, setReversing] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const response = await fuelReceiptReviewApi.detail(receiptId, controller.signal);
      if (!controller.signal.aborted) setDetail(response);
    } catch {
      if (!controller.signal.aborted) setErrorKey('costs.fuelReceipts.errors.generic');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [receiptId]);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  const decide = useCallback(
    async (kind: 'approve' | 'reject') => {
      if (!detail || busy) return;
      if (kind === 'reject' && reason.trim().length < MIN_REASON) return;

      setBusy(true);
      setErrorKey(null);
      try {
        if (kind === 'approve') {
          await fuelReceiptReviewApi.approve(detail.id, {
            expectedUpdatedAt: detail.updatedAt,
            accountingNote: note.trim() || undefined,
          });
        } else {
          await fuelReceiptReviewApi.reject(detail.id, {
            expectedUpdatedAt: detail.updatedAt,
            reason: reason.trim(),
          });
        }
        onReviewed();
      } catch (caught) {
        const code = extractApiErrorCode(caught);
        setErrorKey(reviewErrorKey(code));
        // Cakismada kaydi YENIDEN YUKLE: eski `updatedAt` ile ikinci bir
        // deneme yine kaybeder ve kullanici neden olduğunu anlamaz.
        if (code === 'fuel_receipt_review_conflict' || code === 'fuel_receipt_not_reviewable') {
          await load();
        }
      } finally {
        setBusy(false);
      }
    },
    [busy, detail, load, note, onReviewed, reason],
  );

  /** OCR ne okumustu, surucu ne onayladi. */
  const comparison = useMemo(() => {
    if (!detail?.ocr.extraction) return [];
    const extraction = detail.ocr.extraction;
    const entries: Array<{ field: string; ocr: string; driver: string; differs: boolean; lowConfidence: boolean }> = [];

    const add = (field: string, ocrValue: unknown, driverValue: unknown) => {
      const ocr = ocrValue === null || ocrValue === undefined ? '—' : String(ocrValue);
      const driver = driverValue === null || driverValue === undefined ? '—' : String(driverValue);
      entries.push({
        field,
        ocr,
        driver,
        differs: ocr !== driver,
        lowConfidence: detail.ocr.lowConfidenceFields.includes(field),
      });
    };

    add('stationName', extraction.stationName?.value, detail.stationName);
    add('receiptNumber', extraction.receiptNumber?.value, detail.receiptNumber);
    add('liters', extraction.liters?.value, detail.liters);
    add('pricePerLiter', extraction.pricePerLiter?.value, detail.pricePerLiter);
    add('fuelGrossAmount', extraction.fuelGrossAmount?.value, detail.fuelGrossAmount);
    add('receiptGrossAmount', extraction.receiptGrossAmount?.value, detail.receiptGrossAmount);
    return entries;
  }, [detail]);

  const canReview = detail?.workflowStatus === 'submitted';
  /** Ters kayit YALNIZCA etkili onayli kayitta. */
  const reversible = canReverse(detail);
  const badge = detail
    ? statusBadge(detail.effectiveAccountingStatus, detail.correctionOf !== null)
    : null;
  const reasonValid = reason.trim().length >= MIN_REASON;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label={t('costs.fuelReceipts.reviewTitle')}
      data-testid="receipt-drawer"
    >
      <div className="flex h-full w-full max-w-3xl flex-col overflow-y-auto bg-background p-4 shadow-xl sm:p-6">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-lg font-bold">{t('costs.fuelReceipts.reviewTitle')}</h2>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label={t('common.close')}>
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        {loading && !detail ? (
          <div className="mt-4 h-48 animate-pulse rounded-lg bg-muted" />
        ) : !detail ? (
          <p className="mt-4 text-sm text-muted-foreground">{t('costs.fuelReceipts.errors.notFound')}</p>
        ) : (
          <div className="mt-4 space-y-4">
            {errorKey ? (
              <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                {t(errorKey)}
              </p>
            ) : null}

            {/* ETKILI durum rozeti — maliyete girip girmedigi de yaziyor. */}
            {badge ? (
              <div className="flex flex-wrap items-center gap-2" data-testid="effective-status">
                <Badge variant={BADGE_VARIANT[badge.tone]}>{t(badge.labelKey)}</Badge>
                {badge.costNoteKey ? (
                  <span className="text-xs text-muted-foreground" data-testid="cost-note">
                    {t(badge.costNoteKey)}
                  </span>
                ) : null}
              </div>
            ) : null}

            {/* Ters kayit ayrintisi: sebep, tarih, kim ve duzeltme bagi. */}
            {detail.reversal ? (
              <div
                className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
                data-testid="reversal-details"
              >
                <p className="font-semibold">{t('costs.fuelReceipts.reversal.detailsTitle')}</p>
                <p>{t(reasonLabelKey(detail.reversal.reasonCode))}</p>
                <p className="break-words">{detail.reversal.reason}</p>
                <p className="text-xs">
                  {t('costs.fuelReceipts.reversal.reversedAt')}:{' '}
                  {fmt(detail.reversal.reversedAt, i18n.language)}
                  {detail.reversal.reversedBy
                    ? ` · ${t('costs.fuelReceipts.reversal.reversedBy')}: ${detail.reversal.reversedBy.name}`
                    : ''}
                </p>
                {detail.reversal.replacementEntryId && onOpenReceipt ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    data-testid="open-replacement"
                    onClick={() => onOpenReceipt(detail.reversal!.replacementEntryId!)}
                  >
                    {t('costs.fuelReceipts.reversal.openReplacement')}
                  </Button>
                ) : null}
              </div>
            ) : null}

            {/* Duzeltilmis kayitta orijinale DONUS yolu — kullanici zincirde
                kaybolmasin. */}
            {detail.correctionOf ? (
              <div
                className="space-y-1 rounded-md border bg-muted/30 p-3 text-sm"
                data-testid="correction-of"
              >
                <p>{t('costs.fuelReceipts.reversal.correctionNotice')}</p>
                {onOpenReceipt ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    data-testid="open-original"
                    onClick={() => onOpenReceipt(detail.correctionOf!.originalEntryId)}
                  >
                    {t('costs.fuelReceipts.reversal.openOriginal')}
                  </Button>
                ) : null}
              </div>
            ) : null}

            {/* Uyarilar: karar vermeden ONCE gorulmeli. */}
            <div className="flex flex-wrap gap-2">
              {detail.compatibilityMismatch ? (
                <Badge variant="destructive" data-testid="flag-mismatch">
                  {t('costs.fuelReceipts.flagMismatch')}
                </Badge>
              ) : null}
              {detail.duplicateSuspected ? (
                <Badge variant="outline" data-testid="flag-duplicate">
                  {t('costs.fuelReceipts.flagDuplicate')}
                </Badge>
              ) : null}
              {detail.mixedReceipt ? (
                <Badge variant="outline" data-testid="flag-mixed">
                  {t('costs.fuelReceipts.flagMixed')}
                </Badge>
              ) : null}
              {detail.ocr.lowConfidenceFields.length > 0 ? (
                <Badge variant="outline" data-testid="flag-lowconf">
                  {t('costs.fuelReceipts.flagLowConfidence', {
                    count: detail.ocr.lowConfidenceFields.length,
                  })}
                </Badge>
              ) : null}
            </div>

            {/* Fis goruntusu — YETKILI akis, ham depolama yolu degil. */}
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('costs.fuelReceipts.receiptFile')}
              </p>
              {detail.mimeType === 'application/pdf' ? (
                // PDF gomulu gosterilemeyebilir; her zaman calisan bir baglanti.
                <a
                  href={detail.fileDownloadPath}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm underline"
                  data-testid="receipt-pdf-link"
                >
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  {detail.fileName ?? t('costs.fuelReceipts.openReceipt')}
                </a>
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={detail.fileDownloadPath}
                  alt={t('costs.fuelReceipts.receiptAlt')}
                  data-testid="receipt-image"
                  className="max-h-72 w-full object-contain"
                />
              )}
            </div>

            {/* Surucunun dogruladigi canonical degerler */}
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Field label={t('costs.fuelReceipts.vehicle')} value={detail.vehicle.plateNumber} />
              <Field label={t('costs.fuelReceipts.driver')} value={detail.driver.name} />
              <Field label={t('costs.fuelReceipts.station')} value={detail.stationName ?? '—'} />
              <Field
                label={t('costs.fuelReceipts.date')}
                value={new Date(detail.purchasedAt).toLocaleString(i18n.language)}
              />
              <Field label={t('costs.fuelReceipts.liters')} value={detail.liters ?? '—'} />
              <Field
                label={t('costs.fuelReceipts.fuelTotal')}
                value={
                  detail.fuelGrossAmount === null
                    ? '—'
                    : formatFleetCurrency(detail.fuelGrossAmount, detail.currency)
                }
              />
              <Field
                label={t('costs.fuelReceipts.receiptTotal')}
                value={
                  detail.receiptGrossAmount === null
                    ? '—'
                    : formatFleetCurrency(detail.receiptGrossAmount, detail.currency)
                }
              />
              <Field label={t('costs.fuelReceipts.paymentMethod')} value={detail.paymentMethod ?? '—'} />
            </dl>

            {detail.mixedReceipt ? (
              <p className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-slate-800">
                {t('costs.fuelReceipts.mixedExplainer')}
              </p>
            ) : null}

            {/* OCR ile surucu degeri karsilastirmasi */}
            {comparison.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm" data-testid="ocr-comparison">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="p-2 text-left font-medium">{t('costs.fuelReceipts.field')}</th>
                      <th className="p-2 text-left font-medium">{t('costs.fuelReceipts.ocrValue')}</th>
                      <th className="p-2 text-left font-medium">{t('costs.fuelReceipts.driverValue')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.map((entry) => (
                      <tr key={entry.field} className={cn(entry.differs && 'bg-amber-50')}>
                        <td className="p-2">
                          {t(`costs.fuelReceipts.fields.${entry.field}`)}
                          {entry.lowConfidence ? (
                            <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-900">
                              {t('costs.fuelReceipts.lowConfidence')}
                            </span>
                          ) : null}
                        </td>
                        <td className="p-2 text-muted-foreground">{entry.ocr}</td>
                        <td className="p-2 font-medium">{entry.driver}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {/* Matematik kontrolleri — UYARI, engel degil */}
            {detail.issues.length > 0 ? (
              <ul className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3" data-testid="review-issues">
                {detail.issues.map((issue) => (
                  <li key={`${issue.code}-${issue.field}`} className="flex items-start gap-2 text-xs text-amber-900">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{t(`driverPortal.fuelReceipts.warnings.${issue.code}`, issue.code)}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            {detail.fuelingIntent ? (
              <p className="rounded-md border bg-muted/30 p-3 text-xs">
                {t('costs.fuelReceipts.linkedIntent', {
                  station: detail.fuelingIntent.stationName,
                  date: new Date(detail.fuelingIntent.selectedAt).toLocaleDateString(i18n.language),
                })}
              </p>
            ) : null}

            {/* Zaman cizelgesi */}
            <dl className="grid grid-cols-2 gap-2 rounded-md border p-3 text-xs" data-testid="review-timeline">
              <Field label={t('costs.fuelReceipts.uploadedAt')} value={fmt(detail.timeline.uploadedAt, i18n.language)} />
              <Field label={t('costs.fuelReceipts.submittedAt')} value={fmt(detail.timeline.submittedAt, i18n.language)} />
              {detail.timeline.rejectedAt ? (
                <Field label={t('costs.fuelReceipts.rejectedAt')} value={fmt(detail.timeline.rejectedAt, i18n.language)} />
              ) : null}
              {detail.timeline.resubmittedAt ? (
                <Field label={t('costs.fuelReceipts.resubmittedAt')} value={fmt(detail.timeline.resubmittedAt, i18n.language)} />
              ) : null}
              {detail.timeline.reviewedAt ? (
                <Field label={t('costs.fuelReceipts.reviewedAt')} value={fmt(detail.timeline.reviewedAt, i18n.language)} />
              ) : null}
            </dl>

            {detail.review.rejectionReason ? (
              <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
                {t('costs.fuelReceipts.previousRejection', { reason: detail.review.rejectionReason })}
              </p>
            ) : null}

            {/* Karar */}
            {canReview ? (
              <div className="space-y-3 border-t pt-3">
                {rejecting ? (
                  <div className="space-y-2" data-testid="reject-form">
                    <label htmlFor="reject-reason" className="text-sm font-medium">
                      {t('costs.fuelReceipts.reasonLabel')}
                    </label>
                    <textarea
                      id="reject-reason"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      rows={3}
                      className="w-full rounded-md border p-2 text-sm"
                    />
                    {!reasonValid ? (
                      <p className="text-xs text-muted-foreground">
                        {t('costs.fuelReceipts.reasonRequired', { min: MIN_REASON })}
                      </p>
                    ) : null}
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={!reasonValid || busy}
                        onClick={() => void decide('reject')}
                      >
                        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                        {t('costs.fuelReceipts.confirmReject')}
                      </Button>
                      <Button type="button" variant="outline" disabled={busy} onClick={() => setRejecting(false)}>
                        {t('common.cancel')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1">
                      <label htmlFor="accounting-note" className="text-sm font-medium">
                        {t('costs.fuelReceipts.noteLabel')}
                      </label>
                      <input
                        id="accounting-note"
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        className="w-full rounded-md border p-2 text-sm"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" disabled={busy} onClick={() => void decide('approve')}>
                        {busy ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                        )}
                        {t('costs.fuelReceipts.approve')}
                      </Button>
                      <Button type="button" variant="outline" disabled={busy} onClick={() => setRejecting(true)}>
                        {t('costs.fuelReceipts.reject')}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <p className="flex items-center gap-2 rounded-md border bg-muted/30 p-3 text-sm" data-testid="review-closed">
                <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
                {t(`costs.fuelReceipts.status.${detail.workflowStatus}`)}
              </p>
            )}

            {/* Duzeltme formu — YALNIZCA heniz onaylanmamis duzeltme kaydinda.
                Kaydetmek ONAYLAMAZ; onay yukaridaki ayri aksiyonla gecer. */}
            {detail.correctionOf && detail.workflowStatus === 'submitted' ? (
              <FuelReceiptCorrectionForm detail={detail} onSaved={() => void load()} />
            ) : null}

            {/* Ters kayit — onaylanmis ve HALA ETKILI kayitta. */}
            {reversible ? (
              <div className="border-t pt-3">
                <Button
                  type="button"
                  variant="outline"
                  data-testid="open-reversal"
                  onClick={() => setReversing(true)}
                >
                  {t('costs.fuelReceipts.reversal.action')}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {reversing && detail ? (
        <FuelReceiptReversalDialog
          detail={detail}
          onClose={() => setReversing(false)}
          onReversed={(replacementId) => {
            setReversing(false);
            // Kuyruk KONTROLLU tazeleniyor; ayrica bu kaydin detayi da
            // yenileniyor ki rozet ve `updatedAt` guncel olsun.
            onReviewed();
            if (replacementId && onOpenReceipt) {
              onOpenReceipt(replacementId);
            } else {
              void load();
            }
          }}
        />
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="break-words font-medium">{String(value ?? '—')}</dd>
    </div>
  );
}

function fmt(value: string | null, locale: string): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString(locale);
}
