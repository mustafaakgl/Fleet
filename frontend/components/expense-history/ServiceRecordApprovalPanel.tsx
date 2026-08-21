'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { serviceRecordsApi } from '@/lib/api';
import { canViewFinancials } from '@/lib/permissions';
import type { Role, ServiceRecord } from '@/lib/types';

/** Sunucu ile AYNI alt sinir — istemci kontrolu atlanabilir, ikisi de var. */
const MIN_REASON_LENGTH = 10;

/**
 * Servis kaydinin MUHASEBE ONAYI (Faz 18B).
 *
 * NEDEN BU EKRANDA VE NEDEN AYRI BIR /finance EKRANINDA DEGIL: onay durumu
 * bu fazda kaydin kendisine eklendi; onaylanmamis bir kaydin maliyet
 * toplamlarina girmemesi ancak birinin onaylayabilmesiyle ise yarar.
 * Kuyruk ekrani (Faz 18C) gelene kadar karar, kaydin zaten acildigi yerde
 * veriliyor.
 *
 * OFFICE'E HIC GOSTERILMIYOR: tutari gormeyen bir rol, o tutari muhasebe
 * toplamina sokamaz.
 */
export function ServiceRecordApprovalPanel({
  record,
  role,
  onReviewed,
}: {
  record: ServiceRecord;
  role: Role;
  onReviewed: (updated: ServiceRecord) => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);

  if (!canViewFinancials(role)) return null;

  const status = record.approval_status ?? 'pending';

  async function review(decision: 'approve' | 'reject') {
    if (decision === 'reject' && reason.trim().length < MIN_REASON_LENGTH) {
      setErrorKey('serviceHistory.approval.reasonRequired');
      return;
    }
    setBusy(true);
    setErrorKey(null);
    try {
      const updated = await serviceRecordsApi.review(record.id, {
        decision,
        reason: decision === 'reject' ? reason.trim() : undefined,
      });
      onReviewed(updated);
      setReason('');
      setRejecting(false);
    } catch {
      setErrorKey('serviceHistory.approval.error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="rounded-lg border border-slate-200 bg-slate-50 p-4"
      data-testid="service-record-approval"
    >
      <h3 className="text-sm font-semibold text-slate-900">{t('serviceHistory.approval.title')}</h3>

      {/* Durum METIN olarak yaziyor: renk tek basina anlam tasimaz. */}
      <p className="mt-1 text-sm">
        <span className="font-medium">{t(`serviceHistory.approval.status.${status}`)}</span>
        <span className="ml-2 text-xs text-slate-600">
          {status === 'approved'
            ? t('serviceHistory.approval.inTotals')
            : t('serviceHistory.approval.notInTotals')}
        </span>
      </p>

      {record.reviewed_at ? (
        <p className="mt-1 text-xs text-slate-500">
          {t('serviceHistory.approval.reviewedAt', {
            at: new Date(record.reviewed_at).toLocaleString(),
            by: record.reviewed_by ?? t('serviceHistory.approval.unknownReviewer'),
          })}
        </p>
      ) : null}

      {/* Ret nedeni onaydan SONRA da gorunur kaliyor: daha once neden
          reddedildigi, sonradan onaylansa bile okunabilir olmali. */}
      {record.rejection_reason ? (
        <p className="mt-1 text-xs text-red-700">
          {t('serviceHistory.approval.previousRejection', { reason: record.rejection_reason })}
        </p>
      ) : null}

      {errorKey ? (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {t(errorKey)}
        </p>
      ) : null}

      {rejecting ? (
        <div className="mt-3 space-y-2">
          <label className="block text-xs font-medium text-slate-700" htmlFor="service-reject-reason">
            {t('serviceHistory.approval.reasonLabel')}
          </label>
          <textarea
            id="service-reject-reason"
            className="w-full rounded border border-slate-300 p-2 text-sm"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {status !== 'approved' ? (
          <Button type="button" size="sm" disabled={busy} onClick={() => void review('approve')}>
            {t('serviceHistory.approval.approve')}
          </Button>
        ) : null}
        {status !== 'rejected' ? (
          rejecting ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={busy}
                onClick={() => void review('reject')}
              >
                {t('serviceHistory.approval.confirmReject')}
              </Button>
              <Button
                type="button"
                size="sm"
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
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => setRejecting(true)}
            >
              {t('serviceHistory.approval.reject')}
            </Button>
          )
        ) : null}
      </div>
    </section>
  );
}
