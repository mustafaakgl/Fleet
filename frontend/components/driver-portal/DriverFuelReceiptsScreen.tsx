'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Receipt,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { driverPortalApi } from '@/lib/api';
import { extractApiErrorCode } from '@/lib/fuel-station-view';
import {
  EMPTY_FORM,
  canSubmit,
  formFromExtraction,
  formFromReceipt,
  formWarnings,
  fuelReceiptErrorKey,
  isLowConfidence,
  ocrErrorKey,
  toConfirmPayload,
  type FuelReceiptFormValues,
} from '@/lib/fuel-receipt-view';
import { cn } from '@/lib/utils';
import type { FuelProductType, FuelReceipt } from '@/lib/types';

/** Dokunma hedefi en az ~44px: eldivenli parmak icin alt sinir. */
const TOUCH_TARGET = 'min-h-11';

const FUEL_PRODUCTS: FuelProductType[] = [
  'DIESEL',
  'SUPER_E5',
  'SUPER_E10',
  'SUPER_PLUS',
  'HVO100',
  'CNG',
  'LNG',
  'ELECTRICITY',
  'HYDROGEN',
  'ADBLUE',
];

type Stage = 'idle' | 'uploading' | 'analyzing' | 'form' | 'submitted';

/**
 * Surucunun yakit fisi ekrani.
 *
 * BAGIMSIZ CALISIR: aktif tur ya da yakit duragi secimi GEREKMEZ ve bu yol
 * hicbir kosulda kapanmaz. `fuelingIntentId` verilirse fis o yakit alimina
 * baglanir, verilmezse bagsiz kaydedilir.
 *
 * OCR SONUCU CANONICAL DEGILDIR: gelen degerler forma TASLAK olarak dusuyor,
 * surucu duzeltiyor ve ancak onayladiginda kaydediliyor. Dusuk guvenli alanlar
 * isaretleniyor; guven dusuk diye uydurma deger GOSTERILMIYOR.
 */
export function DriverFuelReceiptsScreen({ fuelingIntentId }: { fuelingIntentId?: string } = {}) {
  const { t, i18n } = useTranslation();

  const [receipts, setReceipts] = useState<FuelReceipt[]>([]);
  const [current, setCurrent] = useState<FuelReceipt | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [values, setValues] = useState<FuelReceiptFormValues>(EMPTY_FORM);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const cameraRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  /**
   * Istek sayaci. Eski bir cevap yenisinin uzerine YAZMAMALI: iptal edilse bile
   * ag cevabi yarista onde olabilir, bu yuzden sira numarasi da kontrol ediliyor.
   */
  const seqRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    driverPortalApi
      .listFuelReceipts(controller.signal)
      .then((rows) => {
        if (!controller.signal.aborted) setReceipts(rows);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      // Onizleme icin uretilen object URL serbest birakiliyor.
      setPreviewUrl((url) => {
        if (url) URL.revokeObjectURL(url);
        return null;
      });
    },
    [],
  );

  const reloadList = useCallback(() => {
    driverPortalApi
      .listFuelReceipts()
      .then(setReceipts)
      .catch(() => undefined);
  }, []);

  /** Yukleme -> OCR akisi. Upload biter bitmez analiz OTOMATIK basliyor. */
  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const seq = seqRef.current + 1;
      seqRef.current = seq;

      setErrorKey(null);
      setMismatch(false);
      setAcknowledged(false);
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(file);
      });
      setStage('uploading');

      try {
        const uploaded = await driverPortalApi.uploadFuelReceipt(
          file,
          fuelingIntentId,
          controller.signal,
        );
        if (seq !== seqRef.current) return;
        setCurrent(uploaded);

        // Reddedilen fis DUZENLENEBILIR: muhasebe duzeltme istedi, surucu ayni
        // kayit uzerinde duzeltip yeniden gonderiyor.
        if (uploaded.workflowStatus === 'rejected') {
          setValues(formFromReceipt(uploaded));
          setStage('form');
          reloadList();
          return;
        }

        // Zaten gonderilmis ya da onaylanmis fis: forma dusmuyoruz.
        if (uploaded.workflowStatus !== 'driver_review') {
          setValues(formFromReceipt(uploaded));
          setStage('submitted');
          reloadList();
          return;
        }

        setStage('analyzing');
        const analysed = await driverPortalApi.analyzeFuelReceipt(uploaded.id, controller.signal);
        if (seq !== seqRef.current) return;

        setCurrent(analysed);
        setValues(formFromExtraction(analysed.ocrExtraction));
        setStage('form');
        reloadList();
      } catch (caught) {
        if (seq !== seqRef.current || controller.signal.aborted) return;
        const key = fuelReceiptErrorKey(extractApiErrorCode(caught));
        setErrorKey(key ?? 'driverPortal.fuelReceipts.errors.generic');
        // OCR patlasa bile fis yuklendiyse form ACIK kalir; elle doldurulur.
        setStage((prev) => (prev === 'analyzing' ? 'form' : 'idle'));
      }
    },
    [fuelingIntentId, reloadList],
  );

  const handleRetryAnalyze = useCallback(async () => {
    if (!current) return;
    setErrorKey(null);
    setStage('analyzing');
    try {
      const analysed = await driverPortalApi.analyzeFuelReceipt(current.id);
      setCurrent(analysed);
      if (analysed.ocrStatus === 'succeeded') {
        setValues(formFromExtraction(analysed.ocrExtraction));
      }
    } catch {
      // Sessiz: form zaten acik ve elle doldurulabilir.
    } finally {
      setStage('form');
    }
  }, [current]);

  const handleConfirm = useCallback(async () => {
    if (!current || submitting) return;
    setSubmitting(true);
    setErrorKey(null);
    try {
      const result = await driverPortalApi.confirmFuelReceipt(
        current.id,
        toConfirmPayload(values, { acknowledgeFuelMismatch: acknowledged }),
      );
      setCurrent(result.receipt);
      setStage('submitted');
      reloadList();
    } catch (caught) {
      const code = extractApiErrorCode(caught);
      if (code === 'fuel_product_not_compatible') {
        // Kayit YOK EDILMIYOR: surucudan acik onay isteniyor.
        setMismatch(true);
      }
      setErrorKey(fuelReceiptErrorKey(code) ?? 'driverPortal.fuelReceipts.errors.generic');
    } finally {
      setSubmitting(false);
    }
  }, [acknowledged, current, reloadList, submitting, values]);

  const warnings = useMemo(() => formWarnings(values), [values]);
  const extraction = current?.ocrExtraction ?? null;
  const submittable = canSubmit(values) && (!mismatch || acknowledged);

  const set = (key: keyof FuelReceiptFormValues) => (event: { target: { value: string } }) =>
    setValues((prev) => ({ ...prev, [key]: event.target.value }));

  /** Dusuk guvenli alanin gorsel isareti + ekran okuyucu metni. */
  const lowConf = (field: keyof NonNullable<typeof extraction>): boolean => {
    const entry = extraction?.[field] as { confidence: number | null } | undefined;
    return isLowConfidence(entry?.confidence);
  };

  const field = (
    key: keyof FuelReceiptFormValues,
    labelKey: string,
    ocrKey?: keyof NonNullable<typeof extraction>,
    type: 'text' | 'number' | 'datetime-local' = 'text',
  ) => {
    const flagged = ocrKey ? lowConf(ocrKey) : false;
    return (
      <div className="space-y-1">
        <label htmlFor={`fr-${key}`} className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t(labelKey)}
          {flagged ? (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium normal-case text-amber-900">
              {t('driverPortal.fuelReceipts.lowConfidence')}
            </span>
          ) : null}
        </label>
        <input
          id={`fr-${key}`}
          type={type}
          inputMode={type === 'number' ? 'decimal' : undefined}
          value={values[key]}
          onChange={set(key)}
          data-low-confidence={flagged ? 'true' : undefined}
          className={cn(
            'w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900',
            TOUCH_TARGET,
            flagged ? 'border-amber-400 bg-amber-50' : 'border-slate-300',
          )}
        />
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">{t('driverPortal.fuelReceipts.intro')}</p>

      {/* Demo isaretlemesi backend'in dataMode alanina gore — frontend env
          degiskenine gore DEGIL. */}
      {current?.ocrDataMode === 'mock' ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm font-medium text-amber-900"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t('driverPortal.fuelReceipts.demoBanner')}</span>
        </p>
      ) : null}

      {errorKey ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t(errorKey)}</span>
        </p>
      ) : null}

      {/* Yukleme aksiyonlari — aktif tur ya da yakit duragi GEREKMEZ. */}
      {stage === 'idle' || stage === 'submitted' ? (
        <div className="grid grid-cols-2 gap-2">
          <input
            ref={cameraRef}
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            capture="environment"
            className="hidden"
            data-testid="receipt-camera-input"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            className="hidden"
            data-testid="receipt-file-input"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
          <Button
            type="button"
            className={cn('w-full bg-[#1a4d7a] hover:bg-[#163a5c]', TOUCH_TARGET)}
            onClick={() => cameraRef.current?.click()}
          >
            <Camera className="mr-2 h-4 w-4" aria-hidden="true" />
            {t('driverPortal.fuelReceipts.capture')}
          </Button>
          <Button
            type="button"
            variant="outline"
            className={cn('w-full', TOUCH_TARGET)}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
            {t('driverPortal.fuelReceipts.chooseFile')}
          </Button>
        </div>
      ) : null}

      {/* Onizleme */}
      {previewUrl && stage !== 'idle' ? (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt={t('driverPortal.fuelReceipts.previewAlt')}
            data-testid="receipt-preview"
            className="max-h-56 w-full object-contain"
          />
        </div>
      ) : null}

      {/* Ilerleme */}
      {stage === 'uploading' || stage === 'analyzing' ? (
        <p
          role="status"
          data-testid="receipt-progress"
          className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-slate-800"
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {t(
            stage === 'uploading'
              ? 'driverPortal.fuelReceipts.uploading'
              : 'driverPortal.fuelReceipts.analyzing',
          )}
        </p>
      ) : null}

      {/* OCR basarisiz: fis KAYBOLMADI, form elle doldurulabilir. */}
      {stage === 'form' && current?.ocrStatus === 'failed' ? (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm text-amber-900">{t(ocrErrorKey(current.ocrErrorClass))}</p>
          <p className="text-xs text-amber-900">{t('driverPortal.fuelReceipts.manualHint')}</p>
          <Button
            type="button"
            variant="outline"
            className={cn('w-full', TOUCH_TARGET)}
            onClick={() => void handleRetryAnalyze()}
          >
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            {t('driverPortal.fuelReceipts.retryAnalyze')}
          </Button>
        </div>
      ) : null}

      {/* Form */}
      {stage === 'form' && current ? (
        <div className="space-y-3" data-testid="receipt-form">
          {/* Arac SUNUCUDAN ve SALT OKUNUR: surucu arac secemez. */}
          <div className="rounded-lg border border-slate-300 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t('driverPortal.fuelReceipts.vehicle')}
            </p>
            <p className="font-semibold text-slate-900">{current.vehicle.plateNumber}</p>
          </div>

          {extraction?.rawFuelLabel && !values.fuelProduct ? (
            <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              {t('driverPortal.fuelReceipts.unmappedFuel', { label: extraction.rawFuelLabel })}
            </p>
          ) : null}

          {extraction?.hasNonFuelItems ? (
            <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-slate-800">
              {t('driverPortal.fuelReceipts.mixedReceiptHint')}
            </p>
          ) : null}

          {field('stationName', 'driverPortal.fuelReceipts.stationName', 'stationName')}
          {field('receiptNumber', 'driverPortal.fuelReceipts.receiptNumber', 'receiptNumber')}
          {field('purchasedAt', 'driverPortal.fuelReceipts.purchasedAt', 'purchasedAt', 'datetime-local')}

          <div className="space-y-1">
            <label
              htmlFor="fr-fuelProduct"
              className="text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              {t('driverPortal.fuelReceipts.fuelProduct')}
            </label>
            <select
              id="fr-fuelProduct"
              value={values.fuelProduct}
              onChange={set('fuelProduct')}
              className={cn('w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm', TOUCH_TARGET)}
            >
              <option value="">{t('driverPortal.fuelReceipts.selectFuel')}</option>
              {FUEL_PRODUCTS.map((product) => (
                <option key={product} value={product}>
                  {t(`driverPortal.fuelStations.products.${product}`)}
                </option>
              ))}
            </select>
          </div>

          {field('liters', 'driverPortal.fuelReceipts.liters', 'liters', 'number')}
          {field('pricePerLiter', 'driverPortal.fuelReceipts.pricePerLiter', 'pricePerLiter', 'number')}
          {field('fuelGrossAmount', 'driverPortal.fuelReceipts.fuelGrossAmount', 'fuelGrossAmount', 'number')}
          {field('receiptGrossAmount', 'driverPortal.fuelReceipts.receiptGrossAmount', 'receiptGrossAmount', 'number')}
          {field('receiptNetAmount', 'driverPortal.fuelReceipts.netAmount', 'receiptNetAmount', 'number')}
          {field('receiptVatAmount', 'driverPortal.fuelReceipts.vatAmount', 'receiptVatAmount', 'number')}
          {field('currency', 'driverPortal.fuelReceipts.currency', 'currency')}
          {field('paymentMethod', 'driverPortal.fuelReceipts.paymentMethod', 'paymentMethod')}
          {field('odometerKm', 'driverPortal.fuelReceipts.odometerKm', 'odometerKm', 'number')}

          {/* Matematik uyarilari — ENGEL DEGIL. */}
          {warnings.length > 0 ? (
            <ul className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-3" data-testid="receipt-warnings">
              {warnings.map((code) => (
                <li key={code} className="flex items-start gap-2 text-xs text-amber-900">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{t(`driverPortal.fuelReceipts.warnings.${code}`)}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {/* Yakit uyumsuzlugu: kayit yok edilmiyor, ACIK onay isteniyor. */}
          {mismatch ? (
            <div className="space-y-2 rounded-lg border-2 border-red-400 bg-red-50 p-3" data-testid="receipt-mismatch">
              <p className="flex items-start gap-2 text-sm font-medium text-red-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{t('driverPortal.fuelReceipts.fuelMismatchWarning')}</span>
              </p>
              <label className="flex items-start gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  className="mt-1 h-4 w-4"
                />
                <span>{t('driverPortal.fuelReceipts.fuelMismatchAcknowledge')}</span>
              </label>
            </div>
          ) : null}

          {/* Onay oncesi OKUNABILIR ozet. */}
          <div className="space-y-1 rounded-lg border border-slate-300 bg-white p-3" data-testid="receipt-summary">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t('driverPortal.fuelReceipts.summary')}
            </p>
            <p className="text-sm text-slate-800">
              {t('driverPortal.fuelReceipts.summaryLine', {
                station: values.stationName || '—',
                liters: values.liters || '—',
                amount: values.fuelGrossAmount || '—',
                currency: values.currency,
              })}
            </p>
            <p className="text-xs text-slate-500">{t('driverPortal.fuelReceipts.summaryNote')}</p>
          </div>

          <Button
            type="button"
            className={cn('w-full bg-emerald-600 text-white hover:bg-emerald-700', TOUCH_TARGET)}
            disabled={!submittable || submitting}
            onClick={() => void handleConfirm()}
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {t('driverPortal.fuelReceipts.confirm')}
          </Button>
        </div>
      ) : null}

      {/* Gonderildi */}
      {stage === 'submitted' && current ? (
        <Card className="border-2 border-emerald-500 bg-emerald-50" data-testid="receipt-submitted">
          <CardContent className="space-y-1 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
              {t('driverPortal.fuelReceipts.awaitingReview')}
            </p>
            <p className="text-sm text-slate-700">
              {current.stationName ?? t('driverPortal.fuelReceipts.stationUnknown')}
            </p>
            <p className="text-xs text-slate-600">{t('driverPortal.fuelReceipts.awaitingReviewNote')}</p>
          </CardContent>
        </Card>
      ) : null}

      {/* Son fisler */}
      {receipts.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t('driverPortal.fuelReceipts.recent')}
          </h2>
          <ul className="space-y-2" data-testid="receipt-list">
            {receipts.map((receipt) => (
              <li key={receipt.id}>
                <Card className="border-slate-200 bg-white">
                  <CardContent className="flex items-start justify-between gap-2 p-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 break-words text-sm font-medium text-slate-900">
                        {receipt.mimeType === 'application/pdf' ? (
                          <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        ) : (
                          <Receipt className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        )}
                        {receipt.stationName ?? t('driverPortal.fuelReceipts.stationUnknown')}
                      </p>
                      <p className="text-xs text-slate-600">
                        {new Date(receipt.createdAt).toLocaleDateString(i18n.language)}
                        {receipt.fuelGrossAmount !== null
                          ? ` · ${receipt.fuelGrossAmount} ${receipt.currency}`
                          : ''}
                      </p>
                      {/* Ret nedeni surucuye GOSTERILIYOR: neyi duzeltecegini
                          bilmeden yeniden gonderemez. */}
                      {receipt.workflowStatus === 'rejected' && receipt.rejectionReason ? (
                        <p
                          className="mt-1 break-words rounded border border-red-300 bg-red-50 p-2 text-xs text-red-900"
                          data-testid="receipt-rejection-reason"
                        >
                          {t('driverPortal.fuelReceipts.rejectionReason', {
                            reason: receipt.rejectionReason,
                          })}
                        </p>
                      ) : null}
                    </div>
                    <Badge
                      variant={
                        receipt.workflowStatus === 'approved'
                          ? 'success'
                          : receipt.workflowStatus === 'rejected'
                            ? 'destructive'
                            : 'outline'
                      }
                    >
                      {t(`driverPortal.fuelReceipts.status.${receipt.workflowStatus}`)}
                    </Badge>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
