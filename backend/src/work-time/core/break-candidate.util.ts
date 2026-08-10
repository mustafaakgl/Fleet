import { intersectIntervals, mergeIntervals, subtractIntervals } from './interval.util';
import type { WorkInterval } from './work-time-fold.util';

/**
 * Takograf REST kayitlarindan MOLA ADAYI turetir.
 *
 * TAKOGRAF BORDROYU DEGISTIRMEZ. Burada uretilen sey resmi bir Zeiterfassung
 * kaydi degil, yalnizca bir iddia: "takograf burada dinlenme gordu". Kayda
 * donusmesi icin surucunun ya da ofisin onaylamasi gerekir. Sebep sadece
 * ihtiyat degil, veri de: takograf araca bagli, surucu karti okunmadiginda
 * bosluk birakiyor, `rest` durumu molayi da baska bir bekleyisi de kapsayabilir
 * ve DDD dosyasi haftalar sonra inebiliyor. Bunu dogrudan maastan dusmek,
 * dogrulanmamis bir olcumu para kararina cevirmek olurdu.
 *
 * Uc kural adaylarin gurultu olmasini engelliyor; her biri somut bir hataya
 * karsilik geliyor:
 *
 * 1. VARDIYA PENCERESI ZORUNLU. Takograf gunluk dinlenmeyi (gece 11 saat) de
 *    `rest` yaziyor. Pencere aranmasaydi her gece bir "11 saatlik mola adayi"
 *    uretilirdi.
 * 2. KAYITLI MOLA CIKARILIR. Surucu dugmeye bastiysa o dinlenme zaten kayitli;
 *    aday uretmek ayni molayi ikinci kez sormak olurdu. Cikarma islemi kismi
 *    ortusmeyi de doğru cozuyor: 12:00–12:47 REST'ten 12:00–12:30 kayitli mola
 *    dusulunce geriye 17 dakikalik GERCEKTEN kaydedilmemis parca kalir.
 * 3. ESIK. Uc-bes dakikalik REST bloklari mola degil; trafik, rampa, bekleme.
 *    Esik altindakiler aday olmaz.
 */

export type BreakCandidateDraft = {
  startedAt: Date;
  endedAt: Date;
  durationMinutes: number;
  /**
   * Adayin turedigi DELIL BLOGU: vardiya penceresine dusen, birlestirilmis
   * takograf dinlenmesi. Adayin kendisinden genis olabilir — kayitli mola
   * dusuldukten sonra geriye kalan kisim aday oluyor.
   *
   * Alti ay sonra "bu 17 dakikayi neden onerdiniz" diye soruldugunda cevap bu
   * uc sayi: takograf 47, kayitli 30, fark 17.
   */
  evidence: {
    startedAt: Date;
    endedAt: Date;
    /** Delil blogunun vardiya icindeki toplam suresi. */
    restMinutes: number;
    /** Bu blogun kayitli molayla ortusen kismi. */
    recordedBreakMinutes: number;
  };
};

/** Esigin varsayilani. Tenant profili bunu ezebiliyor. */
export const DEFAULT_BREAK_CANDIDATE_MIN_MINUTES = 15;

/**
 * Ardisik takograf kayitlarini tek dinlenme sayan bosluk. DDD ayni dinlenmeyi
 * birden fazla satira bolebiliyor; bir dakikalik bosluk gercek bir calisma
 * araligi degil, kayit siniridir.
 */
const REST_MERGE_GAP_MS = 60_000;

export type DeriveBreakCandidatesInput = {
  /** Takografin `rest` araliklari (surucuye ait, ham). */
  restIntervals: readonly WorkInterval[];
  /**
   * Vardiyanin penceresi. `null` ise HIC aday uretilmez — pencere disindaki
   * dinlenme mola degil, gunluk istirahattir.
   */
  shiftWindow: WorkInterval | null;
  /** Surucunun kendi kaydettigi mola araliklari. */
  recordedBreaks: readonly WorkInterval[];
  minMinutes: number;
};

/** Dakikaya ASAGI yuvarlar: 14 dk 59 sn'yi 15 sayip esigi gecirmek yanlis olurdu. */
function wholeMinutes(interval: WorkInterval): number {
  return Math.floor((interval.to.getTime() - interval.from.getTime()) / 60_000);
}

export function deriveBreakCandidates(input: DeriveBreakCandidatesInput): BreakCandidateDraft[] {
  if (!input.shiftWindow) return [];

  const evidenceBlocks = intersectIntervals(
    mergeIntervals(input.restIntervals, REST_MERGE_GAP_MS),
    input.shiftWindow,
  );
  const recorded = mergeIntervals(input.recordedBreaks, 0);
  const threshold = Math.max(0, input.minMinutes);
  const drafts: BreakCandidateDraft[] = [];

  // Delil blogu bazinda ilerleniyor, tum araliklar tek torbaya atilmiyor:
  // provenance her adayin KENDI blogunu gostermeli. Iki ayri dinlenmenin
  // sayilari toplanirsa "takograf 47, kayitli 30" aciklamasi anlamini yitirir.
  for (const block of evidenceBlocks) {
    const restMinutes = wholeMinutes(block);
    const recordedInBlock = intersectIntervals(recorded, block);
    const recordedBreakMinutes = recordedInBlock.reduce(
      (total, piece) => total + wholeMinutes(piece),
      0,
    );

    // Cikarma bir blogu ikiye bolebilir; bolunen parcalarin arasi kapanmissa
    // yeniden tek parca olmalari gerekir.
    const uncovered = mergeIntervals(
      subtractIntervals([block], input.recordedBreaks),
      REST_MERGE_GAP_MS,
    );

    for (const interval of uncovered) {
      const durationMinutes = wholeMinutes(interval);
      if (durationMinutes < threshold) continue;
      drafts.push({
        startedAt: interval.from,
        endedAt: interval.to,
        durationMinutes,
        evidence: {
          startedAt: block.from,
          endedAt: block.to,
          restMinutes,
          recordedBreakMinutes,
        },
      });
    }
  }

  return drafts.sort((left, right) => left.startedAt.getTime() - right.startedAt.getTime());
}
