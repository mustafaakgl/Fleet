import type {
  FuelReconciliationPanel,
  FuelReconciliationRiskLevel,
  FuelReconciliationSignal,
} from './types';

/**
 * Telematik mutabakatinin SAF gorunum kurallari.
 *
 * Bilincli olarak React'siz: rozet tonu, ceviri anahtari ve "gosterilebilir
 * mi" kararlari testte dogrudan dogrulanabilsin. Ayni kurallar hem fis
 * cekmecesinde hem mutabakat listesinde kullaniliyor — iki ekranin ayni
 * kayda farkli tonlar vermesi mumkun olmasin.
 */

export type RiskTone = 'neutral' | 'positive' | 'warning' | 'danger';

/**
 * RENK TEK BASINA ANLAM TASIMAZ.
 *
 * Her seviyenin bir metin karsiligi ve bir ikon adi var; renk yalnizca
 * pekistirici. Renk korlugu bir yana, ekrandan okunan bir raporda ton
 * tamamen kayboluyor.
 */
const RISK_TONE: Record<FuelReconciliationRiskLevel, RiskTone> = {
  insufficient_data: 'neutral',
  normal: 'positive',
  review_required: 'warning',
  high_attention: 'danger',
};

const RISK_ICON: Record<FuelReconciliationRiskLevel, string> = {
  insufficient_data: 'help-circle',
  normal: 'check-circle',
  review_required: 'alert-circle',
  high_attention: 'alert-triangle',
};

export function riskTone(level: FuelReconciliationRiskLevel): RiskTone {
  return RISK_TONE[level] ?? 'neutral';
}

export function riskIcon(level: FuelReconciliationRiskLevel): string {
  return RISK_ICON[level] ?? 'help-circle';
}

export function riskLabelKey(level: FuelReconciliationRiskLevel): string {
  return `costs.fuelReconciliation.risk.${level}`;
}

/** Kural kodu -> ceviri anahtari. HAM KOD KULLANICIYA GOSTERILMEZ. */
export function signalLabelKey(code: string): string {
  return `costs.fuelReconciliation.signals.${code}`;
}

/** Calistirilamayan kuralin nedeni -> ceviri anahtari. */
export function missingDataLabelKey(reason: string): string {
  return `costs.fuelReconciliation.missing.${reason}`;
}

export function outcomeLabelKey(outcome: string): string {
  return `costs.fuelReconciliation.outcome.${outcome}`;
}

/**
 * Panel gosterilebilir mi.
 *
 * Analiz heniz calismadiysa (`pending`) sonuc ALANLARI DOLU DEGIL; o durumda
 * "normal" gibi gorunen bos bir panel cizmek, kontrol edilmis izlenimi
 * verirdi. Bekliyor durumu ayrica soylenir.
 */
export function panelState(
  panel: FuelReconciliationPanel | null,
): 'absent' | 'pending' | 'failed' | 'ready' {
  if (!panel) return 'absent';
  if (panel.status === 'pending') return 'pending';
  if (panel.status === 'failed') return 'failed';
  return 'ready';
}

/** Guclu sinyaller once — muhasebe listenin basindakini okusun. */
export function sortedSignals(signals: FuelReconciliationSignal[]): FuelReconciliationSignal[] {
  return [...signals].sort((left, right) => {
    if (left.severity !== right.severity) {
      return left.severity === 'strong' ? -1 : 1;
    }
    return left.code.localeCompare(right.code);
  });
}

/**
 * Inceleme aksiyonu acik mi.
 *
 * Kapali bir kayit yeniden kapatilamaz; "insufficient_data" ise karar
 * verilecek bir sey yok — kullaniciya bos bir form acmak, olmayan bir sorunu
 * varmis gibi gosterirdi.
 */
export function canReviewReconciliation(panel: FuelReconciliationPanel | null): boolean {
  if (!panel || panel.status !== 'calculated') return false;
  if (panel.review.state === 'closed') return false;
  return panel.riskLevel === 'review_required' || panel.riskLevel === 'high_attention';
}

/**
 * Litre farkini gosterilebilir bicime cevirir.
 *
 * YANLIS KESINLIK URETMEZ: olculemeyen bir deger `null` doner ve ekranda
 * "—" gorunur; sifir yazmak "olctuk ve fark yok" demek olurdu.
 */
export function formatLiters(value: number | null | undefined, locale: string): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)} l`;
}

export function formatMeters(value: number | null | undefined, locale: string): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  if (value >= 1000) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value / 1000)} km`;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)} m`;
}
