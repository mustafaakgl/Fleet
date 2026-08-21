import {
  FineStatus,
  InvoiceKind,
  OutgoingInvoiceStatus,
  Prisma,
  ServiceRecordApprovalStatus,
} from '@prisma/client';

/**
 * TANIMA (recognition) — bir parasal satirin muhasebe toplamina GIRIP
 * GIRMEDIGININ tek tanimi.
 *
 * NEDEN BU MODUL VAR: kural Faz 7'den beri yalnizca YAKITTA dogruydu
 * (`effective-fuel-cost.ts`). Servis kaydi ve ceza hicbir kapiden gecmeden
 * maliyete giriyordu; gorev geliri ise bir TAHMIN oldugu halde "gelir" diye
 * gosteriliyordu. Ayni kurali her sorguya elle yazmak, bir sonraki sorguyu
 * ekleyen kisinin unutmasi demekti — ve o unutma HATA VERMEDEN sessizce
 * yanlis bir toplam uretirdi.
 *
 * SINIF TURETILIR, SAKLANMAZ. Veritabanina ikinci bir "muhasebe durumu"
 * kolonu yazilmiyor: iki kolon er ya da gec birbirinden ayrilir ve o an
 * hangisinin dogru oldugu sorulamaz hale gelir. Sinif her zaman mevcut
 * durum alanlarindan HESAPLANIYOR.
 */
export type RecognitionClass =
  /** Planlama tahmini. Muhasebe toplamina ASLA girmez. */
  | 'forecast'
  /** Gercek belge var, muhasebe onayi yok. Ayri sayilir, toplama girmez. */
  | 'pending_actual'
  /** Onayli gercek gelir/gider. Toplamin TEK icerigi. */
  | 'approved_actual'
  /** Itiraz edilmis: tutar tartismali. Toplama girmez, AYRI gosterilir. */
  | 'disputed'
  /** Ters kayda alinmis. Etkisiz. */
  | 'reversed'
  /** Reddedilmis. Toplamin tamamen disinda. */
  | 'rejected';

/**
 * `forecast` ile `approved_actual` ASLA ayni toplamda birlesmez.
 *
 * Faz 18'in tek pazarlik disi kurali bu. Tahmini gerceklesenle toplamak,
 * yonetime var olmayan bir kesinlik satmaktir.
 */
export function countsTowardAccountingTotal(recognition: RecognitionClass): boolean {
  return recognition === 'approved_actual';
}

/* ------------------------------------------------------------------ */
/* Servis kaydi                                                        */
/* ------------------------------------------------------------------ */

export function serviceRecordRecognition(
  approvalStatus: ServiceRecordApprovalStatus,
): RecognitionClass {
  if (approvalStatus === ServiceRecordApprovalStatus.approved) return 'approved_actual';
  if (approvalStatus === ServiceRecordApprovalStatus.rejected) return 'rejected';
  return 'pending_actual';
}

/**
 * "Maliyete GERCEKTEN giren servis kaydi" — TEK YERDE.
 *
 * Prisma'nin tipli `WhereInput`u kullaniliyor: `as any` yok, dolayisiyla alan
 * semadan kalkarsa derleme kirilir — sessizce filtresiz calismaz.
 */
export const EFFECTIVE_SERVICE_COST_WHERE = {
  approvalStatus: ServiceRecordApprovalStatus.approved,
} as const satisfies Prisma.ServiceRecordWhereInput;

/** Onay bekleyenler: toplama GIRMEZ ama gorunur kalir. */
export const PENDING_SERVICE_COST_WHERE = {
  approvalStatus: ServiceRecordApprovalStatus.pending,
} as const satisfies Prisma.ServiceRecordWhereInput;

export function effectiveServiceCostWhere(
  extra: Prisma.ServiceRecordWhereInput = {},
): Prisma.ServiceRecordWhereInput {
  return { ...extra, ...EFFECTIVE_SERVICE_COST_WHERE };
}

export function pendingServiceCostWhere(
  extra: Prisma.ServiceRecordWhereInput = {},
): Prisma.ServiceRecordWhereInput {
  return { ...extra, ...PENDING_SERVICE_COST_WHERE };
}

/* ------------------------------------------------------------------ */
/* Ceza                                                                */
/* ------------------------------------------------------------------ */

/**
 * `FineStatus` OPERASYONEL bir akis (kime atandi, bildirildi mi). Muhasebe
 * anlamini tasiyan tek gecisi `widerspruch`: itiraz edilmis bir ceza, tutari
 * hukuken TARTISMALI olan bir cezadir. Bugune kadar gercek maliyete
 * giriyordu — yani filo, geri alinabilecek bir tutari kesinlesmis gider gibi
 * gosteriyordu.
 *
 * Itiraz edilen ceza SILINMIYOR ve gizlenmiyor: "ihtilafli" olarak AYRI
 * raporlaniyor. Sifirlamak, itirazin kaybedilmesi halinde odenecek tutari
 * gorunmez yapardi.
 */
export function fineRecognition(status: FineStatus): RecognitionClass {
  return status === FineStatus.widerspruch ? 'disputed' : 'approved_actual';
}

export const EFFECTIVE_FINE_COST_WHERE = {
  status: { not: FineStatus.widerspruch },
} as const satisfies Prisma.FineWhereInput;

export const DISPUTED_FINE_WHERE = {
  status: FineStatus.widerspruch,
} as const satisfies Prisma.FineWhereInput;

export function effectiveFineCostWhere(
  extra: Prisma.FineWhereInput = {},
): Prisma.FineWhereInput {
  return { ...extra, ...EFFECTIVE_FINE_COST_WHERE };
}

export function disputedFineWhere(extra: Prisma.FineWhereInput = {}): Prisma.FineWhereInput {
  return { ...extra, ...DISPUTED_FINE_WHERE };
}

/* ------------------------------------------------------------------ */
/* Gelir                                                               */
/* ------------------------------------------------------------------ */

/**
 * `Assignment.expectedDailyRevenue` — adi zaten "expected".
 *
 * Bu bir PLANLAMA TAHMINIDIR: gorev acilirken yazilan gunluk fiyat. Fatura
 * kesilene kadar hicbir hukuki kayit olusmaz, tutar degisebilir, gorev
 * iptal olabilir. Maliyet panosu bunu `revenue` olarak topluyordu; yani
 * tahmin ile gerceklesen ayni kartta birlesiyordu.
 */
export function assignmentRevenueRecognition(): RecognitionClass {
  return 'forecast';
}

/**
 * GERCEK gelir yalnizca faturadan dogar.
 *
 * `draft` DISARIDA: numarasi verilmemis bir taslak henuz kayit degil.
 * `finalized` ICERIDE ve bu sinir bilincli: fatura numarasi verildigi anda
 * belge hukuken olusmustur; tahsil edilmemis olmasi onu gelir olmaktan
 * cikarmaz. `cancelled` DISARIDA — iptal edilmis fatura etkisizdir.
 */
export const ACTUAL_REVENUE_INVOICE_STATUSES: OutgoingInvoiceStatus[] = [
  OutgoingInvoiceStatus.finalized,
  OutgoingInvoiceStatus.sent,
  OutgoingInvoiceStatus.partially_paid,
  OutgoingInvoiceStatus.paid,
  OutgoingInvoiceStatus.overdue,
];

export function invoiceRevenueRecognition(
  status: OutgoingInvoiceStatus,
  kind: InvoiceKind,
): RecognitionClass {
  if (status === OutgoingInvoiceStatus.cancelled) return 'reversed';
  if (status === OutgoingInvoiceStatus.draft) return 'pending_actual';
  if (kind !== InvoiceKind.invoice) return 'reversed';
  return 'approved_actual';
}

/**
 * Alacak dekontu ve iptal faturasi tutari EKSI isaretle sayilir.
 *
 * Model tutarlari POZITIF tasiyor (`netCents` isaretsiz bir Int); belgenin
 * TURU yonu belirliyor. Isareti burada bir kez vermek, her raporda ayri
 * hatirlanmasi gereken bir kural olmasindan iyidir.
 */
export function invoiceRevenueSign(kind: InvoiceKind): 1 | -1 {
  return kind === InvoiceKind.invoice ? 1 : -1;
}
