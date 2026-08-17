import { FuelEntryWorkflowStatus, Prisma } from '@prisma/client';

/**
 * "Maliyete GERCEKTEN giren yakit fisi" tanimi — TEK YERDE.
 *
 * Faz 7'den beri kural `workflowStatus = 'approved'` idi. Faz 9 ile ikinci bir
 * kosul geldi: fis ters kayda ALINMAMIS olmali. Bu iki kosulu her maliyet
 * sorgusuna elle yazmak, bir sonraki sorguyu ekleyen kisinin ikincisini
 * unutmasi demekti — ve o unutma sessizce yanlis bir toplam uretirdi, hata
 * vermeden. Bu yuzden kural burada bir kez tanimlaniyor ve butun cagiranlar
 * bunu yayiyor.
 *
 * Prisma'nin tipli `WhereInput`u kullaniliyor: `as any` yok, dolayisiyla
 * `reversal` iliskisi semadan kalkarsa derleme kirilir — sessizce filtresiz
 * calismaz.
 */
export const EFFECTIVE_FUEL_COST_WHERE = {
  workflowStatus: FuelEntryWorkflowStatus.approved,
  // `is: null` = bu kayda bagli bir ters kayit YOK.
  reversal: { is: null },
} as const satisfies Prisma.FleetFuelEntryWhereInput;

/** Maliyet sorgusunun `where`ine ek kosullari birlestirir. */
export function effectiveFuelCostWhere(
  extra: Prisma.FleetFuelEntryWhereInput = {},
): Prisma.FleetFuelEntryWhereInput {
  return { ...extra, ...EFFECTIVE_FUEL_COST_WHERE };
}

/**
 * Muhasebe acisindan ETKILI durum.
 *
 * `workflowStatus` ham gercegi tasir: onay gercekten yasandi ve kayit
 * silinmedi. Ekranin ve raporun sordugu soru ise farkli — "bu tutar su anda
 * gecerli mi". Ters kayit ikinciyi degistirir, birinciyi degil. Turetilmis
 * durum bu yuzden ayri bir alan olarak DONUYOR, veritabanina ikinci bir
 * durum kolonu yazilmiyor: iki kolon er ya da gec birbirinden ayrilirdi.
 */
export type EffectiveAccountingStatus =
  | 'approved_effective'
  | 'reversed'
  | 'driver_review'
  | 'submitted'
  | 'rejected';

export function effectiveAccountingStatus(
  workflowStatus: FuelEntryWorkflowStatus,
  hasReversal: boolean,
): EffectiveAccountingStatus {
  // Ters kayit her durumu yener: kayit onaylanmis olsa bile artik gecerli
  // degil. Liste, detay ve kuyruk AYNI fonksiyondan gectigi icin bir ekranda
  // "onayli", digerinde "ters kayit" gorunmesi mumkun degil.
  if (hasReversal) return 'reversed';
  return workflowStatus === FuelEntryWorkflowStatus.approved
    ? 'approved_effective'
    : workflowStatus;
}

/** Bu kayit su anda maliyete giriyor mu. */
export function countsTowardCost(
  workflowStatus: FuelEntryWorkflowStatus,
  hasReversal: boolean,
): boolean {
  return effectiveAccountingStatus(workflowStatus, hasReversal) === 'approved_effective';
}
