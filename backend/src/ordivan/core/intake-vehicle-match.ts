import type { DocumentCandidates } from './mock-ordivan-classifier';
import { matchVehicle, type VehicleCandidate, type VehicleMatch } from './service-invoice';

/**
 * ADAYLARDAN ARACA (Faz 14) — SAF mantik, SUNUCU tarafi.
 *
 * AI ARAC SECMEZ. Siniflandirici yalnizca metinden okudugu PLAKA/VIN ADAYLARINI
 * verir; hangi aracin kastedildigi burada, Faz 13'un deterministik kuraliyla
 * cozulur: tam VIN → tam plaka. Ikinci bir eslestirme mantigi YAZILMADI,
 * `matchVehicle` yeniden kullaniliyor.
 *
 * NEDEN COKLU ADAY AYRI ELE ALINIYOR: bir belgede birden fazla plaka gecebilir
 * (ornegin atolyenin kendi araci, ya da bir listede birden cok arac). Bunlarin
 * FARKLI araclara cozulmesi "hangisi" sorusudur ve cevabi INSANDADIR — birini
 * secmek, maliyeti yanlis araca yazmanin en sessiz yolu olurdu.
 */

export interface IntakeVehicleResolution extends VehicleMatch {
  /** Belgede birden fazla farkli araca cozulen aday var mi. */
  ambiguous: boolean;
}

/**
 * Adaylari araca cozer.
 *
 * SIRA:
 *   1. VIN adaylari tek bir araca cozuluyorsa o aractir (en guclu tanimlayici).
 *   2. VIN yoksa plaka adaylarina bakilir.
 *   3. Farkli araclara cozulen adaylar varsa `unknown` + `ambiguous` — karar
 *      insanin.
 *   4. VIN bir araci, plaka baskasini gosteriyorsa `failed`: bu bir
 *      "bilmiyorum" degil, BELGENIN KENDI ICINDE TUTARSIZ oldugu bilgisidir.
 */
export function resolveIntakeVehicle(
  vehicles: VehicleCandidate[],
  candidates: Pick<DocumentCandidates, 'plateNumbers' | 'vins'>,
): IntakeVehicleResolution {
  const vins = candidates.vins ?? [];
  const plates = candidates.plateNumbers ?? [];

  // Her adayi TEK BASINA coz; sonra farkli araca cozulen var mi diye bak.
  const resolved = new Map<string, VehicleMatch>();
  for (const vin of vins) {
    const match = matchVehicle(vehicles, { vin });
    if (match.status === 'verified' && match.vehicleId) {
      resolved.set(match.vehicleId, match);
    }
  }
  const vinVehicleIds = [...resolved.keys()];

  if (vinVehicleIds.length > 1) {
    return {
      status: 'unknown',
      vehicleId: null,
      matchedBy: null,
      reason: 'multiple_vin_matches',
      candidateIds: vinVehicleIds,
      ambiguous: true,
    };
  }

  const plateResolved = new Map<string, VehicleMatch>();
  for (const plate of plates) {
    const match = matchVehicle(vehicles, { plateNumber: plate });
    if (match.status === 'verified' && match.vehicleId) {
      plateResolved.set(match.vehicleId, match);
    }
  }
  const plateVehicleIds = [...plateResolved.keys()];

  // VIN ve plaka birlikte varsa CELISKI kontrolu Faz 13'un kuralinda.
  if (vinVehicleIds.length === 1 && plateVehicleIds.length >= 1) {
    if (!plateVehicleIds.includes(vinVehicleIds[0]!)) {
      return {
        status: 'failed',
        vehicleId: null,
        matchedBy: null,
        reason: 'vin_and_plate_disagree',
        candidateIds: [vinVehicleIds[0]!, ...plateVehicleIds],
        ambiguous: false,
      };
    }
  }

  if (vinVehicleIds.length === 1) {
    return { ...resolved.get(vinVehicleIds[0]!)!, ambiguous: false };
  }

  if (plateVehicleIds.length > 1) {
    return {
      status: 'unknown',
      vehicleId: null,
      matchedBy: null,
      reason: 'multiple_plate_matches',
      candidateIds: plateVehicleIds,
      ambiguous: true,
    };
  }

  if (plateVehicleIds.length === 1) {
    return { ...plateResolved.get(plateVehicleIds[0]!)!, ambiguous: false };
  }

  return {
    status: 'unknown',
    vehicleId: null,
    matchedBy: null,
    reason: vins.length > 0 || plates.length > 0 ? 'no_matching_vehicle' : 'no_vehicle_identifier',
    candidateIds: [],
    ambiguous: false,
  };
}
