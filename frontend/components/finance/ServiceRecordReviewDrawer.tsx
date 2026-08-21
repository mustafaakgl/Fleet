'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { serviceRecordsApi } from '@/lib/api';
import { extractApiErrorCode } from '@/lib/fuel-station-view';
import { isRejectionReasonValid, MIN_REJECTION_REASON } from '@/lib/finance-view';
import { formatFleetCurrency, formatFleetDate } from '@/lib/locale-format';
import type { FinanceServiceItem } from '@/lib/types';

/** Backend kodu -> ceviri anahtari. HAM KOD GOSTERILMEZ. */
function reviewErrorKey(code: string | null): string {
  switch (code) {
    case 'service_record_rejection_reason_required':
      return 'finance.review.reasonRequired';
    default:
      return 'finance.review.error';
  }
}

/**
 * Onay bekleyen servis kaydinin INCELEME PANELI (Faz 18C).
 *
 * NEDEN SAGDAN ACILAN PANEL VE NEDEN YENI BIR SAYFA DEGIL: karar verirken
 * kuyrugun geri kalani gorunur kalmali — "bu ay kac kayit bekliyor" bilgisi,
 * tek bir kaydin onaylanip onaylanmayacagini etkiliyor. Ayri bir detay
 * sayfasi hem o baglami kaybettirir hem de gider detayinin ikinci bir
 * kopyasini uretirdi; gider detayi `/service-history/:id`de KALIYOR ve
 * panelden oraya baglanti var.
 *
 * RET NEDENI ZORUNLU: hem burada hem sunucuda. Kaydi giren kisi neyi
 * duzeltmesi gerektigini gormeli.
 */
export function ServiceRecordReviewDrawer({
  item,
  baseCurrency,
  onClose,
  onReviewed,
}: {
  item: FinanceServiceItem;
  baseCurrency: string;
  onClose: () => void;
  onReviewed: () => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  // Kaydi degistirince panel sifirlaniyor: onceki kayda yazilmis bir ret
  // nedeninin yeni kayda tasinmasi, yanlis gerekceyle ret demekti.
  useEffect(() => {
    setReason('');
    setRejecting(false);
    setErrorKey(null);
  }, [item.id]);

  // Escape ile kapanma: modal bir panelin klavyeyle kapatilabilmesi gerekiyor.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function review(decision: 'approve' | 'reject') {
    if (decision === 'reject' && !isRejectionReasonValid(reason)) {
      setErrorKey('finance.review.reasonRequired');
      return;
    }
    setBusy(true);
    setErrorKey(null);
    try {
      await serviceRecordsApi.review(item.id, {
        decision,
        reason: decision === 'reject' ? reason.trim() : undefined,
      });
      onReviewed();
    } catch (caught) {
      setErrorKey(reviewErrorKey(extractApiErrorCode(caught)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label={t('finance.review.title')}
      data-testid="service-review-drawer"
    >
      <div className="flex h-full w-full max-w-lg flex-col overflow-y-auto bg-background p-4 shadow-xl sm:p-6">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-lg font-bold">{t('finance.review.title')}</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        <dl className="mt-4 space-y-2 text-sm">
          <Row label={t('finance.review.vehicle')}>
            <Link
              href={`/vehicles/${item.vehicleId}`}
              className="underline underline-offset-2"
            >
              {item.vehiclePlate}
            </Link>
          </Row>
          <Row label={t('finance.review.date')}>{formatFleetDate(item.date)}</Row>
          <Row label={t('finance.review.serviceType')}>{item.serviceType}</Row>
          <Row label={t('finance.review.repairCompany')}>{item.repairCompany}</Row>
          <Row label={t('finance.review.amount')}>
            <span className="font-semibold">
              {formatFleetCurrency(Number(item.amount), item.currency)}
            </span>
          </Row>
        </dl>

        {/* Temel para birimi disindaki tutar onaylansa bile toplama GIRMEZ —
            panel bunu karar verilmeden once soyluyor. */}
        {!item.inBaseCurrency ? (
          <p className="mt-3 rounded-md border border-slate-300 bg-slate-50 p-3 text-xs text-slate-700">
            {t('finance.review.foreignCurrency', {
              currency: item.currency,
              base: baseCurrency,
            })}
          </p>
        ) : null}

        <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          {t('finance.review.consequence')}
        </p>

        {/* Gider detayi burada TEKRARLANMIYOR: kaydin tam hali kendi
            sayfasinda duruyor ve oraya baglanti var. */}
        <Link
          href={`/service-history/${item.id}`}
          className="mt-3 text-sm underline underline-offset-2"
        >
          {t('finance.review.openRecord')}
        </Link>

        {errorKey ? (
          <p
            role="alert"
            className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800"
          >
            {t(errorKey)}
          </p>
        ) : null}

        {rejecting ? (
          <div className="mt-4 space-y-2">
            <label
              className="block text-sm font-medium"
              htmlFor="finance-reject-reason"
            >
              {t('finance.review.reasonLabel')}
            </label>
            <textarea
              id="finance-reject-reason"
              className="w-full rounded border border-slate-300 p-2 text-sm"
              rows={4}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-describedby="finance-reject-hint"
            />
            <p id="finance-reject-hint" className="text-xs text-muted-foreground">
              {t('finance.review.reasonHint', { min: MIN_REJECTION_REASON })}
            </p>
          </div>
        ) : null}

        <div className="mt-auto flex flex-wrap gap-2 pt-6">
          <Button type="button" disabled={busy} onClick={() => void review('approve')}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t('finance.review.approve')}
          </Button>
          {rejecting ? (
            <>
              <Button
                type="button"
                variant="destructive"
                // Neden yetersizken buton KAPALI: kullanici 400 yemeden once
                // eksigi goruyor.
                disabled={busy || !isRejectionReasonValid(reason)}
                onClick={() => void review('reject')}
              >
                {t('finance.review.confirmReject')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setRejecting(false);
                  setErrorKey(null);
                }}
              >
                {t('common.cancel')}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setRejecting(true)}
            >
              {t('finance.review.reject')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 pb-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
