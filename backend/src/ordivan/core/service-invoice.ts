import type { AutomationCheckResult } from './automation-check.contract';

/**
 * Servis faturasi: arac eslestirme ve kontroller (Faz 13) — SAF mantik.
 *
 * AI ARAC SECMEZ. Eslestirme burada, deterministik kurallarla yapiliyor:
 * ajanin ciktisi yalnizca bir ADAY metnidir (plaka/VIN). Modelin "bu herhalde
 * su araçtir" demesine izin vermek, yanlis araca maliyet yazmanin en sessiz
 * yolu olurdu.
 */

export interface VehicleCandidate {
  id: string;
  plateNumber: string;
  vin: string | null;
}

export type VehicleMatchStatus = 'verified' | 'failed' | 'unknown';

export interface VehicleMatch {
  status: VehicleMatchStatus;
  vehicleId: string | null;
  /** Hangi alan eslesti — kullaniciya "neden bu arac" diyebilmek icin. */
  matchedBy: 'vin' | 'plate' | null;
  reason: string;
  /** Birden fazla aday varsa hepsi; kullanici listeden secer. */
  candidateIds: string[];
}

/** Bosluk, tire ve nokta ayiklanir; buyuk harfe cevrilir. */
export function normalizeIdentifier(value: string | null | undefined): string {
  return (value ?? '').replace(/[\s\-._]/g, '').toUpperCase();
}

/**
 * Deterministik eslestirme.
 *
 * SIRA: tam VIN → tam plaka → `unknown`. Kismi/benzer eslesme YOK: "DU-AB123"
 * ile "DU-AB1234" birbirine benzer ama ayni arac degildir ve maliyet yanlis
 * araca yazilir.
 *
 * CELISKI (VIN bir araci, plaka baskasini gosteriyor) `failed` doner — bu bir
 * "bilmiyorum" degil, belgenin kendi icinde tutarsiz oldugu bilgisidir.
 */
export function matchVehicle(
  candidates: VehicleCandidate[],
  extracted: { vin?: string | null; plateNumber?: string | null },
): VehicleMatch {
  const vin = normalizeIdentifier(extracted.vin);
  const plate = normalizeIdentifier(extracted.plateNumber);

  const vinMatches = vin
    ? candidates.filter((item) => normalizeIdentifier(item.vin) === vin && vin.length > 0)
    : [];
  const plateMatches = plate
    ? candidates.filter((item) => normalizeIdentifier(item.plateNumber) === plate)
    : [];

  // Ayni tanimlayici birden fazla araca denk geliyorsa karar INSANIN.
  if (vinMatches.length > 1) {
    return {
      status: 'unknown',
      vehicleId: null,
      matchedBy: null,
      reason: 'multiple_vin_matches',
      candidateIds: vinMatches.map((item) => item.id),
    };
  }
  if (vinMatches.length === 0 && plateMatches.length > 1) {
    return {
      status: 'unknown',
      vehicleId: null,
      matchedBy: null,
      reason: 'multiple_plate_matches',
      candidateIds: plateMatches.map((item) => item.id),
    };
  }

  const vinHit = vinMatches[0] ?? null;
  const plateHit = plateMatches[0] ?? null;

  if (vinHit && plateHit && vinHit.id !== plateHit.id) {
    return {
      status: 'failed',
      vehicleId: null,
      matchedBy: null,
      reason: 'vin_and_plate_disagree',
      candidateIds: [vinHit.id, plateHit.id],
    };
  }

  if (vinHit) {
    return {
      status: 'verified',
      vehicleId: vinHit.id,
      matchedBy: 'vin',
      reason: 'exact_vin',
      candidateIds: [vinHit.id],
    };
  }
  if (plateHit) {
    return {
      status: 'verified',
      vehicleId: plateHit.id,
      matchedBy: 'plate',
      reason: 'exact_plate',
      candidateIds: [plateHit.id],
    };
  }

  return {
    status: 'unknown',
    vehicleId: null,
    matchedBy: null,
    reason: vin || plate ? 'no_matching_vehicle' : 'no_vehicle_identifier',
    candidateIds: [],
  };
}

export interface ServiceInvoiceDraft {
  vendorName?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  serviceDate?: string | null;
  plateNumber?: string | null;
  vin?: string | null;
  mileageKm?: number | null;
  currency?: string | null;
  netAmount?: number | null;
  taxAmount?: number | null;
  grossAmount?: number | null;
  serviceDescription?: string | null;
}

/** Net + vergi ile brut arasinda kabul edilen sapma (yuvarlama payi). */
export const AMOUNT_TOLERANCE = 0.02;

/**
 * KRITIK ALANLAR.
 *
 * Kritik olmanin olcusu "gozden kacarsa ne kadar pahali": yanlis araca yazilan
 * maliyet, yanlis donemdeki tarih, yanlis tutar ve yanlis para birimi bir
 * raporu sessizce bozar. Kilometre servis araliklarini kaydirir.
 */
export const CRITICAL_FIELDS = [
  'vehicle',
  'serviceDate',
  'costAmount',
  'currency',
  'mileageKm',
] as const;

/**
 * Uc durumlu kontroller.
 *
 * EKSIK VERI HICBIR ZAMAN `verified` DEGIL: olcemedigimiz seyi "sorun yok"
 * diye gecmek, bu sozlesmenin engellemek icin var oldugu tek sey.
 */
export function buildServiceInvoiceChecks(input: {
  draft: ServiceInvoiceDraft;
  vehicleMatch: VehicleMatch;
}): AutomationCheckResult[] {
  const { draft, vehicleMatch } = input;
  const checks: AutomationCheckResult[] = [];

  // --- Arac ---
  checks.push({
    code: 'vehicle_match',
    status: vehicleMatch.status,
    messageKey: `automation.checks.vehicle_match.${vehicleMatch.status}`,
    messageParams: { reason: vehicleMatch.reason },
    evidence: {
      matchedBy: vehicleMatch.matchedBy,
      candidateCount: vehicleMatch.candidateIds.length,
      plateNumber: draft.plateNumber ?? null,
      vin: draft.vin ?? null,
    },
    ...(vehicleMatch.status === 'unknown' ? { unknownReason: vehicleMatch.reason } : {}),
  });

  // --- Tutar tutarliligi ---
  const { netAmount, taxAmount, grossAmount } = draft;
  if (netAmount == null || taxAmount == null || grossAmount == null) {
    checks.push({
      code: 'amount_consistency',
      status: 'unknown',
      messageKey: 'automation.checks.amount_consistency.unknown',
      evidence: {
        netAmount: netAmount ?? null,
        taxAmount: taxAmount ?? null,
        grossAmount: grossAmount ?? null,
      },
      unknownReason: 'amounts_incomplete',
    });
  } else {
    const difference = Math.abs(netAmount + taxAmount - grossAmount);
    const consistent = difference <= AMOUNT_TOLERANCE;
    checks.push({
      code: 'amount_consistency',
      status: consistent ? 'verified' : 'failed',
      messageKey: `automation.checks.amount_consistency.${consistent ? 'verified' : 'failed'}`,
      messageParams: { difference: Number(difference.toFixed(2)) },
      evidence: { netAmount, taxAmount, grossAmount, difference: Number(difference.toFixed(2)) },
    });
  }

  // --- Para birimi: EUR VARSAYILMIYOR ---
  const currency = (draft.currency ?? '').trim().toUpperCase();
  checks.push(
    currency.length === 3
      ? {
          code: 'currency_present',
          status: 'verified',
          messageKey: 'automation.checks.currency_present.verified',
          evidence: { currency },
        }
      : {
          code: 'currency_present',
          status: 'unknown',
          messageKey: 'automation.checks.currency_present.unknown',
          evidence: { currency: draft.currency ?? null },
          // "Bulamadim" ile "EUR'dur" arasindaki fark, yanlis para biriminde
          // toplanan bir yillik maliyet raporu kadar buyuk.
          unknownReason: 'currency_missing',
        },
  );

  // --- Servis tarihi ---
  const serviceDate = (draft.serviceDate ?? '').trim();
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(serviceDate) && !Number.isNaN(Date.parse(serviceDate));
  checks.push(
    validDate
      ? {
          code: 'service_date_present',
          status: 'verified',
          messageKey: 'automation.checks.service_date_present.verified',
          evidence: { serviceDate },
        }
      : {
          code: 'service_date_present',
          status: 'unknown',
          messageKey: 'automation.checks.service_date_present.unknown',
          evidence: { serviceDate: draft.serviceDate ?? null },
          unknownReason: serviceDate ? 'service_date_unparsable' : 'service_date_missing',
        },
  );

  // --- Kilometre ---
  checks.push(
    typeof draft.mileageKm === 'number' && Number.isInteger(draft.mileageKm) && draft.mileageKm >= 0
      ? {
          code: 'mileage_present',
          status: 'verified',
          messageKey: 'automation.checks.mileage_present.verified',
          evidence: { mileageKm: draft.mileageKm },
        }
      : {
          code: 'mileage_present',
          status: 'unknown',
          messageKey: 'automation.checks.mileage_present.unknown',
          evidence: { mileageKm: draft.mileageKm ?? null },
          unknownReason: 'mileage_missing',
        },
  );

  return checks;
}

export type CostBasis = 'net' | 'gross';

/**
 * Kaydedilecek tutar icin SECENEKLER.
 *
 * `ServiceRecord.costAmount`in net mi brut mu oldugu REPODA ACIK DEGIL:
 * dashboard tutari dogrudan topluyor, hicbir yerde vergi ayrimi yok. Bu
 * yuzden sessizce karar VERILMIYOR — kullaniciya iki secenek de gosteriliyor
 * ve hangisini kaydettigi onerinin ve denetimin icinde duruyor.
 */
export function costOptions(draft: ServiceInvoiceDraft): Array<{ basis: CostBasis; amount: number }> {
  const options: Array<{ basis: CostBasis; amount: number }> = [];
  if (typeof draft.netAmount === 'number') {
    options.push({ basis: 'net', amount: draft.netAmount });
  }
  if (typeof draft.grossAmount === 'number') {
    options.push({ basis: 'gross', amount: draft.grossAmount });
  }
  return options;
}
