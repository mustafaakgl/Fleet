import type { PayrollMovementType, PayrollPeriodStatus, PayrollTargetSystem } from '@prisma/client';
import { resolveWageTypeRule, type WageTypeRule } from './payroll-movement.mapper';
import { requiresDatevMandant } from './payroll-target-system';

/**
 * Bordro ihracat hazirlik dogrulamasi. Saglayicidan bagimsiz.
 *
 * `approved` ile `ihracata hazir` AYRI SEYLER ve ayri tutulmalarinin sebebi
 * somut: bordro hesabi Fleet'in kendi isi ve dogru olabilir; hedef sisteme
 * gonderilebilir olmak ise bambaska kosullar istiyor (personel numarasi,
 * Lohnart plani, cakisan profil surumu olmamasi). Ikisini tek bayrakta
 * birlestirmek, muhasebecinin ayi onaylayip dosyayi uretemedigi ve sebebini
 * goremedigi bir durum yaratirdi.
 *
 * Kosullarin cogu her hedef icin ayni; SAGLAYICIYA OZGU olan tek grup DATEV'in
 * Berater-/Mandantennummer'i ve o da hedeften turetilerek isteniyor. Bu ayrimi
 * yapmasaydik Lexware kalici olarak "hazir degil" durumunda kalirdi.
 */

export type PayrollReadinessCode =
  | 'period_not_approved'
  | 'target_system_not_configured'
  | 'consultant_number_missing'
  | 'client_number_missing'
  | 'personnel_number_missing'
  | 'personnel_number_duplicate'
  | 'overlapping_profile_versions'
  | 'wage_type_unmapped'
  | 'blocking_day_anomaly'
  | 'source_changed_since_export';

export type PayrollReadinessIssue = {
  code: PayrollReadinessCode;
  /** Sorunun hangi kayda ait oldugu — ekran dogrudan oraya goturebilsin. */
  driverId?: string;
  movementType?: PayrollMovementType;
  detail?: string;
};

export type PayrollReadinessResult = {
  ready: boolean;
  issues: PayrollReadinessIssue[];
};

/**
 * IHRACATI BLOKLAMAYAN bulgular.
 *
 * `source_changed_since_export` bir eksiklik degil, bir HABER: donem ihrac
 * edildikten sonra kaynak veri degismis. Bunu bloklayici saymak yanlis olurdu
 * — yapilacak sey tam tersine yeni bir surum uretmek ya da farki acik doneme
 * Ruckrechnung olarak tasimak. Bloklasaydi ofis ikisini de yapamazdi.
 */
const NON_BLOCKING: ReadonlySet<PayrollReadinessCode> = new Set(['source_changed_since_export']);

/**
 * Donem ihracati BLOKLAYAN gun anomalileri.
 *
 * Hepsi bloklamiyor: "mola cok kisa" bir ArbZG bulgusudur ve saatin dogrulugunu
 * degistirmez, ama "cikis eksik" o gunun suresinin uydurma oldugu anlamina
 * gelir. Takograf sapmasi da bloklamiyor — dogrulama sinyali, hesap degil.
 */
export const BLOCKING_DAY_ANOMALIES: ReadonlySet<string> = new Set([
  'missing_clock_in',
  'missing_clock_out',
  'open_shift_too_long',
  'calendar_code_unmapped',
]);

export type ReadinessProfile = {
  driverId: string;
  personnelNumber: string;
  validFrom: Date;
  validTo: Date | null;
};

export type ReadinessInput = {
  periodStatus: PayrollPeriodStatus;
  targetSystem: PayrollTargetSystem | null;
  /** Yalnizca DATEV hedeflerinde aranir; Lexware'de bos olmasi sorun degil. */
  consultantNumber: string | null;
  clientNumber: string | null;
  /** Donemde kalemi olan surucular. */
  driverIds: readonly string[];
  /** Butun profil surumleri (filtrelenmemis) — cakisma kontrolu icin. */
  profiles: readonly ReadinessProfile[];
  /** Donemde gercekten uretilen hareket turleri; yalnizca bunlar eslenmeli. */
  usedMovementTypes: readonly PayrollMovementType[];
  wageTypeRules: readonly WageTypeRule[];
  /** Gun satirlarindaki anomaliler, surucu bazinda. */
  dayAnomalies: ReadonlyMap<string, readonly string[]>;
  /**
   * En son uretilen dosyanin kaynak ozeti ve verinin BUGUNKU ozeti.
   *
   * Ikisi ayrilirsa elde duran dosya bayatlamis demektir. Bu, takograftan gec
   * onaylanan bir molanin ilk gorunur oldugu yer: WorkTimeEvent degisiyor,
   * ozet degisiyor, ama ihrac edilmis dosya OLDUGU GIBI kaliyor.
   */
  exportedSourceHash?: string | null;
  currentSourceHash?: string | null;
  asOf: Date;
};

function overlaps(a: ReadinessProfile, b: ReadinessProfile): boolean {
  const aEnd = a.validTo?.getTime() ?? Number.POSITIVE_INFINITY;
  const bEnd = b.validTo?.getTime() ?? Number.POSITIVE_INFINITY;
  return a.validFrom.getTime() <= bEnd && b.validFrom.getTime() <= aEnd;
}

/** Verilen anda gecerli profil surumu. */
export function profileAt(
  profiles: readonly ReadinessProfile[],
  driverId: string,
  asOf: Date,
): ReadinessProfile | null {
  const at = asOf.getTime();
  const candidates = profiles.filter(
    (profile) =>
      profile.driverId === driverId &&
      profile.validFrom.getTime() <= at &&
      (profile.validTo === null || profile.validTo.getTime() >= at),
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((latest, profile) =>
    profile.validFrom.getTime() > latest.validFrom.getTime() ? profile : latest,
  );
}

export function evaluatePayrollReadiness(input: ReadinessInput): PayrollReadinessResult {
  const issues: PayrollReadinessIssue[] = [];

  if (input.periodStatus !== 'approved' && input.periodStatus !== 'exported') {
    issues.push({ code: 'period_not_approved' });
  }
  if (!input.targetSystem) {
    issues.push({ code: 'target_system_not_configured' });
  }

  // Hedef bilinmiyorken Berater/Mandant SORULMAZ: hangi saglayiciya gittigi
  // belli olmadan "eksik" demek, Lexware secen kullaniciya asla kapanmayacak
  // bir hata gosterirdi. Hedef yoksa zaten yukarida bloklandi.
  if (input.targetSystem && requiresDatevMandant(input.targetSystem)) {
    if (!input.consultantNumber?.trim()) {
      issues.push({ code: 'consultant_number_missing' });
    }
    if (!input.clientNumber?.trim()) {
      issues.push({ code: 'client_number_missing' });
    }
  }

  // Ayni surucunun cakisan iki profil surumu → hangi personel numarasinin
  // gecerli oldugu belirsiz; sessizce birini secmek yanlis kisiye yazar.
  for (const driverId of new Set(input.profiles.map((profile) => profile.driverId))) {
    const versions = input.profiles.filter((profile) => profile.driverId === driverId);
    for (let i = 0; i < versions.length; i += 1) {
      for (let j = i + 1; j < versions.length; j += 1) {
        if (overlaps(versions[i], versions[j])) {
          issues.push({ code: 'overlapping_profile_versions', driverId });
          i = versions.length;
          break;
        }
      }
    }
  }

  const numberOwners = new Map<string, Set<string>>();
  for (const driverId of input.driverIds) {
    const profile = profileAt(input.profiles, driverId, input.asOf);
    if (!profile || !profile.personnelNumber.trim()) {
      issues.push({ code: 'personnel_number_missing', driverId });
      continue;
    }
    const owners = numberOwners.get(profile.personnelNumber) ?? new Set<string>();
    owners.add(driverId);
    numberOwners.set(profile.personnelNumber, owners);
  }

  // Tekillik veritabani kisidiyla zorlanamiyor (profil surumlu), bu yuzden
  // burada kontrol ediliyor: ayni anda iki surucu ayni numarayi tasiyamaz,
  // yoksa hedef sistemde iki kisinin saatleri tek satirda birlesir.
  for (const [personnelNumber, owners] of numberOwners) {
    if (owners.size > 1) {
      issues.push({
        code: 'personnel_number_duplicate',
        detail: personnelNumber,
      });
    }
  }

  if (input.targetSystem) {
    for (const movementType of new Set(input.usedMovementTypes)) {
      const rule = resolveWageTypeRule(
        input.wageTypeRules,
        input.targetSystem,
        movementType,
        input.asOf,
      );
      if (!rule) {
        issues.push({ code: 'wage_type_unmapped', movementType });
      }
    }
  }

  // Dosya uretildikten sonra kaynak degistiyse haber ver. Bloklamaz: gec gelen
  // bir duzeltmeden sonra yapilacak sey ya yeni surum uretmek ya da farki acik
  // doneme tasimaktir.
  if (
    input.exportedSourceHash &&
    input.currentSourceHash &&
    input.exportedSourceHash !== input.currentSourceHash
  ) {
    issues.push({ code: 'source_changed_since_export' });
  }

  for (const [driverId, anomalies] of input.dayAnomalies) {
    const blocking = anomalies.filter((anomaly) => BLOCKING_DAY_ANOMALIES.has(anomaly));
    if (blocking.length > 0) {
      issues.push({
        code: 'blocking_day_anomaly',
        driverId,
        detail: [...new Set(blocking)].sort().join(','),
      });
    }
  }

  return { ready: !issues.some((issue) => !NON_BLOCKING.has(issue.code)), issues };
}
