'use client';

import { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Loader2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { fuelReconciliationApi } from '@/lib/api';
import { extractApiErrorCode } from '@/lib/fuel-station-view';
import {
  canReviewReconciliation,
  formatLiters,
  formatMeters,
  missingDataLabelKey,
  outcomeLabelKey,
  panelState,
  riskLabelKey,
  riskTone,
  signalLabelKey,
  sortedSignals,
  type RiskTone,
} from '@/lib/fuel-reconciliation-view';
import type {
  FuelReconciliationPanel as Panel,
  FuelReconciliationReviewOutcome,
} from '@/lib/types';

const MIN_NOTE = 5;

const OUTCOMES: FuelReconciliationReviewOutcome[] = [
  'valid',
  'corrected',
  'duplicate',
  'needs_investigation',
];

/**
 * Ton -> rozet varyanti VE ikon.
 *
 * Renk tek basina anlam tasimiyor: her seviyenin ayri bir ikonu ve ayri bir
 * metni var. Ekran ciktisinda ya da renk korlugunde ton kayboldugunda bilgi
 * kaybolmamali.
 */
const TONE_BADGE: Record<RiskTone, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  positive: 'default',
  warning: 'secondary',
  danger: 'destructive',
  neutral: 'outline',
};

const TONE_ICON: Record<RiskTone, typeof AlertTriangle> = {
  positive: CheckCircle2,
  warning: AlertCircle,
  danger: AlertTriangle,
  neutral: HelpCircle,
};

function reviewErrorKey(code: string | null): string {
  switch (code) {
    case 'fuel_reconciliation_review_conflict':
      return 'costs.fuelReconciliation.errors.conflict';
    case 'fuel_reconciliation_not_found':
      return 'costs.fuelReconciliation.errors.notFound';
    default:
      return 'costs.fuelReconciliation.errors.generic';
  }
}

/**
 * Kural degerlerini ceviri interpolasyonuna hazirlar.
 *
 * `null` degerler "—" olur: cevirinin icinde "null" yazmasi, olculemeyen bir
 * degeri olculmus gibi gostermekten bile kotu olurdu.
 */
function interpolation(
  values: Record<string, number | string | null>,
): Record<string, number | string> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, value ?? '—']),
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value ?? '—'}</dd>
    </div>
  );
}

/**
 * "Telematik kontrolu" paneli.
 *
 * NE SOYLER: fisin litresi ile telematikte gozlenen artis, aracin fis
 * anindaki konumu, zaman farki ve calisan/calisamayan kurallar.
 *
 * NE SOYLEMEZ: bir hukum. En agir sonuc bile "yuksek dikkat" — yani insanin
 * bakmasi gereken bir kayit. Metinlerde "hirsizlik"/"hile" gecmez ve gecmesi
 * de mumkun degil: butun metinler sabit ceviri anahtarlarindan geliyor.
 */
export function FuelReconciliationPanel({
  panel,
  onReviewed,
}: {
  panel: Panel | null;
  onReviewed?: (updated: Panel) => void;
}) {
  const { t, i18n } = useTranslation();
  const [outcome, setOutcome] = useState<FuelReconciliationReviewOutcome>('valid');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const state = panelState(panel);

  if (state === 'absent') {
    return null;
  }

  const heading = (
    <h3 className="text-sm font-semibold">{t('costs.fuelReconciliation.title')}</h3>
  );

  if (state === 'pending') {
    return (
      <section className="space-y-2 rounded-md border p-3" data-testid="reconciliation-panel">
        {heading}
        <p className="text-xs text-muted-foreground">
          {t('costs.fuelReconciliation.statusPending')}
        </p>
      </section>
    );
  }

  if (state === 'failed') {
    return (
      <section className="space-y-2 rounded-md border p-3" data-testid="reconciliation-panel">
        {heading}
        <p className="text-xs text-muted-foreground">
          {t('costs.fuelReconciliation.statusFailed')}
        </p>
      </section>
    );
  }

  const ready = panel!;
  const tone = riskTone(ready.riskLevel);
  const Icon = TONE_ICON[tone];
  const evidence = ready.evidence;
  const quality = ready.dataQuality;
  const signals = sortedSignals(ready.signals);
  const canReview = canReviewReconciliation(ready);

  const submit = async () => {
    setBusy(true);
    setErrorKey(null);
    try {
      const result = await fuelReconciliationApi.review(ready.id, {
        expectedUpdatedAt: ready.updatedAt,
        outcome,
        note: note.trim(),
      });
      onReviewed?.(result.reconciliation);
      setNote('');
    } catch (error) {
      setErrorKey(reviewErrorKey(extractApiErrorCode(error)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-md border p-3" data-testid="reconciliation-panel">
      <div className="flex items-center justify-between gap-2">
        {heading}
        <Badge variant={TONE_BADGE[tone]} className="gap-1">
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {t(riskLabelKey(ready.riskLevel))}
        </Badge>
      </div>

      {/* Kullanilan kurallar — HAM KOD DEGIL, kullanici dilinde aciklama. */}
      {signals.length > 0 ? (
        <ul className="space-y-1" data-testid="reconciliation-signals">
          {signals.map((signal) => (
            <li key={signal.code} className="flex items-start gap-2 text-xs">
              <span className="mt-0.5 shrink-0 font-medium">
                {t(`costs.fuelReconciliation.severity.${signal.severity}`)}
              </span>
              <span>{t(signalLabelKey(signal.code), interpolation(signal.values))}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t('costs.fuelReconciliation.noSignals')}
        </p>
      )}

      {/* Olculen degerler. Olculemeyenler "—" — sifir yazmak "olctuk ve fark
          yok" demek olurdu. */}
      <dl className="grid gap-1 text-xs" data-testid="reconciliation-evidence">
        <Row
          label={t('costs.fuelReconciliation.receiptLiters')}
          value={formatLiters(evidence?.receiptLiters ?? null, i18n.language)}
        />
        <Row
          label={t('costs.fuelReconciliation.observedIncrease')}
          value={formatLiters(evidence?.observedIncreaseLiters ?? null, i18n.language)}
        />
        <Row
          label={t('costs.fuelReconciliation.difference')}
          value={formatLiters(evidence?.absoluteDifferenceLiters ?? null, i18n.language)}
        />
        <Row
          label={t('costs.fuelReconciliation.tankCapacity')}
          value={formatLiters(evidence?.tankCapacityLiters ?? null, i18n.language)}
        />
        <Row
          label={t('costs.fuelReconciliation.stationDistance')}
          value={formatMeters(evidence?.stationDistanceMeters ?? null, i18n.language)}
        />
        <Row
          label={t('costs.fuelReconciliation.timeDifference')}
          value={
            evidence?.receiptToRiseMinutes === null || evidence?.receiptToRiseMinutes === undefined
              ? null
              : t('costs.fuelReconciliation.minutes', { count: evidence.receiptToRiseMinutes })
          }
        />
      </dl>

      {/* Veri yeterliligi: neyin OLCULEMEDIGI, sonucun kendisi kadar onemli. */}
      {quality && quality.missing.length > 0 ? (
        <div className="rounded-md bg-muted/40 p-2" data-testid="reconciliation-missing">
          <p className="text-xs font-medium">{t('costs.fuelReconciliation.missingTitle')}</p>
          <ul className="mt-1 space-y-0.5">
            {quality.missing.map((reason) => (
              <li key={reason} className="text-xs text-muted-foreground">
                {t(missingDataLabelKey(reason))}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('costs.fuelReconciliation.samples', {
              before: quality.fuelLevelSamplesBefore,
              after: quality.fuelLevelSamplesAfter,
            })}
          </p>
        </div>
      ) : null}

      {ready.review.state === 'closed' ? (
        <p className="rounded-md border bg-muted/30 p-2 text-xs" data-testid="reconciliation-closed">
          {t('costs.fuelReconciliation.reviewClosed', {
            outcome: t(outcomeLabelKey(ready.review.outcome ?? 'valid')),
            name: ready.review.reviewedBy?.name ?? '—',
          })}
          {ready.review.note ? <span className="block mt-1">{ready.review.note}</span> : null}
        </p>
      ) : null}

      {canReview ? (
        <div className="space-y-2 border-t pt-2" data-testid="reconciliation-review-form">
          <label htmlFor="reconciliation-outcome" className="text-xs font-medium">
            {t('costs.fuelReconciliation.reviewLabel')}
          </label>
          <select
            id="reconciliation-outcome"
            className="w-full rounded-md border px-2 py-1 text-xs"
            value={outcome}
            onChange={(event) =>
              setOutcome(event.target.value as FuelReconciliationReviewOutcome)
            }
          >
            {OUTCOMES.map((value) => (
              <option key={value} value={value}>
                {t(outcomeLabelKey(value))}
              </option>
            ))}
          </select>
          <textarea
            id="reconciliation-note"
            className="w-full rounded-md border px-2 py-1 text-xs"
            rows={2}
            value={note}
            placeholder={t('costs.fuelReconciliation.notePlaceholder')}
            onChange={(event) => setNote(event.target.value)}
          />
          {errorKey ? <p className="text-xs text-red-600">{t(errorKey)}</p> : null}
          <Button
            size="sm"
            disabled={busy || note.trim().length < MIN_NOTE}
            onClick={submit}
            data-testid="reconciliation-review-submit"
          >
            {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
            {t('costs.fuelReconciliation.reviewSubmit')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
