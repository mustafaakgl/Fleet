/**
 * Ordivan calisma modu (Faz 12).
 *
 *   disabled — Ordivan kapali. Fleet HICBIR SEY KAYBETMEDEN calismaya devam
 *              eder: uclar 503 doner, ekranda "kapali" yazar, kuyruk birikmez.
 *   mock     — Deterministik sahte worker. YALNIZCA development/test.
 *   local    — Gercek Ordivan. Bu fazda kullanilmiyor, adi simdiden ayrildi.
 *
 * URETIMDE MOCK FAIL-FAST: uretimde sahte bir ajanin oneri uretmesi, insanin
 * "sistem baktı" sanmasi demektir. Yanlis yapilandirma ilk istegi bekleyip
 * sessizce sahte veri uretmek yerine SUREC BASLARKEN duyulur olmali.
 */

export type OrdivanConnectorMode = 'disabled' | 'mock' | 'local';

const MODES: OrdivanConnectorMode[] = ['disabled', 'mock', 'local'];

export class OrdivanConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrdivanConfigError';
  }
}

export function isProductionEnv(nodeEnv = process.env.NODE_ENV): boolean {
  return (nodeEnv ?? '').trim().toLowerCase() === 'production';
}

/**
 * Modu cozer ve gecersiz yapilandirmada FIRLATIR.
 *
 * Varsayilan `disabled`: yapilandirmayi hic gormemis bir kurulumu sessizce
 * otomasyona baglamak, en az sahte veri kadar kotu olurdu.
 */
export function resolveOrdivanMode(
  raw = process.env.ORDIVAN_CONNECTOR_MODE,
  nodeEnv = process.env.NODE_ENV,
): OrdivanConnectorMode {
  const value = (raw ?? '').trim().toLowerCase();
  if (!value) {
    return 'disabled';
  }

  if (!MODES.includes(value as OrdivanConnectorMode)) {
    throw new OrdivanConfigError(
      `ORDIVAN_CONNECTOR_MODE must be one of ${MODES.join(' | ')}`,
    );
  }

  const mode = value as OrdivanConnectorMode;

  if (mode === 'mock' && isProductionEnv(nodeEnv)) {
    // Mesaj DEGER ICERMEZ ve cozum yolunu soyler.
    throw new OrdivanConfigError(
      'ORDIVAN_CONNECTOR_MODE=mock is refused in production — use disabled or local',
    );
  }

  return mode;
}

/** Ordivan uclari acik mi. `disabled` iken Fleet calisir, uclar kapalidir. */
export function isOrdivanEnabled(mode: OrdivanConnectorMode): boolean {
  return mode !== 'disabled';
}

/**
 * Bir onerinin insan incelemesi icin bekleyebilecegi sure.
 *
 * SUNUCU TARAFINDAN YONETILIR: connector ya da istemci bir sure onerememeli.
 * Suresi dolan oneri SESSIZCE ONAYLANMIS SAYILMAZ — `expired` olur, acik onay
 * gorevi kapanir ve bir daha karar verilemez. "Kimse bakmadi" ile "bakildi ve
 * onaylandi" birbirinden ayrilmali.
 */
export const PROPOSAL_REVIEW_TTL_MS = Number(
  process.env.ORDIVAN_PROPOSAL_TTL_MS ?? 7 * 24 * 60 * 60_000,
);

/** Fleet'in kabul ettigi EN DUSUK connector protokol surumu. */
export const MIN_SUPPORTED_PROTOCOL_VERSION = 1;
/** Fleet'in konustugu protokol surumu. */
export const CURRENT_PROTOCOL_VERSION = 1;

export type ProtocolCompatibility = 'ok' | 'connector_too_old' | 'connector_too_new' | 'unknown';

/**
 * Connector'in bildirdigi protokol surumunu degerlendirir.
 *
 * `unknown` ayri bir durum: surum bildirmeyen bir connector "uyumlu" SAYILMAZ
 * (bkz. uc durumlu kontrol sozlesmesi).
 */
export function evaluateProtocolCompatibility(
  reported: string | null | undefined,
): ProtocolCompatibility {
  const parsed = Number.parseInt((reported ?? '').trim(), 10);
  if (!Number.isInteger(parsed)) {
    return 'unknown';
  }
  if (parsed < MIN_SUPPORTED_PROTOCOL_VERSION) {
    return 'connector_too_old';
  }
  if (parsed > CURRENT_PROTOCOL_VERSION) {
    return 'connector_too_new';
  }
  return 'ok';
}
