import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * SLOT DAVETI GUVENLIGI (Faz 17e) — SAF.
 *
 * Bu modul giris gerektirmeyen bir baglantinin tek savunma hattini kuruyor.
 * Token'i bilen herkes o daveti kullanabilir; dolayisiyla tek soru sudur:
 * token TAHMIN EDILEBILIR mi, SIZAR mi, ve sizarsa NE KADAR sey acar.
 *
 *   - TAHMIN: 256 bit rastgelelik (`randomBytes(32)`). 128 bit sart, biz iki
 *     katini kullaniyoruz — maliyeti sifir.
 *   - SIZINTI: veritabaninda YALNIZCA SHA-256 ozeti duruyor. Veritabanini
 *     okuyan biri linkleri kullanamaz (Faz 12 connector ve Faz 16 ile ayni
 *     desen).
 *   - KAPSAM: token TEK HEDEFE bagli. Baska bir kaleme, baska bir uca ya da
 *     baska bir kiraciya acilmaz; yanit govdesi zaten fiyat, arac ve surucu
 *     ICERMEZ.
 */

/** RFC-3986 guvenli alfabe: URL'de kacis gerektirmez, elle okunabilir. */
const TOKEN_BYTES = 32;

export interface IssuedToken {
  /** Duz metin — YALNIZCA uretildigi anda, bir kez doner. */
  token: string;
  /** Veritabaninda saklanan. */
  tokenHash: string;
  /** Gosterim icin kirilmis onek. TAM TOKEN DEGIL. */
  tokenPrefix: string;
}

export function issueSlotToken(): IssuedToken {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  return {
    token,
    tokenHash: hashSlotToken(token),
    // Ilk 8 karakter: destek ekibinin "hangi link" diye sorabilmesi icin
    // yeterli, tahmin icin ise anlamsiz.
    tokenPrefix: token.slice(0, 8),
  };
}

export function hashSlotToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Ozet karsilastirmasi — SABIT ZAMANLI.
 *
 * Basit `===` karakter karakter kisa devre yapar ve olculebilir bir zaman
 * farki birakir; bu fark yeterince tekrarla token'i harf harf cikarmaya izin
 * verir. Karsilastirma veritabani sorgusuyla degil burada yapildiginda bu
 * onemli.
 */
export function tokenHashMatches(candidateHash: string, storedHash: string): boolean {
  const left = Buffer.from(candidateHash, 'hex');
  const right = Buffer.from(storedHash, 'hex');
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

// ---------------------------------------------------------------------------
// Kaba kuvvet
// ---------------------------------------------------------------------------

/** Kilitlemeden once izin verilen basarisiz deneme. */
export const MAX_TOKEN_ATTEMPTS = 10;
/** Kilit suresi (ms). */
export const TOKEN_LOCK_MS = 15 * 60 * 1000;

export interface AttemptState {
  attemptCount: number;
  lockedUntil: Date | null;
}

export function isLocked(state: AttemptState, now: Date): boolean {
  return state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime();
}

/**
 * Basarisiz denemeden sonraki yeni durum.
 *
 * SAYAC BASARIDA SIFIRLANIR: mesru bir kullanicinin bir kez yanlis link
 * acmasi, sonraki gecerli denemesini engellememeli.
 */
export function registerFailedAttempt(state: AttemptState, now: Date): AttemptState {
  const attemptCount = state.attemptCount + 1;
  return {
    attemptCount,
    lockedUntil:
      attemptCount >= MAX_TOKEN_ATTEMPTS ? new Date(now.getTime() + TOKEN_LOCK_MS) : state.lockedUntil,
  };
}

// ---------------------------------------------------------------------------
// Tek guvenli cevap
// ---------------------------------------------------------------------------

/**
 * BUTUN BASARISIZ SONUCLAR AYNI CEVABI VERIR.
 *
 * Gecersiz, suresi dolmus, iptal edilmis ve BASKA KIRACIYA ait token — dordu
 * de ayni. Ayirt edilebilselerdi, bir saldirgan "bu token vardi ama suresi
 * dolmus" cevabindan kalemin VARLIGINI ogrenirdi; varligin kendisi de bir
 * bilgidir.
 *
 * Sebep yalnizca DENETIME yaziliyor, istemciye DEGIL.
 */
export type InvitationRejection =
  | 'not_found'
  | 'expired'
  | 'revoked'
  | 'already_booked'
  | 'locked'
  | 'stale_revision';

export const SAFE_INVITATION_ERROR = { code: 'slot_invitation_invalid' } as const;

export interface InvitationState {
  status: 'open' | 'booked' | 'cancelled' | 'expired' | 'revoked';
  expiresAt: Date;
  sourceRevision: number;
  attemptCount: number;
  lockedUntil: Date | null;
}

/**
 * Davet KULLANILABILIR mi.
 *
 * `currentRevision` verilirse davetin dayandigi revizyonla karsilastirilir:
 * musteri siparisi degistirdiyse eski davet gecersizdir — o davetle secilen
 * saat, artik var olmayan bir pencereye baglanirdi.
 */
export function evaluateInvitation(
  state: InvitationState,
  now: Date,
  currentRevision: number | null = null,
): { usable: boolean; reason?: InvitationRejection } {
  if (isLocked(state, now)) return { usable: false, reason: 'locked' };
  if (state.status === 'revoked' || state.status === 'cancelled') {
    return { usable: false, reason: 'revoked' };
  }
  if (state.status === 'booked') return { usable: false, reason: 'already_booked' };
  if (state.expiresAt.getTime() <= now.getTime()) return { usable: false, reason: 'expired' };
  if (currentRevision !== null && currentRevision !== state.sourceRevision) {
    return { usable: false, reason: 'stale_revision' };
  }
  return { usable: true };
}

// ---------------------------------------------------------------------------
// Slot secilebilirligi
// ---------------------------------------------------------------------------

export interface SlotState {
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  bookedCount: number;
  status: 'open' | 'closed';
}

export type SlotRejection = 'closed' | 'past' | 'full' | 'cutoff';

/**
 * DEGISIKLIK KESIM SURESI.
 *
 * Slot baslangicina bu kadar kalmissa secim/degisiklik kabul edilmiyor:
 * depo o noktada rampayi ayirmis olur ve son dakika degisikligi kimseye
 * ulasmaz. UTC uzerinden olculuyor, yani yaz saati gecisinden ETKILENMEZ —
 * yerel saat farki hesaba katilsaydi DST gecesinde kesim bir saat kayardi.
 */
export const SLOT_CHANGE_CUTOFF_MS = 2 * 60 * 60 * 1000;

export function evaluateSlot(
  slot: SlotState,
  now: Date,
): { selectable: boolean; reason?: SlotRejection } {
  if (slot.status === 'closed') return { selectable: false, reason: 'closed' };
  if (slot.startsAt.getTime() <= now.getTime()) return { selectable: false, reason: 'past' };
  if (slot.startsAt.getTime() - now.getTime() < SLOT_CHANGE_CUTOFF_MS) {
    return { selectable: false, reason: 'cutoff' };
  }
  // KAPASITE BURADA YALNIZCA GORUNUM ICIN: gercek koruma kosullu UPDATE.
  if (slot.bookedCount >= slot.capacity) return { selectable: false, reason: 'full' };
  return { selectable: true };
}

/**
 * KAPASITE KOSULU — "once say sonra ekle" DEGIL.
 *
 * Prisma `updateMany` ile kullaniliyor:
 *   where: { id, status: 'open', bookedCount: { lt: capacity } }
 *   data:  { bookedCount: { increment: 1 } }
 *
 * PostgreSQL'de tek bir kosullu UPDATE atomiktir. Once okuyup sonra yazsaydik,
 * son kontenjani iki eszamanli istek de "musait" gorur ve IKISI DE rezerve
 * ederdi — `count === 0` donen taraf yarisi kaybetmis demektir.
 */
export function capacityClaimWhere(slotId: string, capacity: number): {
  id: string;
  status: 'open';
  bookedCount: { lt: number };
} {
  return { id: slotId, status: 'open', bookedCount: { lt: capacity } };
}

// ---------------------------------------------------------------------------
// Gosterim
// ---------------------------------------------------------------------------

/**
 * UTC ani, HEDEF DILIMDE okunabilir metne cevirir.
 *
 * Sabit `Europe/Berlin` YOK: dilim cagirandan geliyor ve `Intl` uzerinden
 * cozuluyor, yani yaz saati gecisi de dogru. Elle saat ekleyip cikarmak
 * DST gecesinde bir saat kaydirirdi.
 */
export function formatInZone(instant: Date, timeZone: string, locale = 'de-DE'): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(instant);
}

/** Konumun dilimi yoksa KIRACININ dilimi. Sabit varsayilan YOK. */
export function resolveSlotTimeZone(
  locationTimeZone: string | null | undefined,
  tenantTimeZone: string,
): string {
  return locationTimeZone?.trim() || tenantTimeZone;
}

/** Davetin tek aktif hedef anahtari. */
export function activeTargetKey(consignmentId: string, kind: 'pickup' | 'delivery'): string {
  return `${consignmentId}:${kind}`;
}
