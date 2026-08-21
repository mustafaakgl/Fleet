import { extractErrorCode } from './fuel-compatibility';
import type {
  DispatchCheckStatus,
  DispatchCheckView,
  DispatchDecision,
  DispatchGeneration,
  DispatchProposalStatus,
  DispatchRouteStatus,
} from './types';

/**
 * DISPATCH GORUNUM MANTIGI — SAF (Faz 17g).
 *
 * Bilesenlerden AYRI cunku burasi test edilebilir olmali: "hangi aday
 * uygulanabilir", "hangi kontrol beyan bekliyor", "eksik alan nasil
 * gosterilir" sorulari bir React agacini render etmeden cevaplanabilmeli.
 *
 * SUNUCU KARARINI TEKRAR HESAPLAMIYOR: uygunluk sunucuda belirleniyor
 * (`core/dispatch-eligibility.ts`). Buradaki her sey o kararin GOSTERIMI.
 * Istemcide ikinci bir uygunluk motoru yazsaydik ikisi ayrisir ve arayuz
 * "uygun" derken sunucu reddederdi.
 */

export type Tone = 'positive' | 'warning' | 'danger' | 'neutral';

/** UC DURUMLU KONTROL. `unknown` "sorun yok" DEMEK DEGILDIR. */
export function checkTone(status: DispatchCheckStatus): Tone {
  if (status === 'verified') return 'positive';
  if (status === 'incompatible') return 'danger';
  // `unknown` NOTR DEGIL UYARI: dogrulanamamis bir sey, dogrulanmis gibi
  // sessiz gorunmemeli.
  return 'warning';
}

export function decisionTone(decision: DispatchDecision): Tone {
  if (decision === 'eligible') return 'positive';
  if (decision === 'blocked') return 'danger';
  return 'warning';
}

export function generationTone(generation: DispatchGeneration): Tone {
  switch (generation) {
    case 'ready':
      return 'positive';
    case 'failed':
    case 'expired':
      return 'danger';
    case 'processing':
    case 'queued':
      return 'neutral';
    default:
      return 'neutral';
  }
}

export function proposalStatusTone(status: DispatchProposalStatus): Tone {
  switch (status) {
    case 'approved':
      return 'positive';
    case 'rejected':
    case 'expired':
      return 'danger';
    case 'superseded':
      return 'warning';
    default:
      return 'neutral';
  }
}

export function routeTone(status: DispatchRouteStatus): Tone {
  if (status === 'ok') return 'positive';
  if (status === 'degraded') return 'warning';
  return 'danger';
}

/** Ceviri anahtarlari — sunucu METIN URETMEZ, kod uretir. */
export function generationLabelKey(generation: DispatchGeneration): string {
  return `dispatch.generation.${generation}`;
}

export function proposalStatusLabelKey(status: DispatchProposalStatus): string {
  return `dispatch.status.${status}`;
}

export function decisionLabelKey(decision: DispatchDecision): string {
  return `dispatch.decision.${decision}`;
}

export function checkStatusLabelKey(status: DispatchCheckStatus): string {
  return `dispatch.checkStatus.${status}`;
}

/**
 * Kontrol kodunun basligi.
 *
 * Bilinmeyen kod SESSIZCE DUSURULMEZ: sunucu yeni bir kontrol eklediginde
 * arayuz onu ham koduyla da olsa GOSTERMELI. Gizleseydik, dispatcher
 * bilmedigi bir sebeple engellenmis bir plani anlayamazdi.
 */
const KNOWN_CHECK_CODES = new Set([
  'vehicle_available',
  'vehicle_no_conflict',
  'vehicle_inspection',
  'vehicle_insurance',
  'vehicle_capacity_weight',
  'vehicle_capacity_volume',
  'vehicle_capacity_pallets',
  'vehicle_adr',
  'driver_available',
  'driver_no_conflict',
  'driver_calendar',
  'driver_license',
  'driver_drive_time',
  'time_windows',
]);

export function checkLabelKey(code: string): string | null {
  return KNOWN_CHECK_CODES.has(code) ? `dispatch.check.${code}` : null;
}

/**
 * Gerekce anahtari.
 *
 * SUNUCU TAM ANAHTARI GONDERIYOR (`dispatch.reason.vehicleActive`), on ek
 * EKLENMEZ. Eklerdik ve `dispatch.reason.dispatch.reason.vehicleActive`
 * cikardi — ceviri bulunamaz, ekranda HAM ANAHTAR gorunurdu.
 *
 * Maskelenmis gerekce tek istisna: cekirdek notr bir isaret (`masked_financial`)
 * gonderiyor ve o bir ceviri anahtari degil.
 */
export function reasonLabelKey(reasonKey: string): string {
  if (reasonKey === MASKED_REASON_KEY) return 'dispatch.reason.maskedFinancial';
  return reasonKey.startsWith('dispatch.reason.') ? reasonKey : `dispatch.reason.${reasonKey}`;
}

/** Sunucudaki `MASKED_REASON_KEY` ile AYNI olmali. */
export const MASKED_REASON_KEY = 'masked_financial';

// ---------------------------------------------------------------------------
// Beyan (manual override) mantigi
// ---------------------------------------------------------------------------

/** Sunucudaki `MIN_OVERRIDE_NOTE_LENGTH` ile AYNI olmali. */
export const MIN_OVERRIDE_NOTE_LENGTH = 10;

/**
 * Beyan bekleyen kontroller.
 *
 * `incompatible` BURAYA GIRMEZ ve girmemeli: yasal engeller (ehliyet,
 * aktiflik, bakim) bir beyanla gecilemez. Arayuzde bir "yine de onayla"
 * dugmesi gostermek, sunucunun reddedecegi bir seyi mumkun gostermek olurdu.
 */
export function checksNeedingDeclaration(checks: readonly DispatchCheckView[]): DispatchCheckView[] {
  return checks.filter((check) => check.status === 'unknown' && check.overridable);
}

/** Hicbir beyanla asilamayan kontroller — adayin uygulanamama sebebi. */
export function blockingChecks(checks: readonly DispatchCheckView[]): DispatchCheckView[] {
  return checks.filter((check) => check.status === 'incompatible');
}

/**
 * Veri eksikligi yuzunden asilamayan kontroller.
 *
 * `unknown` ama `overridable` DEGIL: bu bir beyan sorunu degil, VERI sorunu.
 * Cozumu arac/surucu kaydini tamamlamak — arayuz kullaniciyi oraya
 * yonlendirebilmeli.
 */
export function checksNeedingData(checks: readonly DispatchCheckView[]): DispatchCheckView[] {
  return checks.filter((check) => check.status === 'unknown' && !check.overridable);
}

export type DeclarationAnswer = 'yes' | 'no';

export interface DeclarationDraft {
  note: string;
  answer: DeclarationAnswer | '';
}

/**
 * Bir beyan taslagi GECERLI mi.
 *
 * Iki tur var ve ikisi de sunucudaki kuralin aynisi:
 *   - `external_verification`: ZORUNLU ACIKLAMA. Bos ya da "ok" gibi bir
 *     metin beyan sayilmaz — kisi neyi dogruladigini yazmali.
 *   - `explicit_choice`: ACIK SECIM. "bilmiyorum" bir cevap DEGIL.
 *
 * Arayuz bunu sunucudan ONCE uyguluyor ki kullanici formu doldurup 409
 * almasin; ama asil kapi SUNUCUDA ve orada da ayni kural var.
 */
export function isDeclarationComplete(draft: DeclarationDraft): boolean {
  if (draft.answer === 'yes' || draft.answer === 'no') return true;
  return draft.note.trim().length >= MIN_OVERRIDE_NOTE_LENGTH;
}

/** Butun bekleyen beyanlar verildi mi — onay dugmesinin kapisi. */
export function allDeclarationsComplete(
  pending: readonly DispatchCheckView[],
  drafts: Readonly<Record<string, DeclarationDraft>>,
): boolean {
  return pending.every((check) => {
    const draft = drafts[check.code];
    return draft ? isDeclarationComplete(draft) : false;
  });
}

/**
 * Aday UYGULANABILIR mi — arayuz kapisi.
 *
 * `blocked` HICBIR beyanla uygulanamaz. `review_required` yalnizca butun
 * bekleyen beyanlar verildiginde. Veri eksigi (`needsData`) de engeldir ve
 * beyanla gecilemez.
 */
export function canApplyCandidate(
  checks: readonly DispatchCheckView[],
  drafts: Readonly<Record<string, DeclarationDraft>>,
): boolean {
  if (blockingChecks(checks).length > 0) return false;
  if (checksNeedingData(checks).length > 0) return false;
  return allDeclarationsComplete(checksNeedingDeclaration(checks), drafts);
}

// ---------------------------------------------------------------------------
// Bicimlendirme — EKSIK ALAN "0" DEGILDIR
// ---------------------------------------------------------------------------

/**
 * `null` degeri "dogrulanamadi" olarak isaretler.
 *
 * BOS ALANI 0 YA DA "-" GOSTERMEK YASAK: 0 kg tasima kapasitesi ile
 * "kapasitesi girilmemis" ayni sey degil ve ikincisi bir EKSIKLIKTIR.
 * Cagiran taraf donen `unknown` bayragina gore ayri bir gorsel kullaniyor.
 */
export interface DisplayValue {
  text: string | null;
  unknown: boolean;
}

export function displayNumber(
  value: number | null | undefined,
  locale: string,
  options?: Intl.NumberFormatOptions,
): DisplayValue {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return { text: null, unknown: true };
  }
  return { text: new Intl.NumberFormat(locale, options).format(value), unknown: false };
}

/** Rota bozulmusken mesafe/sure BIR TAHMINDIR ve oyle isaretlenir. */
export function isRouteEstimated(status: DispatchRouteStatus): boolean {
  return status !== 'ok';
}

export function formatDurationMinutes(minutes: number | null | undefined): string | null {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return null;
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return hours > 0 ? `${hours} h ${rest} min` : `${rest} min`;
}

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

/**
 * Karar anahtari — CIFT TIKLAMAYA KARSI.
 *
 * Anahtar KARAR BASINA URETILIYOR ve tekrar denemede AYNI kaliyor: sunucu
 * ayni anahtari tekrar gorunce mevcut sonucu doner, FARKLI bir anahtar
 * gorunce 409. Her tiklamada yeni anahtar uretseydik, ag hatasi sonrasi
 * yeniden deneme "baskasi onayladi" hatasi alirdi.
 */
export function createDecisionKey(prefix: 'approve' | 'reject', proposalId: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${proposalId.slice(0, 8)}-${random}`.slice(0, 128);
}

// ---------------------------------------------------------------------------
// Hata kodlari — HAM KOD KULLANICIYA GOSTERILMEZ
// ---------------------------------------------------------------------------

/**
 * Sunucunun makine kodlari -> ceviri anahtarlari.
 *
 * `getApiErrorMessage` backend'in HAM mesajini doner ve o mesaj Ingilizce,
 * teknik ve cevrilmemis. Kullaniciya `dispatch_stale_proposal_revision`
 * gostermek, ona ne yapacagini soylemeyen bir dizedir. Bilinen her kod
 * BURADA cevriliyor; bilinmeyen kod genel bir mesaja dusuyor — ham kod
 * HICBIR durumda ekrana cikmiyor.
 */
const DISPATCH_ERROR_KEYS: Record<string, string> = {
  dispatch_proposal_not_found: 'dispatch.error.notFound',
  dispatch_proposal_not_ready: 'dispatch.error.notReady',
  dispatch_proposal_already_decided: 'dispatch.error.alreadyDecided',
  dispatch_stale_proposal_revision: 'dispatch.error.staleRevision',
  dispatch_stale_revision: 'dispatch.error.staleOrder',
  dispatch_order_not_confirmed: 'dispatch.error.orderNotConfirmed',
  dispatch_order_missing: 'dispatch.error.orderMissing',
  dispatch_not_applicable: 'dispatch.error.notApplicable',
  dispatch_candidate_not_found: 'dispatch.error.candidateNotFound',
  dispatch_no_consignments: 'dispatch.error.noConsignments',
  dispatch_no_orders: 'dispatch.error.noOrders',
  dispatch_invalid_work_date: 'dispatch.error.invalidWorkDate',
  dispatch_expected_updated_at_invalid: 'dispatch.error.staleRevision',
  dispatch_approval_raced: 'dispatch.error.raced',
  dispatch_approval_role_forbidden: 'dispatch.error.forbidden',
  dispatch_reject_reason_required: 'dispatch.error.reasonRequired',
  dispatch_result_already_linked: 'dispatch.error.alreadyDecided',
  dispatch_result_not_applied: 'dispatch.error.tourNotApplied',
  dispatch_retry_not_allowed: 'dispatch.error.retryNotAllowed',
};

const SLOT_ERROR_KEYS: Record<string, string> = {
  slot_invitation_invalid: 'slots.error.invitationInvalid',
  slot_invitation_already_active: 'slots.error.invitationAlreadyActive',
  slot_invitation_not_open: 'slots.error.invitationNotOpen',
  slot_invitation_not_found: 'slots.error.invitationNotFound',
  slot_consignment_not_found: 'slots.error.consignmentNotFound',
  slot_order_not_confirmed: 'slots.error.orderNotConfirmed',
  slot_manage_role_forbidden: 'slots.error.forbidden',
  slot_not_selectable: 'slots.error.notSelectable',
  slot_capacity_exhausted: 'slots.error.capacityExhausted',
  slot_capacity_below_bookings: 'slots.error.capacityBelowBookings',
  slot_change_cutoff: 'slots.error.changeCutoff',
  slot_already_defined: 'slots.error.alreadyDefined',
  slot_window_invalid: 'slots.error.windowInvalid',
  slot_location_not_found: 'slots.error.locationNotFound',
  slot_not_found: 'slots.error.notFound',
  slot_timezone_invalid: 'slots.error.timezoneInvalid',
};

export function dispatchErrorKey(error: unknown, fallback = 'dispatch.error.generic'): string {
  const code = extractErrorCode(error);
  return (code && DISPATCH_ERROR_KEYS[code]) || fallback;
}

export function slotErrorKey(error: unknown, fallback = 'slots.error.generic'): string {
  const code = extractErrorCode(error);
  return (code && SLOT_ERROR_KEYS[code]) || fallback;
}

/**
 * Karar CAKISTI mi — ekranin yenilenmesi gerekiyor mu.
 *
 * Bu kodlarda "tekrar dene" demek anlamsizdir: veri degismis, once yeniden
 * yuklenmeli. Kullaniciya ayni dugmeyi tekrar sundurmak, ayni hatayi ikinci
 * kez almasina yol acardi.
 */
export function isStaleDecisionError(error: unknown): boolean {
  const code = extractErrorCode(error);
  return (
    code === 'dispatch_proposal_already_decided' ||
    code === 'dispatch_stale_proposal_revision' ||
    code === 'dispatch_stale_revision' ||
    code === 'dispatch_approval_raced' ||
    code === 'dispatch_result_already_linked'
  );
}
