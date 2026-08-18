/**
 * Inceleme politikasi (Faz 12 ek sartname).
 *
 * ACIKLAMA NE ZAMAN ZORUNLU: rutin bir onayda metin istemek insanlari anlamsiz
 * doldurmaya iter — ve gercekten aciklama gereken yerde de ayni refleksle "ok"
 * yazilir. Zorunluluk bu yuzden yalnizca kararin gercekten aciklanmasi gereken
 * uc durumda devreye giriyor.
 */

export type NoteRequirement =
  | { required: false }
  | { required: true; reason: 'reject' | 'rejection_category_other' | 'critical_low_confidence_unchanged' | 'policy' };

export interface ReviewFieldState {
  fieldName: string;
  /** Insan bu alani degistirdi mi. */
  changed: boolean;
  /** Alan kritik VE guveni dusuk mu. */
  criticalLowConfidence: boolean;
}

/**
 * Politika kancasi: bu turler her zaman aciklama ister.
 *
 * Faz 12'de BOS ve bilincli olarak boyle: politika kurali icat etmiyoruz,
 * yalnizca kancayi acikta birakiyoruz ki ileride bir tur eklendiginde servis
 * kodu degismeden davranis degissin.
 */
export const NOTE_REQUIRED_PROPOSAL_TYPES = new Set<string>();

export function resolveNoteRequirement(input: {
  decision: 'approved' | 'rejected';
  proposalType: string;
  rejectionCategory?: string | null;
  fields: ReviewFieldState[];
}): NoteRequirement {
  if (input.decision === 'rejected') {
    // `other` da red kapsaminda zaten zorunlu; sebebi ayrica isaretliyoruz ki
    // arayuz kullaniciya DOGRU gerekceyi gosterebilsin.
    return {
      required: true,
      reason: input.rejectionCategory === 'other' ? 'rejection_category_other' : 'reject',
    };
  }

  // Kritik ve guveni dusuk bir alan DEGISTIRILMEDEN onaylaniyorsa: insan ya
  // gercekten dogruladi ya da uzerinden gecti. Ikisini ayirt etmenin tek yolu
  // ondan bir cumle istemek.
  const unchangedCritical = input.fields.some(
    (field) => field.criticalLowConfidence && !field.changed,
  );
  if (unchangedCritical) {
    return { required: true, reason: 'critical_low_confidence_unchanged' };
  }

  if (NOTE_REQUIRED_PROPOSAL_TYPES.has(input.proposalType)) {
    return { required: true, reason: 'policy' };
  }

  return { required: false };
}

/** Aciklama zorunluysa en az bu kadar anlamli metin istenir. */
export const MIN_NOTE_LENGTH = 5;

export function isNoteAcceptable(requirement: NoteRequirement, note: string): boolean {
  if (!requirement.required) {
    return true;
  }
  return note.trim().length >= MIN_NOTE_LENGTH;
}
