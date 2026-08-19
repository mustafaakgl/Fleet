import { SchemaValidationError } from './schema-validation';

/**
 * BELGE TURU REGISTRY'si (Faz 14).
 *
 * NEDEN PRISMA ENUM DEGIL: belge turleri BUYUYECEK bir kume. Her yeni tur icin
 * migration almak, turu veritabani semasina kilitler ve "once migration, sonra
 * kod" sirasini her kucuk eklemede zorunlu kilar. Daha kotusu: enum'a eklenen
 * bir deger GERI ALINAMAZ ve eski satirlar icin anlami belirsiz kalir.
 *
 * NEDEN SERBEST METIN DE DEGIL: `typeKey` veritabaninda String, ama SERBEST
 * DEGIL — yazilmadan once bu registry'ye karsi dogrulaniyor. Belgeden,
 * PDF metadata'sindan ya da connector yanitindan gelen bir metin YENI BIR TUR
 * ACAMAZ; en fazla burada tanimli bir turu secebilir.
 *
 * NEDEN SURUMLU: `service_invoice@v1` ile `service_invoice@v2` ayni belgenin
 * FARKLI sozlesmeleridir. Surumu anahtarin icine koymak, eski kayitlarin hangi
 * sozlesmeyle uretildigini kaydin KENDISINDE tutar; ayri bir surum sutunu
 * unutulabilir, anahtar unutulamaz.
 */

/**
 * Islenen turler. CMR/POD ve surucu saglik belgesi HALA YOK.
 *
 * `transport_order@v1` FAZ 16'DA EKLENDI: musteriden gelen tasima emri.
 * Digerlerinden ONEMLI BIR FARKI VAR — bir araca baglanmaz. Tasima emri
 * gelirken hangi aracin gidecegi HENUZ BILINMEZ ve bir arac uydurmak,
 * planlanmamis bir siparisi planlanmis gostermek olurdu.
 */
export const DOCUMENT_TYPE_KEYS = [
  'service_invoice@v1',
  'transport_order@v1',
  'vehicle_inspection@v1',
  'vehicle_insurance@v1',
  'traffic_fine@v1',
  'fuel_receipt@v1',
  'unknown@v1',
] as const;
export type DocumentTypeKey = (typeof DOCUMENT_TYPE_KEYS)[number];

/**
 * HEDEF MODULLER.
 *
 * Her hedef MEVCUT bir canonical surece isaret ediyor. Paralel bir "belge
 * gideri" ya da "belge cezasi" modeli YOK: bu registry yalnizca hangi var olan
 * kuyruga devredilecegini soyluyor.
 */
export const DOCUMENT_DESTINATIONS = [
  /** Faz 13'un servis faturasi cikarim akisi. */
  'ordivan.service_invoice',
  /** Mevcut yakit fisi MUHASEBE incelemesi. Onaylanmis gider DEGIL. */
  'fleet.fuel_entry_review',
  /** Mevcut arac belgesi + (tarih guvenilirse) hatirlatma taslagi. */
  'vehicle.document',
  /** Mevcut Fine sureci. */
  'fine.record',
  /**
   * Faz 16 — e-posta/PDF siparis ajani.
   *
   * HEDEF BIR KAYIT DEGIL, BIR INCELEME: bu hedefe yonlendirilen belge
   * dogrudan `TransportOrder` URETMEZ. Gelen kutusu incelemesi acilir ve
   * canonical taslak ancak insan onayindan sonra Faz 15 servisinden gecerek
   * olusur.
   */
  'ordivan.transport_order',
] as const;
export type DocumentDestination = (typeof DOCUMENT_DESTINATIONS)[number];

/** Muayene alt turu. `unknown` "sorun yok" DEMEK DEGILDIR. */
export const INSPECTION_SUBTYPES = ['tuv', 'sp', 'unknown'] as const;
export type InspectionSubtype = (typeof INSPECTION_SUBTYPES)[number];

export interface DocumentTypeDefinition {
  typeKey: DocumentTypeKey;
  /** Surumsuz aile adi — arayuz gruplamasi ve i18n anahtari icin. */
  family: string;
  version: number;
  /**
   * Onaylandiginda belgenin devredilecegi kuyruk. `null` ise hedef YOK:
   * kullanici tur/hedef secmeden kayit olusturulmaz.
   */
  destination: DocumentDestination | null;
  /**
   * Bu hedefi tetikleyebilecek roller — MEVCUT domain yetkilerinden turetildi,
   * genisletilmedi. Bos liste asla "herkes" demek degildir; `unknown` turunun
   * hedefi olmadigi icin listesi de bostur.
   */
  allowedRoles: readonly string[];
  /** Bu tur bir araca baglanmak ZORUNDA mi. */
  requiresVehicle: boolean;
  /** Alt tur kullaniyor mu (yalnizca muayene). */
  subtypes: readonly InspectionSubtype[] | null;
}

/**
 * ROL TURETIMI.
 *
 * Roller BURADA ICAT EDILMIYOR, hedef modulun kendi controller'indaki
 * kisittan kopyalaniyor:
 *   - servis faturasi  → `AUTOMATION_ROLES`        (admin, boss)
 *   - yakit fisi       → `FINANCIAL_ROLES`         (admin, boss, accounting)
 *   - arac belgesi     → `OPERATIONAL_WRITE_ROLES` (admin, boss, office)
 *   - trafik cezasi    → `OPERATIONAL_WRITE_ROLES` (admin, boss, office)
 *
 * Ceza icin muhasebe DISARIDA: `fines.controller` yazma uclarinda
 * `@RequiresWrite()` kullaniyor ve o da varsayilan olarak yazma rollerini
 * istiyor. Gelen kutusu bu kisiti GEVSETEMEZ — gevsetseydi, belge yukleyerek
 * ceza olusturmak controller'in guard'ini atlamanin yolu olurdu.
 */
const AUTOMATION = ['admin', 'boss'] as const;
const FINANCIAL = ['admin', 'boss', 'accounting'] as const;
const OPERATIONAL_WRITE = ['admin', 'boss', 'office'] as const;

export const DOCUMENT_TYPE_REGISTRY: Record<DocumentTypeKey, DocumentTypeDefinition> = {
  'service_invoice@v1': {
    typeKey: 'service_invoice@v1',
    family: 'service_invoice',
    version: 1,
    destination: 'ordivan.service_invoice',
    allowedRoles: AUTOMATION,
    requiresVehicle: true,
    subtypes: null,
  },
  'vehicle_inspection@v1': {
    typeKey: 'vehicle_inspection@v1',
    family: 'vehicle_inspection',
    version: 1,
    destination: 'vehicle.document',
    allowedRoles: OPERATIONAL_WRITE,
    requiresVehicle: true,
    subtypes: INSPECTION_SUBTYPES,
  },
  'vehicle_insurance@v1': {
    typeKey: 'vehicle_insurance@v1',
    family: 'vehicle_insurance',
    version: 1,
    destination: 'vehicle.document',
    allowedRoles: OPERATIONAL_WRITE,
    requiresVehicle: true,
    subtypes: null,
  },
  'traffic_fine@v1': {
    typeKey: 'traffic_fine@v1',
    family: 'traffic_fine',
    version: 1,
    destination: 'fine.record',
    allowedRoles: OPERATIONAL_WRITE,
    requiresVehicle: true,
    subtypes: null,
  },
  'transport_order@v1': {
    typeKey: 'transport_order@v1',
    family: 'transport_order',
    version: 1,
    destination: 'ordivan.transport_order',
    /**
     * ROL YINE TURETILDI: `transport-orders.controller` yazma uclarinda
     * `@RequiresWrite()` kullaniyor, o da `OPERATIONAL_WRITE_ROLES` demek.
     * Gelen kutusu bu kisiti GEVSETEMEZ — gevsetseydi, bir e-posta yollayarak
     * siparis acmak controller'in guard'ini atlamanin yolu olurdu.
     *
     * MUHASEBE BURADA YOK: fiyati o inceler ama operasyon plani acamaz. Bu,
     * `transport-orders` controller'inda ZATEN boyle.
     */
    allowedRoles: OPERATIONAL_WRITE,
    /**
     * ARAC GEREKMEZ ve bu bilincli: siparis geldiginde arac secilmemistir.
     * `requiresVehicle: true` yazsaydik, gelen her siparis "arac eksik" diye
     * `needs_domain_review`da beklerdi — oysa arac eksikligi bu turde bir
     * eksiklik DEGIL, normal durum.
     */
    requiresVehicle: false,
    subtypes: null,
  },
  'fuel_receipt@v1': {
    typeKey: 'fuel_receipt@v1',
    family: 'fuel_receipt',
    version: 1,
    destination: 'fleet.fuel_entry_review',
    allowedRoles: FINANCIAL,
    requiresVehicle: true,
    subtypes: null,
  },
  'unknown@v1': {
    typeKey: 'unknown@v1',
    family: 'unknown',
    version: 1,
    // HEDEF YOK. Kullanici tur secmeden hicbir canonical kayit olusmaz.
    destination: null,
    allowedRoles: [],
    requiresVehicle: false,
    subtypes: null,
  },
};

export function isKnownDocumentTypeKey(value: unknown): value is DocumentTypeKey {
  return typeof value === 'string' && (DOCUMENT_TYPE_KEYS as readonly string[]).includes(value);
}

/**
 * Anahtari dogrular ve tanimini doner.
 *
 * Taninmayan anahtar SESSIZCE `unknown`a DUSMEZ: bir yazim hatasi ya da
 * modelin uydurdugu bir tur, "bilmiyorum" ile ayni sey degildir. Biri veri
 * hatasi, digeri gecerli bir sonuc.
 */
export function resolveDocumentType(typeKey: unknown): DocumentTypeDefinition {
  if (!isKnownDocumentTypeKey(typeKey)) {
    throw new SchemaValidationError('unknown_document_type_key');
  }
  return DOCUMENT_TYPE_REGISTRY[typeKey];
}

export function isKnownInspectionSubtype(value: unknown): value is InspectionSubtype {
  return typeof value === 'string' && (INSPECTION_SUBTYPES as readonly string[]).includes(value);
}

/** Bir turu bu rolun yonlendirip yonlendiremeyecegi. */
export function canRoleRoute(typeKey: DocumentTypeKey, role: string | null | undefined): boolean {
  const definition = DOCUMENT_TYPE_REGISTRY[typeKey];
  if (definition.destination === null) {
    return false;
  }
  return definition.allowedRoles.includes(role ?? '');
}

/**
 * MEVCUT SUREC ICINDEKI DURUM.
 *
 * `needs_domain_review`: belge dogru siniflandirildi ama canonical modele
 * GUVENLI bir esleme yapilamiyor (ornegin yakit fisi icin surucu bilinmiyor).
 * Bu durumda PARALEL MODEL UYDURULMAZ — belge burada bekler ve raporda
 * gorunur.
 */
export const INTAKE_DOCUMENT_STATUSES = [
  'classifying',
  'needs_review',
  'needs_domain_review',
  'routed',
  'rejected',
  'failed',
] as const;
export type IntakeDocumentStatus = (typeof INTAKE_DOCUMENT_STATUSES)[number];
