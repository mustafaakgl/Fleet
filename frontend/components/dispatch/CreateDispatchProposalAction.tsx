'use client';

import { useCallback, useMemo, useState } from 'react';
import { Loader2, Route } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { dispatchApi } from '@/lib/api';
import { dispatchErrorKey } from '@/lib/dispatch-view';
import { showToast } from '@/lib/toast';

interface CreateDispatchProposalActionProps {
  transportOrderId: string;
  /** Yalnizca `confirmed` siparis planlanabilir. */
  orderStatus: string;
  /** Yazma yetkisi — muhasebe plan ACAMAZ. */
  canPlan: boolean;
}

/**
 * "PLANLAMA ONERISI OLUSTUR" (Faz 17g).
 *
 * YALNIZCA `confirmed` SIPARIS: taslak bir siparis henuz ticari bir taahhut
 * degil, iptal edilmis olan ise artik yok. Sunucu ikisini de reddediyor;
 * dugmeyi devre disi birakmak kullaniciyi bos yere hata ekranina goturmemek
 * icin — asil kapi SUNUCUDA.
 *
 * TEKRARLANAN ISTEK YENI ONERI ACMAZ: sunucudaki `activeFingerprint` tekil
 * oldugu icin ayni baglamda ayni anda tek canli uretim olabilir. Ikinci
 * istek hata almaz, VAR OLANI doner — ekran bunu `reused` bayragiyla ayirt
 * edip farkli bir mesaj gosteriyor, cunku "yeni plan basladi" ile "zaten bir
 * plan var" ayni sey degil.
 */
export function CreateDispatchProposalAction({
  transportOrderId,
  orderStatus,
  canPlan,
}: CreateDispatchProposalActionProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  /** Plan gunu bugun: dispatcher gunu kuyruk ekranindan degistirebiliyor. */
  const workDate = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const planable = canPlan && orderStatus === 'confirmed';

  const create = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await dispatchApi.createProposal({
        transportOrderIds: [transportOrderId],
        workDate,
      });
      setCreatedId(result.dispatchProposalId);
      showToast({
        message: result.reused
          ? t('dispatch.create.reused')
          : t('dispatch.create.queued'),
        type: 'success',
      });
    } catch (error) {
      showToast({ message: t(dispatchErrorKey(error, 'dispatch.error.createFailed')), type: 'error' });
    } finally {
      setBusy(false);
    }
  }, [busy, t, transportOrderId, workDate]);

  if (!canPlan) return null;

  return (
    <div className="rounded border border-slate-200 p-3" data-testid="dispatch-create-block">
      <h3 className="text-sm font-semibold text-slate-900">{t('dispatch.create.heading')}</h3>
      <p className="mt-1 text-xs text-slate-600">
        {planable ? t('dispatch.create.hint') : t('dispatch.create.onlyConfirmed')}
      </p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          type="button"
          size="sm"
          disabled={!planable || busy}
          onClick={() => void create()}
          data-testid="dispatch-create-proposal"
        >
          {busy ? (
            <span className="inline-flex items-center">
              <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
              {t('dispatch.create.working')}
            </span>
          ) : (
            <span className="inline-flex items-center">
              <Route className="mr-1 h-4 w-4" aria-hidden="true" />
              {t('dispatch.create.action')}
            </span>
          )}
        </Button>
        {createdId ? (
          <a
            className="text-sm font-medium text-[#1a4d7a] underline"
            href="/dispatch"
            data-testid="dispatch-create-open-queue"
          >
            {t('dispatch.create.openQueue')}
          </a>
        ) : null}
      </div>
    </div>
  );
}
