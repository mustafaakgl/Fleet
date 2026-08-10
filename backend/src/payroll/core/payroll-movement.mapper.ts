import type { PayrollMovementType, PayrollTargetSystem } from '@prisma/client';
import { unitOf, type NormalizedPayrollMovement } from './payroll-movement';

/**
 * PayrollEntry → NormalizedPayrollMovement.
 *
 * Saf: veritabani, saat ve dosya bicimi bilmiyor. Hicbir saglayiciya ozgu
 * degil — `externalWageType` yalnizca tasinan bir dize; onu Lohnart olarak
 * yorumlayan yer adaptordur.
 */

/** Kalemdeki hangi alanin hangi harekete karsilik geldigi. */
const MOVEMENT_SOURCES: ReadonlyArray<{ type: PayrollMovementType; field: EntryField }> = [
  { type: 'regular_hours', field: 'regularMinutes' },
  { type: 'overtime_hours', field: 'overtimeMinutes' },
  { type: 'night_hours', field: 'nightMinutes' },
  { type: 'night_core_hours', field: 'nightCoreMinutes' },
  { type: 'sunday_hours', field: 'sundayMinutes' },
  { type: 'holiday_hours', field: 'holidayMinutes' },
  { type: 'vacation', field: 'vacationDays' },
  { type: 'sickness', field: 'sickDays' },
  { type: 'unpaid_absence', field: 'unpaidAbsenceDays' },
];

type EntryField =
  | 'regularMinutes'
  | 'overtimeMinutes'
  | 'nightMinutes'
  | 'nightCoreMinutes'
  | 'sundayMinutes'
  | 'holidayMinutes'
  | 'vacationDays'
  | 'sickDays'
  | 'unpaidAbsenceDays';

export type MappableEntry = Record<EntryField, number> & {
  id: string;
  driverId: string;
  kind: 'regular' | 'correction';
};

export type WageTypeRule = {
  targetSystem: PayrollTargetSystem;
  movementType: PayrollMovementType;
  externalWageType: string;
  enabled: boolean;
  validFrom: Date;
  validTo: Date | null;
  costCenter: string | null;
  costUnit: string | null;
};

export type DriverPayrollIdentity = {
  driverId: string;
  personnelNumber: string;
  costCenter: string | null;
  costUnit: string | null;
};

/**
 * Belirli bir ANDA gecerli Lohnart eslemesi.
 *
 * Lohnart planlari yil icinde degisiyor ve gecmis bir donem yeniden
 * uretildiginde O TARIHTE gecerli olan numara kullanilmali; "en son kayit"
 * almak, Temmuz'u Agustos'un planiyla ihrac etmek olurdu. Ayni ana birden
 * fazla kural denk gelirse en GEC baslayan kazanir.
 */
export function resolveWageTypeRule(
  rules: readonly WageTypeRule[],
  targetSystem: PayrollTargetSystem,
  movementType: PayrollMovementType,
  asOf: Date,
): WageTypeRule | null {
  const at = asOf.getTime();
  const candidates = rules.filter(
    (rule) =>
      rule.enabled &&
      rule.targetSystem === targetSystem &&
      rule.movementType === movementType &&
      rule.validFrom.getTime() <= at &&
      (rule.validTo === null || rule.validTo.getTime() >= at),
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((latest, rule) =>
    rule.validFrom.getTime() > latest.validFrom.getTime() ? rule : latest,
  );
}

export type BuildMovementsInput = {
  entries: readonly MappableEntry[];
  identities: ReadonlyMap<string, DriverPayrollIdentity>;
  rules: readonly WageTypeRule[];
  targetSystem: PayrollTargetSystem;
  year: number;
  month: number;
  /** Esleme hangi ana gore cozulecek — donemin son gunu. */
  asOf: Date;
};

/**
 * Hareketleri uretir.
 *
 * SIFIR MIKTAR ATLANIYOR: hedef sistemde sifirlik bir Lohnart satiri mevcut degeri
 * sifirlayabiliyor ve "bu ay gece calismasi yok" ile "gece kalemini gonderme"
 * ayni sey degil. NEGATIF miktar ATLANMIYOR: Ruckrechnung kalemleri fark
 * tasiyor ve fark eksi olabilir.
 *
 * Saat kovalarinin toplami calisilan sureyi VERMEZ — gece/Pazar/tatil ayni
 * dakikalarin zam nitelikleri. Bordro sistemleri de Grundstunden ile
 * Zuschlagsstunden'i ayri bekliyor, yani bu ust uste binme dogru olan.
 */
export function buildNormalizedMovements(input: BuildMovementsInput): {
  movements: NormalizedPayrollMovement[];
  /** Eslemesi olmadigi icin disarida kalan hareketler — hazirlik bunu engeller. */
  unmapped: Array<{ driverId: string; type: PayrollMovementType; quantity: number }>;
  /** Personel numarasi bulunamayan kalemler. */
  missingIdentity: string[];
} {
  const payrollPeriod = `${input.year}-${String(input.month).padStart(2, '0')}`;
  const movements: NormalizedPayrollMovement[] = [];
  const unmapped: Array<{ driverId: string; type: PayrollMovementType; quantity: number }> = [];
  const missingIdentity: string[] = [];

  for (const entry of input.entries) {
    const identity = input.identities.get(entry.driverId);
    if (!identity) {
      missingIdentity.push(entry.driverId);
      continue;
    }

    for (const source of MOVEMENT_SOURCES) {
      const quantity = entry[source.field];
      if (quantity === 0) continue;

      const rule = resolveWageTypeRule(input.rules, input.targetSystem, source.type, input.asOf);
      if (!rule) {
        unmapped.push({ driverId: entry.driverId, type: source.type, quantity });
        continue;
      }

      movements.push({
        driverId: entry.driverId,
        personnelNumber: identity.personnelNumber,
        payrollPeriod,
        type: source.type,
        quantity,
        unit: unitOf(source.type),
        wageType: rule.externalWageType,
        // Kova bazli Kostenstelle surucununkini EZER: bir sirket gece
        // saatlerini ayri masraf yerine yaziyor olabilir.
        costCenter: rule.costCenter ?? identity.costCenter ?? undefined,
        costUnit: rule.costUnit ?? identity.costUnit ?? undefined,
        sourceId: entry.id,
      });
    }
  }

  return { movements, unmapped, missingIdentity };
}

/** Ekranin "hangi turden kac kayit" ozeti. */
export function summarizeMovements(
  movements: readonly NormalizedPayrollMovement[],
): Array<{ type: PayrollMovementType; recordCount: number; totalQuantity: number }> {
  const byType = new Map<PayrollMovementType, { recordCount: number; totalQuantity: number }>();
  for (const movement of movements) {
    const current = byType.get(movement.type) ?? { recordCount: 0, totalQuantity: 0 };
    current.recordCount += 1;
    current.totalQuantity += movement.quantity;
    byType.set(movement.type, current);
  }
  return [...byType.entries()]
    .map(([type, value]) => ({ type, ...value }))
    .sort((left, right) => left.type.localeCompare(right.type));
}
