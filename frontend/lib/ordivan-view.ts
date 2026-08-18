import type {
  AutomationCheck,
  AutomationProposalDetail,
  AutomationRejectionCategory,
  OrdivanConnector,
  ProtocolCompatibility,
} from './types';

/**
 * Ordivan arayuzunun SAF kurallari (Faz 12).
 *
 * React'siz: rozet tonu, ceviri anahtari ve "aciklama zorunlu mu" karari
 * testte dogrudan dogrulanabilsin.
 */

export type Tone = 'neutral' | 'positive' | 'warning' | 'danger';

/* --------------------------------------------------------------------------
 * Connector
 * ------------------------------------------------------------------------ */

export function connectorTone(connector: OrdivanConnector): Tone {
  if (connector.status === 'revoked') return 'danger';
  if (connector.status === 'pending_enrollment') return 'neutral';
  return connector.online ? 'positive' : 'warning';
}

export function connectorStateKey(connector: OrdivanConnector): string {
  if (connector.status === 'revoked') return 'automation.connector.state.revoked';
  if (connector.status === 'pending_enrollment') return 'automation.connector.state.pending';
  return connector.online
    ? 'automation.connector.state.online'
    : 'automation.connector.state.offline';
}

/**
 * `unknown` bir uyumluluk durumu "uyumlu" DEGILDIR.
 *
 * Surum bildirmeyen bir connector'i yesil gostermek, uc durumlu kontrol
 * sozlesmesinin protokol tarafindaki ihlali olurdu.
 */
export function protocolTone(compatibility: ProtocolCompatibility): Tone {
  switch (compatibility) {
    case 'ok':
      return 'positive';
    case 'connector_too_old':
      return 'danger';
    case 'connector_too_new':
      return 'warning';
    default:
      return 'neutral';
  }
}

export function protocolLabelKey(compatibility: ProtocolCompatibility): string {
  return `automation.connector.protocol.${compatibility}`;
}

/** Guncelleme gerekiyor mu — yalnizca ESKI connector icin. */
export function needsUpdate(connector: OrdivanConnector): boolean {
  return connector.protocolCompatibility === 'connector_too_old';
}

/* --------------------------------------------------------------------------
 * Kontroller
 * ------------------------------------------------------------------------ */

export function checkTone(status: AutomationCheck['status']): Tone {
  if (status === 'verified') return 'positive';
  if (status === 'failed') return 'danger';
  // `unknown` NOTR: yesil de degil kirmizi da. "Bakmadik" kendi basina bir
  // durumdur ve iki ucun arasinda gorunmeli.
  return 'neutral';
}

export function checkLabelKey(status: AutomationCheck['status']): string {
  return `automation.check.status.${status}`;
}

/* --------------------------------------------------------------------------
 * Oneri
 * ------------------------------------------------------------------------ */

export function proposalStatusKey(status: string): string {
  return `automation.proposal.status.${status}`;
}

export function proposalTone(status: string): Tone {
  switch (status) {
    case 'approved':
      return 'positive';
    case 'rejected':
      return 'danger';
    case 'expired':
      return 'neutral';
    default:
      return 'warning';
  }
}

/** Bir alanin guveni dusuk mu. */
export function isLowConfidence(
  detail: Pick<AutomationProposalDetail, 'confidence' | 'lowConfidenceThreshold'>,
  fieldName: string,
): boolean {
  const value = detail.confidence?.[fieldName];
  return typeof value === 'number' && value < detail.lowConfidenceThreshold;
}

/**
 * Kritik alanlar.
 *
 * Faz 12'de yalnizca iki oneri turu var ve "kritik" olan, insanin gozden
 * kacirmasi en pahali olacak alan: belge turu ve guven skoru.
 */
const CRITICAL_FIELDS: Record<string, string[]> = {
  'document.classification': ['documentKind'],
  'system.echo_result': [],
};

export function isCriticalField(proposalType: string, fieldName: string): boolean {
  return (CRITICAL_FIELDS[proposalType] ?? []).includes(fieldName);
}

export const REJECTION_CATEGORIES: AutomationRejectionCategory[] = [
  'incorrect_match',
  'incorrect_value',
  'duplicate',
  'insufficient_evidence',
  'unsafe_or_untrusted',
  'other',
];

export function rejectionCategoryKey(category: string): string {
  return `automation.rejection.${category}`;
}

/* --------------------------------------------------------------------------
 * Aciklama zorunlulugu
 * ------------------------------------------------------------------------ */

export type NoteRequirement =
  | { required: false }
  | {
      required: true;
      reason: 'reject' | 'rejection_category_other' | 'critical_low_confidence_unchanged' | 'policy';
    };

export interface FieldReviewState {
  fieldName: string;
  changed: boolean;
  criticalLowConfidence: boolean;
}

/**
 * Arayuzun ONGORUSU.
 *
 * SON MERCI SUNUCU (`backend/src/ordivan/core/review-policy.ts`): burasi
 * yalnizca kullaniciya "aciklama gerekiyor" diyebilmek icin var. Arayuz
 * yanilirsa istek 400 doner ve kullanici hatayi gorur — yani bu kopya
 * guvenligi tasimiyor, yalnizca deneyimi duzeltiyor.
 */
export function resolveNoteRequirement(input: {
  decision: 'approved' | 'rejected';
  rejectionCategory?: AutomationRejectionCategory | null;
  fields: FieldReviewState[];
}): NoteRequirement {
  if (input.decision === 'rejected') {
    return {
      required: true,
      reason: input.rejectionCategory === 'other' ? 'rejection_category_other' : 'reject',
    };
  }

  const unchangedCritical = input.fields.some(
    (field) => field.criticalLowConfidence && !field.changed,
  );
  if (unchangedCritical) {
    return { required: true, reason: 'critical_low_confidence_unchanged' };
  }

  return { required: false };
}

export const MIN_NOTE_LENGTH = 5;

export function canSubmitDecision(input: {
  decision: 'approved' | 'rejected';
  rejectionCategory?: AutomationRejectionCategory | null;
  note: string;
  fields: FieldReviewState[];
}): boolean {
  // Redde kategori ZORUNLU.
  if (input.decision === 'rejected' && !input.rejectionCategory) {
    return false;
  }
  const requirement = resolveNoteRequirement(input);
  if (!requirement.required) {
    return true;
  }
  return input.note.trim().length >= MIN_NOTE_LENGTH;
}

/** Karar suresi — rubber-stamping SINYALI, hukum degil. */
export const FAST_DECISION_MS = 3_000;

export function isFastDecision(reviewDurationMs: number | null): boolean {
  return reviewDurationMs !== null && reviewDurationMs < FAST_DECISION_MS;
}

export function formatDuration(ms: number | null, locale: string): string | null {
  if (ms === null || !Number.isFinite(ms)) return null;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(seconds) + ' s';
  }
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(seconds / 60) + ' min';
}
