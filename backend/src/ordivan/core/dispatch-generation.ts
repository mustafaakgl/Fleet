import { createHash } from 'node:crypto';

/**
 * DISPATCH URETIM YASAM DONGUSU VE EXACTLY-ONCE (Faz 17).
 *
 * `DispatchProposal` HEM URETIM TALEBI HEM SONUC. Ayri bir `DispatchRequest`
 * modeli ACILMADI: ikisi ayni seyin iki anidir ve ikinci bir tablo, "hangisi
 * gercek plan" sorusunu iki kaynaktan cevaplanabilir hale getirirdi.
 *
 * `proposalId` NULLABLE ve bu bir TAVIZ DEGIL, dogru modelleme: ajanin
 * ciktisi ancak worker isi tamamlayinca dogar. Ama NULLABLE bir `@unique`
 * TEK BASINA exactly-once VERMEZ — PostgreSQL NULL'lari birbirinden ayri
 * sayar, yani on tane talep ayni anda `proposalId IS NULL` tasiyabilir.
 *
 * KORUMA UC KATMANLI:
 *
 *   1. `activeFingerprint` TEKIL  — ayni baglamda AYNI ANDA tek canli uretim.
 *   2. `jobId` TEKIL              — bir oneri en fazla bir isle iliskilenir.
 *   3. CAS (kosullu update)       — baglama yalnizca dogru is, dogru deneme,
 *                                   guncel revizyon, bos `proposalId` ve
 *                                   `processing` durumunda gerceklesir.
 *
 * Bu modul SAF: kosullari ve anahtarlari uretir, hicbir sey okumaz/yazmaz.
 */

export type DispatchGeneration = 'queued' | 'processing' | 'ready' | 'failed' | 'expired';
export type DispatchReviewStatus = 'open' | 'approved' | 'rejected' | 'expired' | 'superseded';

// ---------------------------------------------------------------------------
// Parmak izi
// ---------------------------------------------------------------------------

export interface FingerprintInput {
  tenantId: string;
  /** Planlanacak siparisler ve okundugu revizyonlar. */
  orders: ReadonlyArray<{ transportOrderId: string; sourceRevision: number }>;
  /** Planlanan is gunu — ayni siparis farkli gun icin ayri baglamdir. */
  workDate: string;
}

/**
 * PLANLAMA BAGLAMININ DETERMINISTIK OZETI.
 *
 * KIRACI DAHIL: iki kiracinin ayni siparis kimliklerini tasimasi mumkun
 * degil ama parmak izini kiraci genelinde tekil bir indekste kullaniyoruz;
 * kiraciyi disarida birakmak, teorik bir cakismayi gercek bir sizintiya
 * cevirebilirdi.
 *
 * REVIZYON DAHIL: musteri siparisi degistirdiginde baglam DEGISIR ve yeni bir
 * uretim mesrudur. Revizyonu disarida biraksaydik, degismis bir siparis icin
 * yeniden plan yapmak "tekrarlanan istek" sanilirdi.
 *
 * KULLANICI DAHIL DEGIL ve bu bilincli: ayni plani iki dispatcher ayni anda
 * istediginde ikinci bir uretim baslatmak degil, VAR OLANI gostermek dogru.
 *
 * SIRALAMA NORMALIZE: siparislerin gonderim sirasi baglami degistirmez.
 */
export function buildRequestFingerprint(input: FingerprintInput): string {
  const orders = [...input.orders]
    .map((item) => `${item.transportOrderId}@${item.sourceRevision}`)
    .sort();

  return createHash('sha256')
    .update([input.tenantId, input.workDate, ...orders].join('\n'))
    .digest('hex');
}

/**
 * Oneri CANLI mi — yani `activeFingerprint` DOLU olmali mi.
 *
 * CANLI: uretim suruyor ya da uretilmis bir oneri KARAR BEKLIYOR.
 * CANLI DEGIL: basarisiz, suresi dolmus ya da karara baglanmis.
 *
 * Kural burada TEK BIR YERDE duruyor; servis kodu bunu kopyalamamali, cunku
 * iki kopya zamanla ayrisir ve biri alani bosaltmayi unutursa o baglam
 * SONSUZA KADAR yeniden planlanamaz hale gelirdi.
 */
export function isLiveGeneration(
  generation: DispatchGeneration,
  status: DispatchReviewStatus,
): boolean {
  if (generation === 'queued' || generation === 'processing') return true;
  if (generation === 'ready') return status === 'open';
  return false;
}

/** Kayda yazilacak `activeFingerprint` degeri. */
export function activeFingerprintFor(input: {
  requestFingerprint: string;
  generation: DispatchGeneration;
  status: DispatchReviewStatus;
}): string | null {
  return isLiveGeneration(input.generation, input.status) ? input.requestFingerprint : null;
}

// ---------------------------------------------------------------------------
// CAS — worker tamamlamasi
// ---------------------------------------------------------------------------

export interface CompletionContext {
  dispatchProposalId: string;
  /** Cevabi getiren isin kimligi. */
  jobId: string;
  /** Cevabin ait oldugu deneme. */
  attempt: number;
  /** Siparislerin GUNCEL revizyonlari (planlama aninda okunanla karsilastirilir). */
  currentRevisions: ReadonlyArray<{ transportOrderId: string; currentRevision: number }>;
}

export interface StoredGeneration {
  jobId: string | null;
  jobAttempt: number;
  generation: DispatchGeneration;
  proposalId: string | null;
  orders: ReadonlyArray<{ transportOrderId: string; sourceRevision: number }>;
}

export type CompletionRejection =
  | 'wrong_job'
  | 'stale_attempt'
  | 'not_processing'
  | 'already_linked'
  | 'stale_revision';

export type CompletionDecision =
  | { accept: true }
  | { accept: false; reason: CompletionRejection };

/**
 * WORKER CEVABI KABUL EDILEBILIR MI.
 *
 * SIRA GEREKCELI: en spesifik reddi once vermek, denetimde "neden
 * reddedildi" sorusunu tek kelimeyle cevaplanabilir kiliyor.
 *
 *   - `wrong_job`      — cevap baska bir ise ait. Bir worker'in baska bir
 *                        onerinin sonucunu buraya yazmasi mumkun olmamali.
 *   - `stale_attempt`  — is yeniden denendi; bu cevap ESKI denemeye ait.
 *                        Bayat sonuc guncelin uzerine yazamaz.
 *   - `not_processing` — talep `processing` degil (henuz kuyrukta, ya da
 *                        zaten sonuclanmis).
 *   - `already_linked` — `proposalId` DOLU. Ikinci bir baglanti, ikinci bir
 *                        `AutomationProposal` demekti.
 *   - `stale_revision` — siparis bu arada revize edildi. Eski veriye gore
 *                        kurulmus bir plani baglamak, musterinin degistirdigi
 *                        seyi yok saymak olurdu.
 *
 * BU ISLEV KARARI VERIR, YAZMAYI DEGIL. Yazma tarafi ayni kosullari `WHERE`
 * icinde TEKRAR uygular (CAS); buradaki kontrol erken ve okunabilir bir
 * kapi, veritabanindaki kosul ise YARISI KAZANAN taraf.
 */
export function evaluateCompletion(
  stored: StoredGeneration,
  context: CompletionContext,
): CompletionDecision {
  if (stored.jobId === null || stored.jobId !== context.jobId) {
    return { accept: false, reason: 'wrong_job' };
  }
  if (stored.jobAttempt !== context.attempt) {
    return { accept: false, reason: 'stale_attempt' };
  }
  if (stored.generation !== 'processing') {
    return { accept: false, reason: 'not_processing' };
  }
  if (stored.proposalId !== null) {
    return { accept: false, reason: 'already_linked' };
  }

  const currentByOrder = new Map(
    context.currentRevisions.map((item) => [item.transportOrderId, item.currentRevision]),
  );
  for (const order of stored.orders) {
    const current = currentByOrder.get(order.transportOrderId);
    // Siparis KAYBOLDUYSA da bayat sayilir: plan artik var olmayan bir seye
    // dayaniyor.
    if (current === undefined || current !== order.sourceRevision) {
      return { accept: false, reason: 'stale_revision' };
    }
  }

  return { accept: true };
}

/**
 * CAS `WHERE` kosulu.
 *
 * Prisma `updateMany` ile kullaniliyor: `count === 0` ise yaris kaybedildi ve
 * IKINCI BIR BAGLANTI OLUSMADI. Kosullari burada uretmek, servis kodunun
 * birini unutmasini engelliyor — unutulan tek kosul, exactly-once garantisini
 * sessizce ortadan kaldirirdi.
 */
export function completionCasWhere(context: {
  dispatchProposalId: string;
  jobId: string;
  attempt: number;
}): {
  id: string;
  jobId: string;
  jobAttempt: number;
  generation: 'processing';
  proposalId: null;
} {
  return {
    id: context.dispatchProposalId,
    jobId: context.jobId,
    jobAttempt: context.attempt,
    generation: 'processing',
    // `null` KOSULU ZORUNLU: bu olmadan gec gelen ikinci cevap var olan
    // baglantiyi EZERDI.
    proposalId: null,
  };
}

/**
 * BASARISIZ/SURESI DOLMUS ONERI YENIDEN CALISTIRILABILIR MI.
 *
 * Yalnizca `failed` ve `expired`. `ready` bir oneri yeniden calistirilmaz —
 * onun yerine YENI bir talep acilir, cunku eski oneri denetimde durmali.
 * `processing` de calistirilmaz: halen calisan bir worker olabilir ve ikinci
 * bir is, ayni oneriye iki cikti yazma yarisi baslatirdi.
 */
export function canRetryGeneration(generation: DispatchGeneration): boolean {
  return generation === 'failed' || generation === 'expired';
}
