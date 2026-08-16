import type { NormalizedFuelReceiptExtraction } from '../fuel-receipt-ocr.types';

/**
 * Bu esigin ALTI "kontrol et" demektir.
 *
 * Frontend'deki LOW_CONFIDENCE_THRESHOLD ile AYNI deger olmak zorunda: iki
 * tarafta farkli esik, surucunun sari gordugu alanin muhasebede temiz
 * gorunmesine (ya da tersine) yol acardi ve "neye guvenecegiz" sorusunu
 * cevapsiz birakirdi.
 */
export const LOW_OCR_CONFIDENCE = 0.7;

/**
 * Snapshot'taki dusuk guvenli alan adlari.
 *
 * `confidence === null` DUSUK SAYILMAZ: saglayici guven bildirmiyorsa bu
 * "emin degilim" degil "olcmedim" demektir. Hepsini isaretlemek uyariyi
 * anlamsizlastirir ve muhasebe bir sure sonra hicbirine bakmaz.
 */
export function lowConfidenceFields(
  extraction: NormalizedFuelReceiptExtraction | null | undefined,
): string[] {
  if (!extraction) return [];

  const flagged: string[] = [];
  for (const [key, value] of Object.entries(extraction)) {
    if (!value || typeof value !== 'object' || !('confidence' in value)) {
      continue;
    }
    const confidence = (value as { confidence: unknown }).confidence;
    if (typeof confidence === 'number' && confidence < LOW_OCR_CONFIDENCE) {
      flagged.push(key);
    }
  }
  return flagged;
}
