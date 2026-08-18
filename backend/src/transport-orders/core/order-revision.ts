/**
 * SIPARIS REVIZYONLARI (Faz 15) — SAF mantik.
 *
 * APPEND-ONLY: her olusturma/degisiklik degismez bir anlik goruntu birakir ve
 * ESKI REVIZYON HICBIR ZAMAN YENIDEN YAZILMAZ. "Musteri ne zaman ne istedi"
 * sorusunun cevabi altı ay sonra da elimizde olmali.
 *
 * Faz 13'un cikarim sozlesmesiyle AYNI DISIPLIN: ureten tarafin ciktisi ile
 * insanin karari ayri kayitlarda durur.
 */

/** Karsilastirilabilir siparis alanlari. Turetilmis alanlar BURAYA GIRMEZ. */
export interface OrderSnapshot {
  companyId: string;
  orderNumber: string;
  externalReference: string | null;
  orderDate: string;
  currency: string;
  /** Decimal STRING olarak: float yuvarlamasi bir sozlesme tutarini degistirmemeli. */
  contractedRevenue: string | null;
  billingMode: string;
  notes: string | null;
  consignments: ConsignmentSnapshot[];
}

export interface ConsignmentSnapshot {
  sequence: number;
  pickupAddress: string;
  pickupWindowStart: string | null;
  pickupWindowEnd: string | null;
  deliveryAddress: string;
  deliveryWindowStart: string | null;
  deliveryWindowEnd: string | null;
  cargoDescription: string;
  quantity: string | null;
  unit: string | null;
  weightKg: string | null;
  volumeM3: string | null;
  palletCount: number | null;
  adrStatus: string;
  temperatureMinC: string | null;
  temperatureMaxC: string | null;
  shipperReference: string | null;
  consigneeReference: string | null;
}

/** Tek alanin eski/yeni degeri. Kullanici karsilastirmasi bunun uzerinden. */
export interface FieldChange {
  field: string;
  before: string | number | boolean | null;
  after: string | number | boolean | null;
}

const ORDER_FIELDS: Array<keyof Omit<OrderSnapshot, 'consignments'>> = [
  'companyId',
  'orderNumber',
  'externalReference',
  'orderDate',
  'currency',
  'contractedRevenue',
  'billingMode',
  'notes',
];

const CONSIGNMENT_FIELDS: Array<keyof ConsignmentSnapshot> = [
  'pickupAddress',
  'pickupWindowStart',
  'pickupWindowEnd',
  'deliveryAddress',
  'deliveryWindowStart',
  'deliveryWindowEnd',
  'cargoDescription',
  'quantity',
  'unit',
  'weightKg',
  'volumeM3',
  'palletCount',
  'adrStatus',
  'temperatureMinC',
  'temperatureMaxC',
  'shipperReference',
  'consigneeReference',
];

/**
 * Iki anlik goruntuyu karsilastirir.
 *
 * ARAYUZ IKI SNAPSHOT'I DIFF'LEMEZ: fark burada, sunucuda hesaplanip
 * revizyonun icine yaziliyor. Aksi halde her ekran kendi karsilastirma
 * mantigini yazardi ve ikisi ayrisirdi.
 *
 * Kalem EKLEME/SILME de bir degisikliktir ve `consignments[n]` yoluyla
 * gorunur — sessizce kaybolan bir kalem, kaybolan bir yuktur.
 */
export function diffSnapshots(before: OrderSnapshot, after: OrderSnapshot): FieldChange[] {
  const changes: FieldChange[] = [];

  for (const field of ORDER_FIELDS) {
    if (before[field] !== after[field]) {
      changes.push({ field, before: before[field], after: after[field] });
    }
  }

  const maxLength = Math.max(before.consignments.length, after.consignments.length);
  for (let index = 0; index < maxLength; index += 1) {
    const left = before.consignments[index];
    const right = after.consignments[index];

    if (!left) {
      changes.push({ field: `consignments[${index}]`, before: null, after: 'added' });
      continue;
    }
    if (!right) {
      changes.push({ field: `consignments[${index}]`, before: 'present', after: null });
      continue;
    }
    for (const field of CONSIGNMENT_FIELDS) {
      if (left[field] !== right[field]) {
        changes.push({
          field: `consignments[${index}].${field}`,
          before: left[field],
          after: right[field],
        });
      }
    }
  }

  return changes;
}

/**
 * Sonraki revizyon numarasi.
 *
 * DETERMINISTIK ARTAR ve siparis kapsaminda tekildir. Tekillik uygulamada
 * degil VERITABANINDA (`@@unique([transportOrderId, revisionNumber])`):
 * eszamanli iki revizyon ayni numarayi alamaz ve yarisi kaybeden istek
 * cakisma hatasi alir.
 */
export function nextRevisionNumber(currentRevision: number): number {
  return currentRevision + 1;
}

export type RevisionStatus = 'applied' | 'pending_review' | 'rejected';

/**
 * Yeni revizyonun hangi durumda acilacagi.
 *
 * Draft'ta degisiklik DOGRUDAN uygulanir — musteri henuz bir sey onaylamadi.
 * Onaylanmis sipariste degisiklik once ONERI olur ve ana kayit DEGISMEZ.
 */
export function revisionStatusFor(orderStatus: 'draft' | 'confirmed' | 'cancelled'): RevisionStatus {
  return orderStatus === 'confirmed' ? 'pending_review' : 'applied';
}

/** Anlamli bir degisiklik var mi — bos revizyon yazilmaz. */
export function hasMeaningfulChange(changes: FieldChange[]): boolean {
  return changes.length > 0;
}

/**
 * AJAN CIKTISI KAPISI (Faz 16 icin bugunden kilitleniyor).
 *
 * Bir revizyon `manual` DISI bir kaynaktan geliyorsa `applied` OLARAK
 * ACILAMAZ — her zaman `pending_review` olur. Faz 16'da e-posta/ajan kaynagi
 * eklendiginde bu kural zaten yerinde olacak ve "ajan siparisi dogrudan
 * guncelledi" diye bir durum hic olusmayacak.
 */
export function assertAgentCannotApplyDirectly(
  source: string,
  status: RevisionStatus,
): void {
  if (source !== 'manual' && status === 'applied') {
    throw new Error('non_manual_revision_must_be_pending_review');
  }
}
