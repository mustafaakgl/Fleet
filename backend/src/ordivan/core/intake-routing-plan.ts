import {
  DOCUMENT_TYPE_REGISTRY,
  canRoleRoute,
  isKnownDocumentTypeKey,
  type DocumentDestination,
  type DocumentTypeKey,
} from './document-type-registry';
import type { AutomationCheckResult } from './automation-check.contract';

/**
 * "ONAYLANDIGINDA NE OLACAK?" (Faz 14) — SAF mantik.
 *
 * NEDEN AYRI BIR MODUL: kullaniciya gosterilen ozet ile sunucunun uyguladigi
 * kural AYNI KAYNAKTAN gelmeli. Ekranda "yakit fisi muhasebe incelemesine
 * gidecek" yazip sunucuda onaylanmis gider olusturmak, guvenin en hizli
 * kaybedildigi yerdir.
 *
 * BELGE SINIFLANDIRMA ONAYI, FINANSAL YA DA DOMAIN ONAYI DEGILDIR. Bu plan
 * yalnizca belgenin HANGI KUYRUGA devredilecegini soyler; hedefin kendi
 * yasam dongusu ve guard'lari yerinde kalir.
 */

export type RoutingBlockReason =
  | 'type_unknown'
  | 'role_not_allowed'
  | 'vehicle_required'
  | 'vehicle_match_failed'
  | 'driver_required'
  | 'already_routed';

export interface RoutingPlan {
  typeKey: DocumentTypeKey;
  destination: DocumentDestination | null;
  /** Onay sonucu olusacak CANONICAL kayit turu. */
  createsEntityType: string | null;
  /**
   * Kayit dogrudan ONAYLANMIS mi olusuyor, yoksa hedefin KENDI incelemesine mi
   * giriyor. Yakit fisinde daima `false` — muhasebe onayini atlamiyoruz.
   */
  entersOwnReviewQueue: boolean;
  /** Yan etki: kullanicinin acikca onaylamasi halinde olusacak hatirlatma. */
  offersReminder: boolean;
  /** Hatirlatma ONERILEBILIR mi — tarih guvenilir degilse hayir. */
  reminderAvailable: boolean;
  canRoute: boolean;
  blockedBy: RoutingBlockReason[];
}

/** Hedef basina olusan canonical kayit. PARALEL MODEL YOK. */
const DESTINATION_ENTITY: Record<DocumentDestination, string> = {
  'ordivan.service_invoice': 'AutomationJob',
  'fleet.fuel_entry_review': 'FleetFuelEntry',
  'vehicle.document': 'Document',
  'fine.record': 'Fine',
};

/**
 * Hedefin KENDI muhasebe/domain incelemesi var mi.
 *
 * `true` olan hedeflerde belge YALNIZ o kuyruga devrediliyor; gelen kutusundaki
 * onay o incelemenin YERINE GECMIYOR.
 */
const HAS_OWN_REVIEW: Record<DocumentDestination, boolean> = {
  // Faz 13'un kendi oneri/onay dongusune giriyor.
  'ordivan.service_invoice': true,
  // Muhasebe onayi olmadan maliyete GIRMEZ.
  'fleet.fuel_entry_review': true,
  'vehicle.document': false,
  'fine.record': false,
};

export interface RoutingContext {
  typeKey: string;
  role: string | null | undefined;
  vehicleId: string | null;
  vehicleMatchStatus: 'verified' | 'failed' | 'unknown';
  /** Yakit fisi icin surucu — canonical kayit surucusuz acilamaz. */
  driverId?: string | null;
  checks: AutomationCheckResult[];
  alreadyRouted: boolean;
}

/** Muayene/sigorta hatirlatmasi icin tarih GUVENILIR mi. */
export function hasReliableDate(checks: AutomationCheckResult[]): boolean {
  return checks.some((check) => check.code === 'document_date_present' && check.status === 'verified');
}

export function buildRoutingPlan(context: RoutingContext): RoutingPlan {
  const blockedBy: RoutingBlockReason[] = [];

  if (!isKnownDocumentTypeKey(context.typeKey) || context.typeKey === 'unknown@v1') {
    // TUR SECILMEDEN KAYIT OLUSMAZ.
    return {
      typeKey: 'unknown@v1',
      destination: null,
      createsEntityType: null,
      entersOwnReviewQueue: false,
      offersReminder: false,
      reminderAvailable: false,
      canRoute: false,
      blockedBy: ['type_unknown'],
    };
  }

  const typeKey = context.typeKey;
  const definition = DOCUMENT_TYPE_REGISTRY[typeKey];
  const destination = definition.destination;

  if (!canRoleRoute(typeKey, context.role)) {
    blockedBy.push('role_not_allowed');
  }

  if (definition.requiresVehicle && !context.vehicleId) {
    blockedBy.push('vehicle_required');
  }
  // CELISKILI belge: VIN bir araci, plaka baskasini gosteriyor. Kullanici
  // aciklikla bir arac secene kadar yonlendirilemez.
  if (context.vehicleMatchStatus === 'failed' && !context.vehicleId) {
    blockedBy.push('vehicle_match_failed');
  }

  // Yakit fisi canonical kaydi SURUCUSUZ acilamaz (`FleetFuelEntry.driverId`
  // NOT NULL). Surucu belirlenemiyorsa PARALEL MODEL UYDURULMAZ; belge
  // `needs_domain_review`da bekler.
  if (destination === 'fleet.fuel_entry_review' && !context.driverId) {
    blockedBy.push('driver_required');
  }

  if (context.alreadyRouted) {
    blockedBy.push('already_routed');
  }

  const reminderAvailable =
    (typeKey === 'vehicle_inspection@v1' || typeKey === 'vehicle_insurance@v1') &&
    hasReliableDate(context.checks);

  return {
    typeKey,
    destination,
    createsEntityType: destination ? DESTINATION_ENTITY[destination] : null,
    entersOwnReviewQueue: destination ? HAS_OWN_REVIEW[destination] : false,
    offersReminder: reminderAvailable,
    reminderAvailable,
    canRoute: blockedBy.length === 0,
    blockedBy,
  };
}
