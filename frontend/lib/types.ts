// ─── Auth ───────────────────────────────────────────────────────────────────

export type Role = 'admin' | 'boss' | 'accounting' | 'office' | 'driver' | 'customer';

export type Department = 'executive' | 'fleet' | 'payroll' | 'accident' | 'hr' | 'driver_ops';

export interface CustomerCompanySummary {
  id: string;
  name: string;
}

export interface AuthUser {
  id: string;
  name?: string;
  email: string;
  role: Role;
  department?: Department;
  language?: string;
  fleet_ops?: boolean;
  companyIds?: string[];
  companyId?: string | null;
  companies?: CustomerCompanySummary[];
}

export interface AuthResponse {
  accessToken?: string;
  access_token?: string;
  refreshToken?: string;
  refresh_token?: string;
  expires_in?: number;
  mfa_required?: boolean;
  mfa_token?: string;
  user?: AuthUser;
}

export interface MfaStatus {
  mfa_enabled: boolean;
  mfa_setup_pending: boolean;
}

export interface MfaSetupResponse {
  secret: string;
  otpauth_url: string;
}

// ─── Customer Portal ────────────────────────────────────────────────────────

export type CustomerAssignmentStatus =
  | 'planned'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface CustomerDashboardStats {
  activeTransports: number;
  inProgress: number;
  completedToday: number;
  upcoming: number;
  pendingProofs: number;
}

export interface CustomerAssignment {
  id: string;
  status: CustomerAssignmentStatus;
  workDate: string;
  startTime: string;
  endTime: string;
  cargoName: string;
  cargoOwner: string;
  pickupAddress: string;
  deliveryAddress: string;
  routeName: string | null;
  companyName: string;
  vehiclePlateNumber: string;
  driverDisplayName: string;
  notes?: string;
  proofCount?: number;
  proofRequired?: boolean;
  proofPending?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedCustomerAssignments {
  data: CustomerAssignment[];
  page: number;
  limit: number;
  total: number;
}

export interface CustomerPortalMe {
  user: AuthUser;
  companies: CustomerCompanySummary[];
  primaryCompanyId: string | null;
}

// ─── Driver ─────────────────────────────────────────────────────────────────

export type DriverStatus = 'active' | 'inactive' | 'on_leave' | 'sick' | 'terminated';
export type RiskLevel = 'green' | 'yellow' | 'red';

export interface Driver {
  id: string;
  employee_number?: string;
  first_name: string;
  last_name: string;
  accident_count: number;
  current_vehicle_plate?: string | null;
  current_company_name?: string | null;
  /** Sürücünün bağlı olduğu müşteri firma (Einsatzplan'daki "Abteilung"). */
  company_id?: string | null;
  company_name?: string | null;
  email?: string;
  phone?: string;
  license_number?: string;
  license_expiry_date?: string;
  passport_number?: string;
  passport_expiry_date?: string;
  date_of_birth?: string | null;
  home_address_street?: string | null;
  home_address_zip_code?: string | null;
  home_address_city?: string | null;
  home_address_country?: string | null;
  vacation_entitlement_days?: number;
  vacation_carry_over_days?: number;
  status: DriverStatus;
  risk_level: RiskLevel;
  license_compliance_badge?: LicenseComplianceBadge | null;
  created_at?: string;
  updated_at?: string;
}

export type LicenseComplianceBadge = 'green' | 'yellow' | 'red';

export interface DriverLicenseCompliance {
  driver_id: string;
  badge: LicenseComplianceBadge;
  license_id?: string | null;
  license_number?: string | null;
  classes?: string[];
  expires_at?: string | null;
  next_check_due_at?: string | null;
  latest_check?: {
    id: string;
    status: string;
    check_type: string;
    check_date: string;
    verified_at?: string | null;
  } | null;
  has_pending_check: boolean;
  blocks_assignment: boolean;
}

export interface DriverDetail extends Driver {
  license_compliance?: DriverLicenseCompliance;
  recent_assignments: Assignment[];
  documents: Document[];
}

export type EquipmentIssuanceStatus =
  | 'pending_signature'
  | 'signed'
  | 'manual_uploaded'
  | 'approved'
  | 'cancelled';

export interface EquipmentIssuanceRecord {
  id: string;
  driverId: string;
  issuedById: string;
  title: string;
  items: Array<{
    name: string;
    quantity: number;
    notes?: string;
  }>;
  formDocumentPath: string;
  formDownloadUrl: string;
  status: EquipmentIssuanceStatus;
  issuedAt: string;
  signedAt?: string | null;
  signatureMethod?: string | null;
  signatureImagePath?: string | null;
  finalDocumentId?: string | null;
  approvedById?: string | null;
  approvedAt?: string | null;
  cancelledAt?: string | null;
  clientMeta?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  driver?: {
    id: string;
    firstName: string;
    lastName: string;
    userId?: string | null;
  };
  issuedBy?: { id: string; fullName: string; email: string };
  approvedBy?: { id: string; fullName: string; email: string } | null;
  finalDocument?: {
    id: string;
    fileName: string;
    fileUrl?: string | null;
    download_url?: string | null;
    documentType: string;
    createdAt: string;
  } | null;
}

export interface PaginatedDrivers {
  total: number;
  page: number;
  limit: number;
  data: Driver[];
}

// ─── Vehicle ─────────────────────────────────────────────────────────────────

export type VehicleStatus = 'active' | 'maintenance' | 'broken' | 'inactive';

export interface Vehicle {
  id: string;
  plate_number: string;
  brand: string;
  model: string;
  vin?: string;
  internal_code?: string;
  year?: number;
  status: VehicleStatus;
  tuv_expiry_date?: string;
  sp_expiry_date?: string;
  insurance_expiry_date?: string;
  registration_expiry_date?: string;
  current_driver?: Pick<Driver, 'id' | 'first_name' | 'last_name'> | null;
  photo_url?: string;
  /**
   * Toplam kullanilabilir depo hacmi (litre). `null` = kayitli degil ve
   * telematik kontrolunun miktar kurallari calismaz.
   */
  fuel_tank_capacity_liters?: number | null;
  created_at?: string;
}

export interface VehicleDetail extends Vehicle {
  recent_assignments: Assignment[];
  documents: Document[];
}

export interface PaginatedVehicles {
  total: number;
  page: number;
  limit: number;
  data: Vehicle[];
}

// ─── Devices ────────────────────────────────────────────────────────────────

export type DeviceModel = 'FMC130' | 'FMC650' | 'FMC003';
export type DeviceStatus = 'online' | 'offline' | 'never';

export interface DeviceRow {
  id: string;
  imei: string;
  model: DeviceModel;
  vehicleId: string | null;
  plateNumber: string | null;
  lastSeenAt: string | null;
  status: DeviceStatus;
}

export interface CreateDevicePayload {
  imei: string;
  model: DeviceModel;
  vehicleId?: string;
}

export interface UpdateDevicePayload {
  model?: DeviceModel;
  vehicleId?: string | null;
}

// ─── Company ─────────────────────────────────────────────────────────────────

export interface Company {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  contact_person?: string;
  default_daily_revenue?: number | null;
  notes?: string;
  active_assignments_count: number;
  current_drivers_count?: number;
  current_vehicles_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface CompanyDetail extends Company {
  current_drivers: Array<{ id: string; first_name: string; last_name: string }>;
  current_vehicles: Array<{ id: string; plate_number: string }>;
}

export interface PaginatedCompanies {
  total: number;
  page: number;
  limit: number;
  data: Company[];
}

// ─── Assignment ───────────────────────────────────────────────────────────────

export type AssignmentStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled';

export interface Assignment {
  id: string;
  driver: { id: string; name: string };
  vehicle: { id: string; plate_number: string };
  company_id?: string;
  company_name: string;
  work_date: string;
  start_time: string | null;
  end_time: string | null;
  route_name?: string;
  expected_daily_revenue?: number | null;
  company_default_daily_revenue?: number | null;
  cargo_name?: string;
  cargo_owner?: string;
  pickup_address?: string;
  delivery_address?: string;
  notes?: string;
  status: AssignmentStatus;
}

export type AssignmentWritePayload = {
  driver_id?: string;
  vehicle_id?: string;
  vehicle_plate?: string;
  company_id?: string;
  company_name?: string;
  cargo_name?: string;
  cargo_owner?: string;
  pickup_address?: string;
  delivery_address?: string;
  /**
   * Adres oneri listesinden secildiyse dogrulanmis Location kimligi. Doluysa
   * sunucu adresi yeniden aramaz. Elle yazmada bos kalir.
   */
  pickup_location_id?: string;
  delivery_location_id?: string;
  work_date?: string;
  start_time?: string;
  end_time?: string;
  route_name?: string;
  expected_daily_revenue?: number;
  notes?: string;
  acknowledge_license_compliance_warning?: boolean;
};

export interface LicenseCheck {
  id: string;
  driver_id: string;
  driver_name: string;
  employee_number?: string;
  driver_license_id?: string | null;
  check_date: string;
  check_type: 'initial' | 'periodic';
  status: 'pending' | 'approved' | 'rejected';
  verified_by?: { id: string; name: string; email: string } | null;
  verified_at?: string | null;
  rejection_reason?: string | null;
  notes?: string | null;
  due_at?: string | null;
  photo_metadata?: Record<string, unknown> | null;
  reference_license?: {
    id: string;
    license_number: string;
    classes: string[];
    expires_at: string;
    front_photo_url?: string | null;
    back_photo_url?: string | null;
  } | null;
  photos?: {
    front_url?: string | null;
    back_url?: string | null;
    selfie_url?: string | null;
  };
  created_at: string;
}

// ─── Fine management ─────────────────────────────────────────────────────────

export type FineViolationCategory = 'speed' | 'parking' | 'red_light' | 'distance' | 'other';
export type FineMatchType = 'auto' | 'manual' | 'unmatched';
export type FineStatus =
  | 'neu'
  | 'fahrer_zugeordnet'
  | 'fahrer_benachrichtigt'
  | 'bezahlt'
  | 'widerspruch'
  | 'abgeschlossen';

export interface FineMatchCandidate {
  driver_id: string;
  driver_name: string;
  employee_number: string;
  work_session_id: string;
  assignment_id: string | null;
  company_name: string | null;
  session_started_at: string;
  session_ended_at: string | null;
  assignment_start_time: string | null;
  assignment_end_time: string | null;
  match_score: number;
}

export interface FineMatchPreview {
  vehicle_id: string;
  violation_at: string;
  tolerance_minutes: number;
  candidates: FineMatchCandidate[];
  suggested: FineMatchCandidate | null;
  match_type: FineMatchType;
}

export interface FineStatusLog {
  id: string;
  from_status: FineStatus | null;
  to_status: FineStatus;
  changed_by_user_id?: string | null;
  changed_by_driver_id?: string | null;
  note?: string | null;
  created_at: string;
}

export interface VehicleCostRow {
  vehicle_id: string;
  plate_number: string;
  internal_code: string;
  brand: string;
  model: string;
  status: string;
  service_cost: number;
  service_count: number;
  fine_cost: number;
  fine_count: number;
  /** YALNIZCA onaylanmis yakit fisleri (Faz 7). */
  fuel_cost: number;
  fuel_count: number;
  total_cost: number;
  revenue: number;
  assignment_count: number;
  margin: number;
}

export interface VehicleCostsResponse {
  period_months: number;
  from: string;
  to: string;
  /** Toplamlarin cinsi — istemci tahmin etmiyor (Faz 7). */
  currency: string;
  /** Kiracinin TEMEL para birimi (Faz 7.1). Bicimleme bunu kullanir. */
  baseCurrency: string;
  /** Money sozlesmesi: tutarlar STRING — float muhasebe ekranina dusmesin. */
  totals: {
    fuel: { amount: string; currency: string };
    service: { amount: string; currency: string };
    fines: { amount: string; currency: string };
    total: { amount: string; currency: string };
  };
  /** Temel para birimi disindaki onaylanmis fisler — toplama KATILMADI. */
  unconvertedByCurrency: Array<{ currency: string; fuelAmount: string; entryCount: number }>;
  fleet: {
    service_cost: number;
    fine_cost: number;
    /** YALNIZCA onaylanmis yakit fisleri. Bekleyenler dahil DEGIL. */
    fuel_cost: number;
    total_cost: number;
    revenue: number;
    margin: number;
    avg_cost_per_vehicle: number;
  };
  vehicles: VehicleCostRow[];
  fuel: {
    /** Onay bekleyen fis SAYISI — tutari toplama dahil degil. */
    pending_count: number;
    /**
     * Base currency disindaki onaylanmis fisler. Toplama KATILMADILAR:
     * guvenilir FX altyapisi olmadan donusturmek kur uydurmak olurdu.
     */
    unconverted: Array<{ currency: string; amount: number; count: number }>;
  };
}

/**
 * Muhasebe yakit fisi incelemesi (Faz 7).
 *
 * Kaynak: backend/src/fleet/fuel-receipts/fuel-receipt-review.service.ts
 */
/** Ters kayit sebepleri (Faz 9) — backend enum'uyla BIREBIR. */
export const FUEL_REVERSAL_REASONS = [
  'duplicate',
  'incorrect_amount',
  'incorrect_vehicle',
  'incorrect_currency',
  'incorrect_date',
  'wrong_or_unreadable_document',
  'other',
] as const;
export type FuelReversalReasonCode = (typeof FUEL_REVERSAL_REASONS)[number];

/**
 * Muhasebe acisindan ETKILI durum.
 *
 * `workflowStatus` ham gercegi tasir (onay gercekten yasandi); bu alan ise
 * "su anda gecerli mi" sorusuna cevap verir. Ekranlar ROZET ve maliyet
 * aciklamasi icin BUNU okur.
 */
export type EffectiveAccountingStatus =
  | 'approved_effective'
  | 'reversed'
  | 'driver_review'
  | 'submitted'
  | 'rejected';

export interface FuelReceiptReversal {
  id: string;
  reasonCode: FuelReversalReasonCode;
  reason: string;
  reversedAt: string;
  reversedBy: { id: string; name: string } | null;
  replacementEntryId: string | null;
}

export interface FuelReceiptCorrectionOf {
  reversalId: string;
  originalEntryId: string;
  reversedAt: string;
}

export interface FuelReceiptQueueRow {
  id: string;
  workflowStatus: FuelEntryWorkflowStatus;
  vehicle: { id: string; plateNumber: string };
  driver: { id: string; name: string };
  stationName: string | null;
  purchasedAt: string;
  fuelProduct: FuelProductType | null;
  liters: number | null;
  /** YAKIT satirinin brut toplami — araca yazilacak tutar. */
  fuelGrossAmount: number | null;
  currency: string;
  submittedAt: string | null;
  waitingDays: number | null;
  compatibilityMismatch: boolean;
  duplicateSuspected: boolean;
  ocrProblem: boolean;
  effectiveAccountingStatus: EffectiveAccountingStatus;
  /** Bu satir bir ters kaydin duzeltilmis kopyasi mi. */
  isCorrection: boolean;
  /** Optimistic concurrency icin geri gonderilecek deger. */
  updatedAt: string;
}

export interface FuelReceiptQueueResponse {
  rows: FuelReceiptQueueRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  summary: { pendingCount: number; oldestWaitingDays: number | null };
}

/* ---------------------------------------------------------------------------
 * Ordivan otomasyonu ve connector (Faz 12)
 * ------------------------------------------------------------------------- */

export type OrdivanConnectorMode = 'disabled' | 'mock' | 'local';

export type ProtocolCompatibility =
  | 'ok'
  | 'connector_too_old'
  | 'connector_too_new'
  | 'unknown';

export interface OrdivanConnector {
  id: string;
  displayName: string;
  status: 'pending_enrollment' | 'active' | 'revoked';
  /** Turetilir, saklanmaz: heartbeat kesilince kendiliginden false olur. */
  online: boolean;
  lastHeartbeatAt: string | null;
  capabilities: string[];
  connectorVersion: string | null;
  protocolVersion: string | null;
  protocolCompatibility: ProtocolCompatibility;
  platform: string | null;
  architecture: string | null;
  /** Anahtarin yalnizca ilk birkac karakteri — ozet ya da anahtar DEGIL. */
  credentialPrefix: string | null;
  credentialIssuedAt: string | null;
  credentialRotatedAt: string | null;
  credentialRevokedAt: string | null;
  enrolledAt: string | null;
}

export interface OrdivanConnectorList {
  mode: OrdivanConnectorMode;
  protocol: { current: number; minimumSupported: number };
  connectors: OrdivanConnector[];
}

/** Uc durumlu kontrol — `unknown` ASLA "sorun yok" demek degildir. */
export interface AutomationCheck {
  code: string;
  status: 'verified' | 'failed' | 'unknown';
  messageKey: string;
  messageParams?: Record<string, string | number>;
  evidence?: Record<string, string | number | boolean | null>;
  dataAt?: string;
  unknownReason?: string;
}

export interface AutomationCheckSummary {
  total: number;
  verified: number;
  failed: number;
  unknown: number;
  allVerified: boolean;
  hasUnknown: boolean;
}

export type AutomationProposalStatus =
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'expired';

export type AutomationRejectionCategory =
  | 'incorrect_match'
  | 'incorrect_value'
  | 'duplicate'
  | 'insufficient_evidence'
  | 'unsafe_or_untrusted'
  | 'other';

export type AutomationCorrectionCategory =
  | 'accepted_as_is'
  | 'value_corrected'
  | 'field_added'
  | 'field_removed'
  | 'rejected_entirely';

export interface AutomationProposalRow {
  id: string;
  proposalType: string;
  status: AutomationProposalStatus;
  jobId: string;
  jobType: string;
  lowConfidenceFields: string[];
  checkSummary: AutomationCheckSummary;
  decision: 'approved' | 'rejected' | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationApprovalTask {
  id: string;
  sequence: number;
  status: 'open' | 'decided' | 'closed_expired';
  assignedRole: string | null;
  assignedUserId: string | null;
  openedAt: string | null;
  decision: 'approved' | 'rejected' | null;
  rejectionCategory: AutomationRejectionCategory | null;
  decidedAt: string | null;
  decisionNote: string | null;
  reviewDurationMs: number | null;
  changedFieldCount: number;
  criticalLowConfidenceVerified: boolean;
  decidedBy: { id: string; fullName: string } | null;
}

export interface AutomationProposalDetail {
  id: string;
  proposalType: string;
  schemaVersion: number;
  status: AutomationProposalStatus;
  payload: Record<string, unknown>;
  confidence: Record<string, number> | null;
  evidence: Record<string, unknown> | null;
  checks: AutomationCheck[];
  checkSummary: AutomationCheckSummary;
  lowConfidenceFields: string[];
  lowConfidenceThreshold: number;
  job: { id: string; jobType: string; schemaVersion: number };
  /** Denetlenebilir yetki izi: hangi connector, hangi arac setiyle. */
  agentRun: {
    id: string;
    attempt: number;
    toolset: string[];
    capabilities: string[];
    credentialScope: string[];
    connectorVersion: string | null;
    protocolVersion: string | null;
    modelVersion: string | null;
    promptVersion: string | null;
    connector: { id: string; displayName: string };
  } | null;
  approvalTasks: AutomationApprovalTask[];
  approvalTask: AutomationApprovalTask | null;
  /** Faz 13 — yetkili onizleme; ham depolama yolu YOK. */
  document?: {
    id: string;
    originalName: string;
    mimeType: string;
    fileSize: number;
    fileDownloadPath: string;
  } | null;
  /** Onay sonucu olusan CANONICAL kayit. */
  serviceRecord?: {
    id: string;
    vehicleId: string;
    date: string;
    costAmount: number;
    currency: string;
  } | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Faz 13 — otomasyona verilen belge. Depolama yolu ISTEMCIYE GELMEZ. */
export interface AutomationDocumentView {
  id: string;
  kind: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  fileDownloadPath: string;
  jobId: string | null;
  duplicate: boolean;
}

export type ServiceInvoiceCostBasis = 'net' | 'gross';

/** Servis faturasi taslagi — bir ServiceRecord DEGILDIR. */
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
  lineItems?: Array<{
    description: string;
    quantity?: number;
    unitPrice?: number;
    totalPrice?: number;
  }>;
}

export interface AutomationReviewMetrics {
  decided: number;
  fastDecisions: number;
  withChanges: number;
  criticalVerified: number;
}

/* ---------------------------------------------------------------------------
 * Yakit fisi / telematik mutabakati (Faz 11)
 * ------------------------------------------------------------------------- */

/**
 * Mutabakat sonucu.
 *
 * SUCLAMA YOK: "hirsizlik"/"dolandiricilik" karsiligi bilincli olarak yok.
 * En agir sonuc bile yalnizca "insan baksin" der.
 */
export type FuelReconciliationRiskLevel =
  | 'insufficient_data'
  | 'normal'
  | 'review_required'
  | 'high_attention';

export type FuelReconciliationReviewOutcome =
  | 'valid'
  | 'corrected'
  | 'duplicate'
  | 'needs_investigation';

export interface FuelReconciliationSignal {
  /** Ceviri anahtari — sunucu kullanici diline metin URETMIYOR. */
  code: string;
  severity: 'strong' | 'moderate';
  group: string;
  weight: number;
  values: Record<string, number | string | null>;
}

export interface FuelReconciliationDataQuality {
  evaluatedRules: string[];
  skippedRules: Array<{ code: string; reason: string }>;
  fuelLevelSamplesBefore: number;
  fuelLevelSamplesAfter: number;
  hasTankCapacity: boolean;
  hasStationLocation: boolean;
  hasPositions: boolean;
  hasFreshPriceSnapshot: boolean;
  missing: string[];
}

export interface FuelReconciliationEvidence {
  receiptLiters: number | null;
  observedIncreaseLiters: number | null;
  observedIncreasePct: number | null;
  absoluteDifferenceLiters: number | null;
  percentageDifference: number | null;
  tankCapacityLiters: number | null;
  levelRiseAt: string | null;
  receiptToRiseMinutes: number | null;
  stationDistanceMeters: number | null;
  closestPositionAt: string | null;
  quotedPricePerLitre: number | null;
  receiptPricePerLiter: number | null;
  priceDeviationRatio: number | null;
  distanceSincePreviousReceiptKm: number | null;
  expectedLitersFromDistance: number | null;
  duplicateCandidateId: string | null;
}

export interface FuelReconciliationPanel {
  id: string;
  fuelEntryId: string;
  status: 'pending' | 'calculated' | 'failed';
  riskLevel: FuelReconciliationRiskLevel;
  riskScore: number;
  signals: FuelReconciliationSignal[];
  dataQuality: FuelReconciliationDataQuality | null;
  evidence: FuelReconciliationEvidence | null;
  algorithmVersion: number;
  calculatedAt: string | null;
  recalculatedAt: string | null;
  review: {
    state: 'open' | 'closed';
    outcome: FuelReconciliationReviewOutcome | null;
    note: string | null;
    reviewedAt: string | null;
    reviewedBy: { id: string; name: string } | null;
  };
  updatedAt: string;
}

export interface FuelReconciliationRow {
  id: string;
  fuelEntryId: string;
  riskLevel: FuelReconciliationRiskLevel;
  riskScore: number;
  reviewState: 'open' | 'closed';
  reviewOutcome: FuelReconciliationReviewOutcome | null;
  signalCodes: string[];
  vehicle: { id: string; plateNumber: string };
  purchasedAt: string;
  liters: number | null;
  fuelGrossAmount: number | null;
  currency: string;
  calculatedAt: string | null;
  updatedAt: string;
}

export interface FuelReconciliationQueueResponse {
  rows: FuelReconciliationRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  summary: { openCount: number; highAttentionCount: number };
}

export interface FuelReconciliationSummary {
  openCount: number;
  highAttentionCount: number;
}

export interface FuelReceiptReviewDetail {
  id: string;
  workflowStatus: FuelEntryWorkflowStatus;
  vehicle: { id: string; plateNumber: string };
  driver: { id: string; name: string };
  fuelingIntent: {
    id: string;
    stationName: string;
    selectedFuelProduct: FuelProductType;
    quotedPricePerLitre: number | null;
    selectedAt: string;
    status: string;
  } | null;
  stationName: string | null;
  stationAddress: string | null;
  receiptNumber: string | null;
  purchasedAt: string;
  fuelProduct: FuelProductType | null;
  liters: number | null;
  pricePerLiter: number | null;
  fuelGrossAmount: number | null;
  receiptGrossAmount: number | null;
  receiptNetAmount: number | null;
  receiptVatAmount: number | null;
  receiptVatRate: number | null;
  currency: string;
  paymentMethod: string | null;
  odometerKm: number | null;
  receiptPlateNumber: string | null;
  isFullTank: boolean;
  /** Yakit toplami ile fis genel toplami FARKLI. */
  mixedReceipt: boolean;
  compatibilityMismatch: boolean;
  duplicateSuspected: boolean;
  issues: FuelReceiptIssue[];
  ocr: {
    status: FuelReceiptOcrStatus;
    provider: string | null;
    processedAt: string | null;
    errorClass: string | null;
    dataMode: string | null;
    extraction: FuelReceiptExtraction | null;
    lowConfidenceFields: string[];
    lowConfidenceThreshold: number;
  };
  /** Yetkili akis; ham depolama yolu DEGIL. */
  fileDownloadPath: string;
  fileName: string | null;
  mimeType: string | null;
  timeline: {
    uploadedAt: string;
    ocrProcessedAt: string | null;
    submittedAt: string | null;
    resubmittedAt: string | null;
    reviewedAt: string | null;
    rejectedAt: string | null;
  };
  /**
   * Telematik kontrolu (Faz 11). `null` = fis heniz onaylanmadi; analiz
   * YALNIZCA onaydan sonra basliyor.
   */
  reconciliation: FuelReconciliationPanel | null;
  review: {
    reviewedBy: { id: string; name: string } | null;
    accountingNote: string | null;
    rejectionReason: string | null;
  };
  /** ETKILI muhasebe durumu (Faz 9). Rozet ve maliyet aciklamasi bunu okur. */
  effectiveAccountingStatus: EffectiveAccountingStatus;
  /** Bu kayit tersine cevrildiyse ayrintisi. */
  reversal: FuelReceiptReversal | null;
  /** Bu kayit bir ters kaydin duzeltilmis kopyasi ise zincir bagi. */
  correctionOf: FuelReceiptCorrectionOf | null;
  updatedAt: string;
}

/**
 * Maliyet dashboard'u (Faz 8).
 *
 * Kaynak: backend/src/dashboard/cost-dashboard.service.ts
 * TUTARLAR STRING: muhasebe tablosunun gercek kaynagi budur. Grafik adaptoru
 * yalnizca GORSELLESTIRME icin dogrulanmis finite number'a cevirir.
 */
export interface MetricComparison {
  current: string;
  previous: string;
  absoluteChange: string;
  /** Onceki donem sifirsa null — sahte yuzde YOK. */
  percentChange: string | null;
}

export interface CostDashboardMonthPoint {
  bucket: string;
  label: string;
  fuel: string;
  service: string;
  fines: string;
  total: string;
  revenue: string | null;
  distanceKm: string | null;
  costPerKm: string | null;
}

export interface CostDashboardVehicleRow {
  vehicleId: string;
  plateNumber: string;
  displayName: string | null;
  fuel: string;
  service: string;
  fines: string;
  total: string;
  revenue: string | null;
  margin: string | null;
  distanceKm: string | null;
  costPerKm: string | null;
  previousTotal: string;
  changePercent: string | null;
  /** 'no_distance' | 'no_costs' | 'no_revenue' */
  dataQuality: string[];
}

export interface CostDashboardResponse {
  baseCurrency: string;
  period: { from: string; to: string; timezone: string };
  comparisonPeriod: { from: string; to: string };
  summary: {
    totalCost: MetricComparison;
    fuelCost: MetricComparison;
    serviceCost: MetricComparison;
    fineCost: MetricComparison;
    revenue: MetricComparison | null;
    margin: MetricComparison | null;
    costPerKm: MetricComparison | null;
    distanceKm: MetricComparison | null;
    /** Toplam maliyete DAHIL DEGIL — yalnizca adet. */
    pendingReceiptCount: number;
  };
  monthlySeries: CostDashboardMonthPoint[];
  composition: { fuel: string; service: string; fines: string; total: string };
  vehicleRanking: CostDashboardVehicleRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  unconvertedByCurrency: Array<{ currency: string; fuelAmount: string; entryCount: number }>;
  /** Maliyet/km HANGI arac kumesi uzerinden hesaplandi. */
  costPerKmCoverage: {
    includedVehicleCount: number;
    excludedVehicleCount: number;
    includedDistanceKm: string;
    includedCost: string;
    totalFleetCost: string;
    costCoveragePercent: string | null;
  };
  dataQuality: {
    vehiclesWithoutDistance: number;
    vehiclesWithoutCosts: number;
    excludedUnconvertedEntries: number;
    notes: string[];
  };
}

/** GET/PUT /tenant/settings/currency */
export interface TenantCurrencySettings {
  baseCurrency: string;
  /** IANA kimligi — rapor ay sinirlari buna gore. */
  timezone: string;
  suggestedTimeZones: string[];
  supportedCurrencies: string[];
  changeable: boolean;
  lockedReason: 'has_monetary_records' | null;
  monetaryRecordCounts: { serviceRecords: number; fines: number; fuelEntries: number };
}

export interface FleetFuelEntry {
  id: string;
  vehicleId: string;
  driverId: string;
  enteredAt: string;
  liters: number;
  totalCost: number;
  currency: string;
  odometerKm: number | null;
  isFullTank: boolean;
  hasReceipt: boolean;
  createdAt: string;
  updatedAt: string;
  vehiclePlate?: string;
  driverName?: string;
}

export interface FleetFuelEntryDetail extends FleetFuelEntry {
  vehiclePlate: string;
  driverName: string;
  previousEntryAt: string | null;
  previousOdometerKm: number | null;
}

export type FuelCardTransactionStatus = 'imported' | 'matched' | 'disputed' | 'ignored';

export interface FuelCardImportBatchSummary {
  id: string;
  sourceFileName: string;
  sourceStoredPath: string | null;
  sourceMimeType: string | null;
  importedAt: string;
  totalRows: number;
  matchedRows: number;
  unmatchedRows: number;
  ignoredRows: number;
  transactionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FuelCardTransactionSummary {
  id: string;
  batchId: string;
  sourceFileName: string;
  vehicleId: string | null;
  plateNumber: string | null;
  driverId: string | null;
  driverName: string | null;
  fuelEntryId: string | null;
  matchedFuelEntryAt: string | null;
  externalReference: string | null;
  cardLast4: string | null;
  merchantName: string;
  transactionAt: string;
  liters: number | null;
  amount: number;
  currency: string;
  odometerKm: number | null;
  status: FuelCardTransactionStatus;
  matchScore: number | null;
  matchNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FleetFuelOverviewResponse {
  from: string | null;
  to: string | null;
  vehicles: Array<{
    vehicleId: string;
    plateNumber: string;
    avgLitersPer100Km: number | null;
    avgEstimatedLitersPer100Km: number | null;
    totalLiters: number;
    totalEstimatedLiters: number;
    tripDistanceKm: number;
    totalCost: number;
  }>;
  totals: {
    totalLiters: number;
    totalEstimatedLiters: number;
    tripDistanceKm: number;
    totalCost: number;
    avgLitersPer100Km: number | null;
    avgEstimatedLitersPer100Km: number | null;
  };
}

export interface FleetVehicleFuelAnalyticsResponse {
  vehicleId: string;
  from: string | null;
  to: string | null;
  avgConsumptionLPer100Km: number;
  avgLitersPer100Km: number | null;
  avgEstimatedLitersPer100Km: number | null;
  totalLiters: number;
  totalEstimatedLiters: number;
  totalCost: number;
  tripDistanceKm: number;
  estimatedVsRealDeltaLiters: number | null;
  weeklyTrend: Array<{
    weekStart: string;
    tripDistanceKm: number;
    realDistanceKm: number;
    realLiters: number;
    estimatedLiters: number;
    realLitersPer100Km: number | null;
    estimatedLitersPer100Km: number | null;
  }>;
  driverBreakdown: Array<{
    driverId: string;
    tripDistanceKm: number;
    realLiters: number;
    estimatedLiters: number;
    eventCount: number;
    realLitersPer100Km: number | null;
    estimatedLitersPer100Km: number | null;
  }>;
  entries: Array<{
    id: string;
    vehicleId: string;
    driverId: string;
    enteredAt: string;
    liters: number;
    totalCost: number;
    currency: string;
    odometerKm: number | null;
    isFullTank: boolean;
    hasReceipt: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
}

export interface FleetFuelAnalyticsCockpitResponse {
  generatedAt: string;
  from: string | null;
  to: string | null;
  vehicleId: string | null;
  driverId: string | null;
  assumptions: {
    co2KgPerLiter: number;
    suspiciousDeltaPercent: number;
    priceTolerancePercent: number;
    targetTolerancePercent: number;
  };
  totals: {
    totalLiters: number;
    totalEstimatedLiters: number;
    tripDistanceKm: number;
    realDistanceKm: number;
    totalCost: number;
    avgLitersPer100Km: number | null;
    avgEstimatedLitersPer100Km: number | null;
    estimatedVsRealDeltaLiters: number | null;
    estimatedVsRealDeltaPercent: number | null;
    co2Kg: number;
    estimatedCo2Kg: number;
    averagePricePerLiter: number | null;
    minPricePerLiter: number | null;
    maxPricePerLiter: number | null;
    costPerKm: number | null;
    costPer100Km: number | null;
    aboveAveragePriceEntryCount: number;
    aboveAverageExcessCost: number;
    overTargetVehicleCount: number;
    ratedVehicleCount: number;
    averageTargetDeviationPercent: number | null;
    suspiciousEventCount: number;
  };
  vehicles: Array<{
    vehicleId: string;
    plateNumber: string;
    brand: string;
    model: string;
    avgLitersPer100Km: number | null;
    avgEstimatedLitersPer100Km: number | null;
    totalLiters: number;
    totalEstimatedLiters: number;
    tripDistanceKm: number;
    totalCost: number;
    deltaLiters: number | null;
    deltaPercent: number | null;
    suspiciousEventCount: number;
    realDistanceKm: number;
    costPerKm: number | null;
    costPer100Km: number | null;
    targetLitersPer100Km: number;
    targetDeviationPercent: number | null;
  }>;
  weeklyTrend: Array<{
    weekStart: string;
    tripDistanceKm: number;
    realDistanceKm: number;
    realLiters: number;
    estimatedLiters: number;
    realLitersPer100Km: number | null;
    estimatedLitersPer100Km: number | null;
    realCost: number;
    entryLiters: number;
    entryCost: number;
    costPer100Km: number | null;
    averagePricePerLiter: number | null;
  }>;
  driverBreakdown: Array<{
    driverId: string;
    driverName: string;
    tripDistanceKm: number;
    realLiters: number;
    realCost: number;
    estimatedLiters: number;
    eventCount: number;
    realLitersPer100Km: number | null;
    estimatedLitersPer100Km: number | null;
    costPer100Km: number | null;
    deltaLiters: number | null;
    deltaPercent: number | null;
  }>;
  priceOutliers: Array<{
    entryId: string;
    vehicleId: string;
    plateNumber: string;
    driverName: string;
    enteredAt: string;
    liters: number;
    totalCost: number;
    pricePerLiter: number;
    deviationPercent: number;
    excessCost: number;
  }>;
  suspiciousEvents: Array<{
    id: string;
    type: 'fuel_theft_suspected' | 'fuel_deviation';
    vehicleId: string;
    plateNumber: string;
    occurredAt: string;
    title: string;
    message: string;
  }>;
  entries: FleetFuelEntry[];
}

export type FleetTripStatus = 'active' | 'closed';
export type FleetTelemetrySource = 'phone' | 'device' | 'api';
export type FleetDrivingEventType =
  | 'speeding'
  | 'harsh_accel'
  | 'harsh_brake'
  | 'harsh_corner'
  | 'crash';

export interface TelemetryHistoryPoint {
  recordedAt: string;
  speedKmh: number | null;
  coolantTemp: number | null;
  voltage: number | null;
}

export interface TelemetryHistoryResponse {
  points: TelemetryHistoryPoint[];
}

export type TelematicsDeviceStatus = 'online' | 'offline' | 'silent';

export interface TelematicsVehicleHealthDtc {
  code: string;
  description: string | null;
  severity: 'low' | 'medium' | 'high' | 'critical';
  occurredAt: string;
}

export interface TelematicsVehicleHealthTelemetry {
  ignition: boolean;
  rpm: number | null;
  fuelLevelPct: number | null;
  coolantTemp: number | null;
  voltage: number | null;
  odometerKm: number | null;
  recordedAt: string;
}

export interface TelematicsMaintenanceStatus {
  id: string;
  name: string;
  intervalKm: number | null;
  intervalDays: number | null;
  lastDoneAtKm: number | null;
  lastDoneAtDate: string | null;
  remainingKm: number | null;
  remainingDays: number | null;
  nextDueAtKm: number | null;
  nextDueAtDate: string | null;
  status: 'ok' | 'due_soon' | 'overdue' | 'unknown';
}

export interface TelematicsVehicleHealthItem {
  vehicleId: string;
  plateNumber: string;
  brand: string;
  model: string;
  hasDevice: boolean;
  deviceStatus: TelematicsDeviceStatus;
  lastSeenAt: string | null;
  telemetry: TelematicsVehicleHealthTelemetry | null;
  activeDtcs: TelematicsVehicleHealthDtc[];
  activeDtcCount: number;
  criticalDtcCount: number;
  fuelDropFlag: boolean;
  nextMaintenance: TelematicsMaintenanceStatus | null;
  maintenanceDueSoon: boolean;
}

export interface TelematicsVehicleHealthResponse {
  generatedAt: string;
  summary: {
    online: number;
    devicesTotal: number;
    activeCriticalDtc: number;
    maintenanceDueSoon: number;
    silentDevices: number;
    hasAnyDevice: boolean;
  };
  items: TelematicsVehicleHealthItem[];
}

export interface TelematicsVehicleHealthSeries24h {
  window: '24h';
  generatedAt: string;
  speed: Array<{ at: string; kmh: number | null }>;
  coolant: Array<{ at: string; celsius: number | null; isEstimated: boolean }>;
  voltage: Array<{ at: string; volts: number | null; isEstimated: boolean }>;
  ignitionPeriods: Array<{ start: string; end: string }>;
}

export interface TelematicsVehicleHealthSeries7d {
  window: '7d';
  generatedAt: string;
  fuelLevel: Array<{ at: string; pct: number | null; isEstimated: boolean }>;
  refuelPoints: Array<{ at: string; liters: number; odometerKm: number | null }>;
  suspiciousDrops: Array<{ at: string }>;
}

export interface TelematicsDriverScoreItem {
  driverId: string;
  driverName: string;
  initials: string;
  driverStatus: DriverStatus;
  score: number | null;
  weeklyDelta: number | null;
  weeklyScores: Array<number | null>;
  insufficientData: boolean;
  distanceKm: number;
  speedingPer100Km: number;
  harshBrakePer100Km: number;
  harshAccelPer100Km: number;
  idleMinPerDay: number;
}

export interface TelematicsDriverScoresResponse {
  generatedAt: string;
  from: string;
  to: string;
  periodDays: number;
  targetScore: number;
  fleetTrend: Array<{ weekStart: string; averageScore: number | null }>;
  items: TelematicsDriverScoreItem[];
}

export interface TelematicsDriverTripItem {
  id: string;
  startedAt: string;
  endedAt: string | null;
  distanceKm: number;
  durationS: number;
  score: number | null;
  eventCounts: Record<FleetDrivingEventType, number>;
  locationPoints: FleetTripLocationPoint[];
  drivingEvents: FleetDrivingEvent[];
}

export interface TelematicsDriverTripsResponse {
  driverId: string;
  driverName: string;
  from: string;
  to: string;
  items: TelematicsDriverTripItem[];
}

export interface FleetTripSummary {
  id: string;
  vehicleId: string;
  driverId: string;
  source: FleetTelemetrySource;
  purpose?: TripPurpose | null;
  purposeNote?: string | null;
  businessContact?: string | null;
  classifiedAt?: string | null;
  classifiedById?: string | null;
  purposeLockedAt?: string | null;
  startedAt: string;
  endedAt: string | null;
  distanceKm: number | string | null;
  durationS: number | null;
  avgSpeedKmh: number | string | null;
  maxSpeedKmh: number | string | null;
  idleS: number | null;
  score: number | string | null;
  hasDataGap: boolean;
  status: FleetTripStatus;
  assignmentId: string | null;
  workSessionId: string | null;
  createdAt: string;
  updatedAt: string;
  odoStartKm?: number | null;
  odoEndKm?: number | null;
  dataGapStartAt?: string | null;
  dataGapEndAt?: string | null;
  dataGapDurationS?: number | null;
  routeStartLabel?: string | null;
  routeEndLabel?: string | null;
  routeStartLatitude?: number | null;
  routeStartLongitude?: number | null;
  routeEndLatitude?: number | null;
  routeEndLongitude?: number | null;
}

export type TripPurpose = 'business' | 'private' | 'commute';

export interface FleetTripLocationPoint {
  id: string;
  recordedAt: string;
  lat: number;
  lng: number;
  speedKmh: number | null;
  headingDeg: number | null;
  accuracyM: number | null;
  source: FleetTelemetrySource;
}

export interface FleetDrivingEvent {
  id: string;
  type: FleetDrivingEventType;
  occurredAt: string;
  lat: number;
  lng: number;
  value: number;
  threshold: number;
}

export interface FleetTripDetail extends FleetTripSummary {
  locationPoints: FleetTripLocationPoint[];
  drivingEvents: FleetDrivingEvent[];
}

export interface FleetTripStopEntry {
  kind: 'stop';
  afterTripId: string;
  beforeTripId: string;
  startedAt: string;
  endedAt: string;
  durationS: number;
  label: string;
  coordinates: { lat: number; lng: number } | null;
  tooltip: string;
}

export interface FleetTripTimelineTrip extends FleetTripSummary {
  kind: 'trip';
}

export type FleetTripTimelineEntry = FleetTripTimelineTrip | FleetTripStopEntry;

export interface FleetTripTimelineDay {
  dayKey: string;
  label: string;
  tripCount: number;
  totalKm: number;
  totalDrivingS: number;
  dayOdoStartKm: number | null;
  dayOdoEndKm: number | null;
  entries: FleetTripTimelineEntry[];
}

export interface FleetTripTimelineResponse {
  from: string | null;
  to: string | null;
  totalTrips: number;
  totalDistanceKm: number;
  totalDrivingS: number;
  dataGapCount: number;
  days: FleetTripTimelineDay[];
}

export interface Fine {
  id: string;
  vehicle_id: string;
  vehicle: { id: string; plate_number: string; internal_code?: string | null };
  driver_id?: string | null;
  driver?: { id: string; name: string; employee_number: string } | null;
  match_type: FineMatchType;
  matched_work_session_id?: string | null;
  matched_work_session?: {
    id: string;
    started_at: string;
    ended_at?: string | null;
    status: string;
  } | null;
  matched_assignment_id?: string | null;
  matched_assignment?: {
    id: string;
    work_date: string;
    start_time: string;
    end_time: string;
    company_name: string;
  } | null;
  violation_at: string;
  violation_location: string;
  violation_type: string;
  violation_category: FineViolationCategory;
  amount?: number | null;
  payment_due_date?: string | null;
  notice_date?: string | null;
  status: FineStatus;
  notes?: string | null;
  match_candidates?: FineMatchCandidate[] | null;
  match_tolerance_minutes?: number | null;
  driver_notified_at?: string | null;
  driver_acknowledged_at?: string | null;
  pending_ack?: boolean;
  days_until_due?: number | null;
  is_urgent?: boolean;
  document_url?: string | null;
  created_by?: { id: string; name: string; email: string } | null;
  status_logs: FineStatusLog[];
  created_at: string;
  updated_at: string;
}

export interface FineStats {
  by_status: Partial<Record<FineStatus, number>>;
  by_category: Partial<Record<FineViolationCategory, number>>;
  top_vehicles: Array<{ vehicle_id: string; plate_number: string; count: number }>;
  top_drivers: Array<{
    driver_id: string | null;
    driver_name: string | null;
    employee_number: string | null;
    count: number;
  }>;
}

// ─── Departure check & defects ───────────────────────────────────────────────

export type DepartureCheckItemStatus = 'ok' | 'defekt' | 'na';
export type DepartureCheckOverallStatus = 'ok' | 'maengel_gemeldet';
export type DefectSeverity = 'kritisch' | 'mittel' | 'gering';
export type DefectStatus = 'offen' | 'in_reparatur' | 'behoben' | 'bestaetigt';
export type DefectSource = 'departure_check' | 'manual_report';

export interface DepartureCheckItemResult {
  id: string;
  item_key: string;
  item_label: string;
  sort_order: number;
  result: DepartureCheckItemStatus;
  defect_description?: string | null;
  photo_count: number;
}

export interface DepartureCheck {
  id: string;
  driver_id: string;
  driver: { id: string; name: string; employee_number: string };
  vehicle_id: string;
  vehicle: {
    id: string;
    plate_number: string;
    internal_code?: string | null;
    category?: string | null;
  };
  assignment_id?: string | null;
  assignment?: {
    id: string;
    work_date: string;
    start_time: string;
    company_name: string;
  } | null;
  template_id?: string | null;
  template_name?: string | null;
  work_date: string;
  performed_at: string;
  overall_status: DepartureCheckOverallStatus;
  item_results: DepartureCheckItemResult[];
  defects?: Array<{ id: string; severity: string; status: string; title: string }>;
  created_at: string;
}

export interface MissingDepartureCheck {
  driver_id: string;
  driver_name: string;
  employee_number: string;
  vehicle_id: string;
  vehicle_plate: string;
  assignment_id: string;
  start_time: string;
  work_date: string;
}

export interface DefectStatusLog {
  id: string;
  from_status: DefectStatus | null;
  to_status: DefectStatus;
  changed_by_user_id?: string | null;
  changed_by_driver_id?: string | null;
  note?: string | null;
  repair_company?: string | null;
  estimated_repair_date?: string | null;
  created_at: string;
}

export interface Defect {
  id: string;
  vehicle_id: string;
  vehicle: {
    id: string;
    plate_number: string;
    internal_code?: string | null;
    status?: string | null;
  };
  reported_by_driver_id: string;
  reported_by: { id: string; name: string; employee_number: string };
  source: DefectSource;
  departure_check_id?: string | null;
  title: string;
  description: string;
  severity: DefectSeverity;
  status: DefectStatus;
  repair_company?: string | null;
  estimated_repair_date?: string | null;
  confirmation_driver_id?: string | null;
  confirmation_driver?: { id: string; name: string; employee_number: string } | null;
  confirmed_at?: string | null;
  photo_count: number;
  photo_urls?: string[];
  status_logs: DefectStatusLog[];
  created_at: string;
  updated_at: string;
}

// ─── Vehicle Handover ──────────────────────────────────────────────────────

export type VehicleHandoverType = 'pickup' | 'return';

export type VehicleHandoverPhotoStatus =
  | 'not_required'
  | 'missing'
  | 'uploaded'
  | 'approved'
  | 'rejected';

export type VehicleHandoverStatus = 'pending' | 'completed';

export interface VehicleHandover {
  id: string;
  driverId: string;
  vehicleId: string;
  previousVehicleId?: string;
  handoverType: VehicleHandoverType;
  date: string;
  time: string;
  photoRequired: boolean;
  photoStatus: VehicleHandoverPhotoStatus;
  photos: string[];
  damageDetected: boolean;
  damageNotes?: string;
  equipmentChecklist: {
    firstAidKit: boolean;
    fireExtinguisher: boolean;
    straps: boolean;
    safetyVest: boolean;
  };
  status: VehicleHandoverStatus;
}

export interface PaginatedAssignments {
  date?: string;
  data: Assignment[];
  total?: number;
  page?: number;
  limit?: number;
  pages?: number;
}

export interface CustomerAssignmentMessage {
  id: string;
  assignmentId: string;
  body: string;
  senderUserId: string;
  senderName: string;
  senderRole: string;
  isFromCustomer: boolean;
  createdAt: string;
}

// ─── Cargo Damage ───────────────────────────────────────────────────────────

export type CargoDamageStatus = 'pending' | 'under_review' | 'approved' | 'rejected' | 'closed';

export type CargoDamageType =
  | 'cargo_dropped'
  | 'cargo_damaged'
  | 'missing_cargo'
  | 'wrong_delivery'
  | 'packaging_damage'
  | 'loading_mistake'
  | 'other';

export interface CargoDamageReport {
  id: string;
  driverId: string;
  vehicleId: string;
  companyId: string;
  assignmentId?: string;
  date: string;
  time: string;
  damageType: CargoDamageType;
  cargoName: string;
  cargoOwner: string;
  companyName: string;
  description?: string;
  photos: string[];
  documentPhoto?: string;
  damageValue?: number;
  status: CargoDamageStatus;
  createdAt: string;
}

// ─── Document ─────────────────────────────────────────────────────────────

export type DocumentOwnerType =
  | 'driver'
  | 'vehicle'
  | 'company'
  | 'request'
  | 'accident'
  | 'cargo_damage'
  | 'service_record';

export interface Document {
  id: string;
  ownerType: DocumentOwnerType;
  ownerId: string;
  documentType: string;
  fileName: string;
  /** @deprecated Internal storage path — use download_url */
  fileUrl?: string;
  download_url?: string | null;
  expiryDate?: string;
  uploadedAt: string;
  status: 'valid' | 'expiring_soon' | 'expired' | 'missing' | 'archived';
  notes?: string;
}

// ─── User (admin panel) ───────────────────────────────────────────────────

export type UserRole = 'admin' | 'boss' | 'accounting' | 'office' | 'driver' | 'customer';
export type UserStatus = 'active' | 'inactive';

export interface User {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  language: string;
  created_at?: string;
  updated_at?: string;
}

// ─── Calendar event ───────────────────────────────────────────────────────

export type CalendarStatusCode =
  | 'AT' | 'UT' | 'KT' | 'FT' | 'HO' | 'SCH' | 'GR'
  | 'AZ' | 'SZ' | 'US' | 'FR' | 'WE' | 'AB' | 'MT';
export type CalendarSourceCode = 'manual' | 'leave' | 'assignment';

export interface CalendarEvent {
  id: string;
  driverId: string;
  assignmentId?: string | null;
  requestId?: string | null;
  date: string;
  status: CalendarStatusCode;
  uiStatus?: string | null;
  source: CalendarSourceCode;
}

// ─── Transport request ────────────────────────────────────────────────────

export type TransportRequestStatus = 'pending' | 'approved' | 'rejected' | 'needs_review';

export interface TransportRequest {
  id: string;
  driverId: string;
  vehicleId: string;
  companyId: string;
  cargoName: string;
  cargoOwner: string;
  pickupAddress: string;
  deliveryAddress: string;
  requestedDate: string;
  startTime: string;
  endTime: string;
  status: TransportRequestStatus;
  conflictReason?: string | null;
  assignmentId?: string | null;
  notes?: string | null;
  driver?: { firstName: string; lastName: string };
  vehicle?: { plateNumber: string };
  company?: { name: string };
}

// ─── Morning check-in ────────────────────────────────────────────────────

export type MorningCheckinBackendStatus =
  | 'confirmed'
  | 'waiting_for_review'
  | 'missing_vehicle_plate'
  | 'missing_company'
  | 'conflict'
  | 'added_to_einsatzplan'
  | 'rejected';

export interface MorningCheckin {
  id: string;
  driver_id: string;
  driver_name: string;
  date: string;
  submitted_at: string;
  vehicle_plate?: string | null;
  company_name?: string | null;
  cargo_name?: string | null;
  cargo_quantity?: string | null;
  status: MorningCheckinBackendStatus;
  conflict_reason?: string | null;
  assignment_id?: string | null;
  notes?: string;
}

// ─── Service record (vehicle maintenance) ─────────────────────────────────

export interface ServiceRecord {
  id: string;
  vehicle_id: string;
  vehicle_plate: string;
  driver_id?: string;
  driver_name?: string;
  /** Tamamlanma tarihi. */
  date: string;
  /** Servis baslangici; girilmemis olabilir. */
  start_date?: string | null;
  service_type: string;
  vendor?: string;
  repair_company: string;
  cost_amount: number;
  mileage_km?: number | null;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

// ─── Leave request (vacation/sick/...) ────────────────────────────────────

export type LeaveRequestType =
  | 'vacation'
  | 'sick_leave'
  | 'training'
  | 'business_trip'
  | 'doctor_appointment'
  | 'special_leave'
  | 'overtime_compensation'
  | 'free_day'
  | 'other';

export type LeaveRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'needs_review';

export interface LeaveRequest {
  id: string;
  driverId: string;
  type: LeaveRequestType;
  startDate: string;
  endDate: string;
  reason?: string;
  status: LeaveRequestStatus;
  approvedById?: string | null;
  driver?: { id: string; firstName: string; lastName: string };
  createdAt?: string;
  updatedAt?: string;
}

// ─── Company email draft ──────────────────────────────────────────────────

export type CompanyEmailStatus = 'draft' | 'draft_ready' | 'needs_review' | 'sent' | 'failed';

export interface CompanyEmail {
  id: string;
  companyId: string;
  date: string;
  subject: string;
  body: string;
  recipientEmail?: string;
  status: CompanyEmailStatus;
  lastSentAt?: string | null;
  company?: { name: string };
}

// ─── Reminder ─────────────────────────────────────────────────────────────

export type ReminderType =
  | 'license_expiry'
  | 'passport_expiry'
  | 'tuv_expiry'
  | 'sp_expiry'
  | 'insurance_expiry'
  | 'document_expiry'
  | 'contract_expiry'
  | 'custom';
export type ReminderStatus = 'open' | 'resolved';

export interface Reminder {
  id: string;
  type: ReminderType;
  title: string;
  message: string;
  due_date: string;
  notify_before_days: number;
  status: ReminderStatus;
  related_entity_type?: string;
  related_entity_id?: string;
  related_entity_name?: string;
  created_at?: string;
}

// ─── Notification ─────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'unread' | 'read';
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  createdAt: string;
  updatedAt?: string;
}

// ─── Dashboard ─────────────────────────────────────────────────────────────

export interface DashboardKpis {
  activeDrivers: number;
  driversOnVacation: number;
  sickDrivers: number;
  vehiclesInUse: number;
  vehiclesInUseLastWeek?: number;
  openAccidents: number;
  cargoDamages: number;
  expiringDocuments: number;
  unsentCompanyEmails: number;
}

export interface DashboardCriticalAlert {
  id: string;
  type: string;
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  relatedEntityType?: string;
  relatedEntityId?: string;
}

export interface DashboardTodayOperation {
  id: string;
  driverId?: string;
  driverName: string;
  vehiclePlate: string;
  companyName: string;
  startTime: string;
  endTime: string;
  status: string;
  cargoName?: string;
  cargoOwner?: string;
  pickupAddress?: string;
  deliveryAddress?: string;
  routeName?: string;
}

export interface DashboardTomorrowPlanning {
  plannedDrivers: number;
  availableDrivers: number;
  missingAssignments: number;
  unavailableDrivers: Array<{ driverId: string; driverName: string; status: string }>;
}

export interface DashboardVehicleHealthRow {
  vehicleId: string;
  plateNumber: string;
  status: string;
  tuvExpiryDate?: string | null;
  spExpiryDate?: string | null;
  issue: string;
}

export interface DashboardDriverRiskRow {
  driverId: string;
  driverName: string;
  riskLevel: 'green' | 'yellow' | 'red';
  accidentCount: number;
}

export interface DashboardRevenueAnalytics {
  todayRevenue?: number;
  weeklyRevenue?: number;
  monthlyRevenue?: number;
  lastWeekSameDayRevenue?: number;
  prevMonthToDateRevenue?: number;
  revenueByCompany?: Array<{
    companyId: string;
    companyName: string;
    assignments: number;
    revenue: number;
  }>;
}

export interface DashboardRevenueByCompanyRow {
  companyId: string;
  companyName: string;
  assignments: number;
  revenue: number;
  assignmentsWithoutRevenue: number;
}

export interface DashboardRevenueByCompany {
  from: string;
  to: string;
  totalRevenue: number;
  totalAssignments: number;
  assignmentsWithoutRevenue: number;
  companies: DashboardRevenueByCompanyRow[];
}

export interface DashboardChartPoint {
  label: string;
  shortLabel?: string;
  value: number;
}

export interface DashboardChartAnalytics {
  dailyRevenue: DashboardChartPoint[];
  monthlyRevenue: DashboardChartPoint[];
  dailyAccidents: DashboardChartPoint[];
  monthlyAccidents: DashboardChartPoint[];
}

export interface DashboardFleetWidgets {
  serviceReminders: { overdue: number; dueSoon: number };
  openIssues: { open: number; overdue: number };
  vehicleRenewals: { overdue: number; dueSoon: number };
  incompleteWorkOrders: { open: number; pending: number };
  contactRenewals: { overdue: number; dueSoon: number };
  vehicleAssignments: { assigned: number; unassigned: number };
  vehicleStatus: {
    active: number;
    maintenance: number;
    inactive: number;
    broken: number;
  };
}

export interface DashboardCostChartPoint {
  label: string;
  shortLabel: string;
  value: number;
}

export interface DashboardRepairReason {
  id: string;
  label: string;
  count: number;
  total: number;
  color: string;
}

export interface DashboardCostAnalytics {
  totalCosts: DashboardCostChartPoint[];
  otherCosts: DashboardCostChartPoint[];
  topRepairReasons: DashboardRepairReason[];
}

export interface DashboardPriorityTrendPoint {
  label: string;
  shortLabel: string;
  scheduled: number;
  nonScheduled: number;
  emergency: number;
  none: number;
  total: number;
}

export interface DashboardSummary {
  kpis: DashboardKpis;
  criticalAlerts: DashboardCriticalAlert[];
  todayOperations: DashboardTodayOperation[];
  tomorrowPlanning: DashboardTomorrowPlanning;
  vehicleHealth: DashboardVehicleHealthRow[];
  driverRiskOverview: DashboardDriverRiskRow[];
  revenueAnalytics?: DashboardRevenueAnalytics;
  chartAnalytics?: DashboardChartAnalytics | null;
  fleetWidgets?: DashboardFleetWidgets;
  costAnalytics?: DashboardCostAnalytics | null;
  priorityTrends?: DashboardPriorityTrendPoint[];
}

// ─── Messenger ─────────────────────────────────────────────────────────────

export type MessengerLanguage = 'de' | 'tr' | 'en' | 'pl' | 'nl' | 'it' | 'es' | 'ru';
export type MessageTranslationStatus = 'translated' | 'failed' | 'not_requested' | 'pending';

export interface ConversationParticipant {
  userId: string;
  role: UserRole;
  joinedAt: string;
  lastReadAt: string | null;
  user: {
    id: string;
    fullName: string;
    email: string;
    role: UserRole;
    language?: string;
  };
}

export interface MessengerDriverSummary {
  id: string;
  firstName: string;
  lastName: string;
  userId: string | null;
  employeeNumber?: string | null;
  preferredLanguage?: MessengerLanguage | null;
}

export interface MessengerStats {
  totalConversations: number;
  unreadTotal: number;
  conversationsWithUnread: number;
  messagesLast24Hours: number;
}

export interface MessengerMessage {
  id: string;
  conversationId: string;
  senderUserId: string;
  senderName: string;
  originalText: string;
  translatedText: string | null;
  originalLanguage: MessengerLanguage;
  targetLanguage: MessengerLanguage | null;
  translationStatus: MessageTranslationStatus;
  createdAt: string;
  attachments: MessengerAttachment[];
  readByCurrentUser: boolean;
}

export interface MessengerAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  downloadUrl: string;
  createdAt: string;
}

export type MessengerDepartment = 'dispatch' | 'hr' | 'accounting' | 'maintenance' | 'general';

export interface ConversationListItem {
  id: string;
  subject: string | null;
  department?: MessengerDepartment;
  driver: MessengerDriverSummary;
  participants: ConversationParticipant[];
  lastMessage: {
    id: string;
    senderUserId: string;
    senderName: string;
    originalText: string;
    translatedText: string | null;
    originalLanguage: MessengerLanguage;
    targetLanguage: MessengerLanguage | null;
    translationStatus: MessageTranslationStatus;
    createdAt: string;
  } | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

export interface ConversationDetail {
  id: string;
  subject: string | null;
  department?: MessengerDepartment;
  driver: MessengerDriverSummary;
  participants: ConversationParticipant[];
  lastMessageAt: string | null;
  unreadCount: number;
  messagesPreview: MessengerMessage[];
}

export interface SendMessagePayload {
  text?: string;
  originalLanguage?: MessengerLanguage;
  targetLanguage?: MessengerLanguage;
  attachments?: File[];
}

export interface MessengerUnreadCount {
  total: number;
  byConversation: Array<{
    conversationId: string;
    count: number;
  }>;
}

// ─── Live Tracking ───────────────────────────────────────────────────────────

export type LiveTrackingStatus = 'online' | 'stale' | 'offline';

export type LiveTrackingMotionState = 'moving' | 'idle' | 'stopped' | 'offline';

export type LocationSourceType = 'mobile' | 'telematics';

export type DriverLocationTrackingStatus = 'active' | 'paused' | 'denied';

export interface DriverLocationStatus {
  consentGranted: boolean;
  consentAt: string | null;
  trackingStatus: DriverLocationTrackingStatus;
  sharingActive: boolean;
  sharingStartedAt: string | null;
  sharingEndedAt: string | null;
  hasTrackableAssignmentToday: boolean;
  trackingAllowed: boolean;
  lastUpload: {
    recordedAt: string;
    receivedAt: string;
    vehicleId: string | null;
  } | null;
}

export interface DriverPortalAssignment {
  id: string;
  driver: { id: string; name: string };
  vehicle: { id: string; plateNumber: string };
  company: { id: string; name: string };
  cargoName: string;
  cargoOwner: string;
  pickupAddress: string;
  deliveryAddress: string;
  workDate: string;
  startTime: string;
  endTime: string;
  routeName?: string | null;
  notes?: string | null;
  status: string;
}

export type DriverHandoverPhotoSlot =
  | 'front'
  | 'right'
  | 'left'
  | 'rear'
  | 'tail_lift'
  | 'interior';

export type DriverRequestType =
  | 'vacation'
  | 'sick_leave'
  | 'training'
  | 'business_trip'
  | 'doctor_appointment'
  | 'special_leave'
  | 'overtime_compensation'
  | 'free_day'
  | 'uniform_delivery'
  | 'other';

/** Driver's tour for the day — GET /driver/tours/today. Read-only today. */
export interface DriverTourStop {
  id: string;
  sequence: number;
  kind: string;
  assignmentId: string | null;
  address: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  /**
   * Routing's verdict on whether a truck reaches this point. An enum, not a
   * boolean — 'unknown' and 'check_failed' mean "not confirmed", which is a
   * weaker statement than 'unreachable'.
   */
  truckAccess: 'unknown' | 'reachable' | 'unreachable' | 'check_failed';
  windowStart: string | null;
  windowEnd: string | null;
  serviceMinutes: number | null;
  plannedArrivalAt: string | null;
  legDistanceKm: number | null;
  status: DriverTourStopStatus;
  arrivedAt: string | null;
  completedAt: string | null;
}

export type DriverTourStopStatus = 'pending' | 'arrived' | 'completed' | 'skipped';

export interface DriverTourStopState {
  id: string;
  status: DriverTourStopStatus;
  arrived_at: string | null;
  completed_at: string | null;
}

export interface DriverTour {
  id: string;
  name: string | null;
  workDate: string;
  status: string;
  plannedDistanceKm: number | null;
  plannedDurationMin: number | null;
  stops: DriverTourStop[];
}

/** Daily vehicle check (Abfahrtskontrolle) — GET /driver/departure-check/status. */
export interface DepartureCheckTemplateItem {
  id: string;
  item_key: string;
  label: string;
  description: string | null;
  sort_order: number;
  requires_photo_on_defect: boolean;
}

export interface DepartureCheckVehicleCompliance {
  vehicle_id: string;
  has_blocking_defect: boolean;
  open_critical_defects: Array<{
    id: string;
    title: string;
    description: string | null;
    status: string;
    severity: string;
    created_at: string;
  }>;
  blocks_assignment: boolean;
  blocks_departure_check: boolean;
}

export interface DriverDepartureCheckStatus {
  required: boolean;
  completed_today: boolean;
  can_submit: boolean;
  assignment: {
    id: string;
    work_date: string;
    start_time: string;
    company_name: string;
    vehicle_id: string;
    vehicle_plate: string;
  } | null;
  existing_check: {
    id: string;
    overall_status: string;
    performed_at: string;
  } | null;
  template: {
    id: string;
    name: string;
    items: DepartureCheckTemplateItem[];
  } | null;
  vehicle_compliance: DepartureCheckVehicleCompliance | null;
}

export interface DepartureCheckItemInput {
  item_key: string;
  result: DepartureCheckItemStatus;
  defect_description?: string;
  defect_severity?: DefectSeverity;
}

export interface DriverMorningCheckin {
  id: string;
  date: string;
  submittedAt: string;
  vehiclePlate?: string | null;
  companyName?: string | null;
  cargoName?: string | null;
  cargoQuantity?: string | null;
  status: string;
  conflictReason?: string | null;
  assignmentId?: string | null;
  notes?: string | null;
  locationSharingStarted?: boolean;
  handoverRequired?: boolean;
  handoverId?: string | null;
  handoverAssignmentId?: string | null;
  handoverVehicleId?: string | null;
}

export interface DriverHandover {
  id: string;
  driverId: string;
  vehicleId: string;
  previousVehicleId?: string | null;
  assignmentId?: string | null;
  handoverType: 'pickup' | 'return';
  handoverDateTime: string;
  photoRequired: boolean;
  photoStatus: 'not_required' | 'missing' | 'uploaded' | 'approved' | 'rejected';
  damageDetected: boolean;
  damageNotes?: string | null;
  status: 'pending' | 'completed';
  notes?: string | null;
  requiredPhotoSlots?: DriverHandoverPhotoSlot[];
  photos?: Partial<
    Record<
      DriverHandoverPhotoSlot,
      {
        id: string;
        fileName: string;
        fileUrl?: string | null;
        download_url?: string | null;
        validationStatus?: 'validated' | 'location_mismatch';
      }
    >
  >;
  missingSlots?: DriverHandoverPhotoSlot[];
  photosComplete?: boolean;
  equipmentChecklist?: {
    firstAidKit: boolean;
    fireExtinguisher: boolean;
    straps: boolean;
    safetyVest: boolean;
    notes: string;
    verifiedAt: string | null;
    complete: boolean;
    inventoryComplete?: boolean;
    inventoryChecks?: Array<{ equipmentId: string; quantityPresent: number }>;
    vehicleEquipment?: Array<{
      id: string;
      name: string;
      expectedQuantity: number;
      photoDocumentId?: string | null;
      photoDownloadUrl?: string | null;
    }>;
  };
  vehicle?: { id: string; plateNumber: string };
  assignment?: { id: string; workDate: string; startTime: string; endTime: string } | null;
}

export interface DriverPortalRequest {
  id: string;
  driverId: string;
  type: DriverRequestType;
  startDate: string;
  endDate: string;
  reason?: string | null;
  status: string;
  createdAt?: string;
  attachments?: Array<{
    id: string;
    fileName: string;
    download_url?: string | null;
  }>;
}

export interface DriverTransportRequest {
  id: string;
  driverId: string;
  vehicleId: string;
  companyId: string;
  vehicle?: { id: string; plateNumber: string };
  company?: { id: string; name: string };
  cargoName: string;
  cargoOwner: string;
  pickupAddress: string;
  deliveryAddress: string;
  requestedDate: string;
  startTime: string;
  endTime: string;
  status: string;
  conflictReason?: string | null;
  assignmentId?: string | null;
  createdAt?: string;
  attachments?: Array<{
    id: string;
    fileName: string;
    download_url?: string | null;
  }>;
}

export interface DriverTransportFormOptions {
  vehicles: Array<{ id: string; plateNumber: string; brand?: string; model?: string }>;
  companies: Array<{ id: string; name: string }>;
  assignments: Array<{
    id: string;
    vehicleId: string;
    companyId: string;
    vehiclePlate: string;
    companyName: string;
    workDate: string;
    startTime: string;
    endTime: string;
  }>;
}

export interface DriverIncident {
  id: string;
  type: 'vehicle_accident' | 'cargo_damage';
  driverId: string;
  vehicleId: string;
  companyId?: string | null;
  assignmentId?: string | null;
  incidentDateTime: string;
  location?: string | null;
  description: string;
  cargoName?: string | null;
  cargoOwner?: string | null;
  status: string;
  createdAt?: string;
}

export interface DriverPortalNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  priority: string;
  status: string;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type DriverEquipmentIssuance = EquipmentIssuanceRecord;

export type DriverDocumentStatus = 'valid' | 'expiring_soon' | 'expired' | 'missing' | 'archived';

export interface DriverDocumentItem {
  id: string;
  documentType: string;
  fileName: string;
  fileUrl?: string | null;
  download_url?: string | null;
  status: DriverDocumentStatus;
  expiryDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DriverDocumentsResponse {
  uploadTypes: string[];
  requiredTypes: string[];
  missingRequired: string[];
  missingUploadableRequired: string[];
  items: DriverDocumentItem[];
}

export interface DriverPortalMe {
  user: {
    id: string;
    email: string;
    role: 'driver';
    language?: string;
    status: string;
    fullName: string;
  };
  driver: {
    id: string;
    firstName: string;
    lastName: string;
    phone?: string | null;
    email?: string | null;
    status: string;
    riskLevel?: string;
    employeeNumber?: string;
    licenseNumber?: string | null;
    licenseExpiryDate?: string | null;
    passportNumber?: string | null;
    passportExpiryDate?: string | null;
    homeAddressStreet?: string | null;
    homeAddressZipCode?: string | null;
    homeAddressCity?: string | null;
    homeAddressCountry?: string | null;
    profileComplete?: boolean;
    assignedVehicle?: {
      id: string;
      plateNumber: string;
      brand: string;
      model: string;
    } | null;
    todayAssignment?: {
      id: string;
      workDate: string;
      startTime: string;
      endTime: string;
      vehicle: { id: string; plateNumber: string; brand: string; model: string };
      company: { id: string; name: string };
    } | null;
  };
}

export interface LiveTrackingItem {
  driverId: string;
  driverName: string;
  vehicleId: string | null;
  plateNumber: string | null;
  latitude: number | null;
  longitude: number | null;
  speedKmh: number | null;
  headingDeg: number | null;
  accuracyM: number | null;
  recordedAt: string | null;
  receivedAt: string | null;
  status: LiveTrackingStatus;
  motionState: LiveTrackingMotionState;
  idleSinceMs?: number;
  hasCriticalDtc: boolean;
  fuelDropFlag: boolean;
  isSilent: boolean;
  locationSource: LocationSourceType | null;
  assignmentId: string | null;
  companyName: string | null;
  cargoName: string | null;
}

export interface LiveTrackingTrailPoint {
  at: string;
  lat: number;
  lng: number;
  speedKph: number | null;
}

export type TachographBadges = {
  openCriticalInfringements: number;
  unacknowledgedInfringements: number;
  overdueCardDownloads: number;
  overdueVuDownloads: number;
  activeCriticalDtcs: number;
};

export type TachographComplianceOverview = {
  generatedAt: string;
  range: { from: string; to: string };
  hasDddFiles: boolean;
  kpis: {
    openInfringements: number;
    overdueCardDownloads: number;
    overdueVuDownloads: number;
    fleetComplianceScorePct: number;
    fleetComplianceTrendPct: number;
  };
  weeklyInfringementTrend: Array<{
    weekKey: string;
    weekStart: string;
    medium: number;
    critical: number;
  }>;
  driverMatrix: Array<{
    driverId: string;
    firstName: string;
    lastName: string;
    photoUrl: string | null;
    cardDownload: {
      lastAt: string | null;
      daysSince: number | null;
      status: 'green' | 'amber' | 'red' | 'unknown';
    };
    openInfringementCount: number;
    driving28dS: number;
    driving28dFormatted: string;
    sparklineDrivingS: number[];
    weeklyRemainingS: number;
    weeklyRemainingFormatted: string;
    weeklyRemainingStatus: 'ok' | 'warning' | 'critical';
    lastActivityAt: string | null;
    isEstimated: boolean;
  }>;
  vuDownloads: Array<{
    vehicleId: string | null;
    plateNumber: string;
    lastDownloadAt: string | null;
    daysSinceLastDownload: number;
    intervalDays: number;
    progressPct: number;
    overdue: boolean;
  }>;
  downloadDeadlines: Array<{
    id: string;
    subject: 'driver_card' | 'vehicle_unit';
    entityLabel: string;
    lastReadAt: string | null;
    nextDueAt: string;
    daysRemaining: number;
    intervalDays: number;
    status: 'ok' | 'warning' | 'overdue';
  }>;
};

export type TachographInfringementItem = {
  id: string;
  type: string;
  typeLabelKey: string;
  article: string;
  severity: 'medium' | 'critical';
  occurredAt: string;
  acknowledgedAt: string | null;
  status: 'open' | 'acknowledged';
  acknowledgementSlaOverdue: boolean;
  payrollRelevant: boolean;
  payrollMarkedAt: string | null;
  payrollMarkedBy: { id: string; fullName: string } | null;
  driver: { id: string; firstName: string; lastName: string } | null;
  vehicle: { id: string; plateNumber: string } | null;
  dddFile: {
    id: string;
    fileType: string;
    signatureValid: boolean | null;
    capturedAt: string;
  } | null;
  evidence: Record<string, unknown> | null;
};

export type TachographInfringementListResponse = {
  page: number;
  limit: number;
  total: number;
  typeBreakdown: Array<{
    type: string;
    article: string;
    labelKey: string;
    count: number;
    dominantSeverity: 'medium' | 'critical';
  }>;
  items: TachographInfringementItem[];
};

export type TachographInfringementDetail = TachographInfringementItem & {
  acknowledgementNote: string | null;
  acknowledgedAt: string | null;
  acknowledgedBy: { id: string; fullName: string } | null;
  evidenceFormatted: Array<{ label: string; value: string }>;
  activityTimeline: Array<{
    id: string;
    workState: string;
    startedAt: string;
    endedAt: string;
    durationS: number;
    durationFormatted: string;
  }>;
  infringementWindow: { startMs: number; endMs: number };
  dddFile: {
    id: string;
    fileType: string;
    signatureValid: boolean | null;
    capturedAt: string;
    sha256: string;
    source: string;
  } | null;
};

export type DddFileProcessingStatus = 'pending' | 'processed' | 'failed';

export type DddFileSource = 'manual' | 'service' | 'remote';

export type DddFileListItem = {
  id: string;
  fileType: string;
  source: DddFileSource;
  status: DddFileProcessingStatus;
  processingErrorSummary: string | null;
  capturedAt: string;
  createdAt: string;
  sizeBytes: number;
  sha256: string;
  generation: number | null;
  signatureValid: boolean | null;
  coveredPeriod: { from: string | null; to: string | null };
  vehicle: { id: string; plateNumber: string } | null;
  driver: { id: string; firstName: string; lastName: string } | null;
};

export type TachographRemainingDriver = {
  driverId: string;
  firstName: string;
  lastName: string;
  todayDrivingS: number;
  todayRemainingDrivingS: number;
  todayContinuousDrivingS: number;
  nextMandatoryBreakInS: number;
  weekUsedS: number;
  weekLimitS: number;
  twoWeekUsedS: number;
  twoWeekLimitS: number;
  extensionsUsed: number;
  extensionsMax: number;
  reducedRestUsed: number;
  reducedRestMax: number;
  currentStatus: 'driving' | 'rest' | 'work' | 'available';
  lastDddAt: string | null;
  daysSinceDdd: number | null;
  isStale: boolean;
  plannedTodayS: number;
  exceedsRemaining: boolean;
  assignmentId: string | null;
};

export type TachographRemainingResponse = {
  generatedAt: string;
  hasActivityData: boolean;
  drivers: TachographRemainingDriver[];
  warnings: Array<{
    driverId: string;
    driverName: string;
    plannedTodayS: number;
    remainingDrivingS: number;
    assignmentId: string | null;
  }>;
};

export type TachographDashboardSummary = {
  generatedAt: string;
  complianceScorePct: number;
  complianceScoreTrendDelta: number;
  complianceScoreTrend: Array<{ weekStart: string; scorePct: number }>;
  openCriticalCount: number;
  driversOutOfTimeToday: number;
  overdueDownloadsTotal: number;
};

export type TachographDriverStory = {
  generatedAt: string;
  driverId: string;
  driverName: string;
  weeks: Array<{
    weekStart: string;
    distanceKm: number;
    score: number | null;
    infringementEvents: Array<{
      type: string;
      severity: 'medium' | 'critical';
      occurredAt: string;
    }>;
  }>;
  weeksWithData: number;
  openInfringementCount: number;
  recentInfringements: Array<{
    id: string;
    type: string;
    severity: 'medium' | 'critical';
    occurredAt: string;
    evidence: Record<string, unknown> | null;
  }>;
};

export type VehicleMonthlyCostsResponse = {
  generatedAt: string;
  vehicleId: string;
  months: Array<{
    monthStart: string;
    fuelEur: number;
    serviceEur: number;
    fineEur: number;
  }>;
  totalEur: number;
  monthlyAverageEur: number;
  serviceCostUnavailable: boolean;
};

export type DddUploadResponse = {
  file: { id: string; status: DddFileProcessingStatus };
  deduplicated: boolean;
};

// ─── Outgoing invoicing ──────────────────────────────────────────────────────

export type BulkCompleteAssignmentsResult = {
  requested: number;
  completedCount: number;
  completed: string[];
  skipped: Array<{ id: string; reason: string }>;
};

export type OpenOverdueAssignment = {
  id: string;
  status: 'planned' | 'confirmed' | 'in_progress';
  workDate: string;
  cargoName: string;
  routeName: string | null;
  driverName: string | null;
  daysOverdue: number;
  suggestedNetCents: number | null;
};

export type OpenOverdueCompany = {
  companyId: string;
  companyName: string;
  assignmentCount: number;
  potentialNetCents: number;
  oldestWorkDate: string;
  assignments: OpenOverdueAssignment[];
};

export type OpenOverdueResponse = {
  asOf: string;
  totals: {
    assignmentCount: number;
    potentialNetCents: number;
    companyCount: number;
  };
  companies: OpenOverdueCompany[];
};

export type UninvoicedAssignment = {
  id: string;
  workDate: string;
  cargoName: string;
  routeName: string | null;
  pickupAddress: string;
  deliveryAddress: string;
  suggestedNetCents: number | null;
};

export type UninvoicedCompany = {
  companyId: string;
  companyName: string;
  invoiceEmail: string | null;
  assignmentCount: number;
  suggestedNetCents: number;
  assignmentsWithoutPrice: number;
  assignments: UninvoicedAssignment[];
};

export type OutgoingInvoiceStatus =
  | 'draft'
  | 'finalized'
  | 'sent'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'cancelled';

export type OutgoingInvoiceKind = 'invoice' | 'credit_note' | 'cancellation';

export type OutgoingInvoiceListItem = {
  id: string;
  kind: OutgoingInvoiceKind;
  status: OutgoingInvoiceStatus;
  number: string | null;
  invoiceDate: string;
  servicePeriodStart: string;
  servicePeriodEnd: string;
  dueDate: string | null;
  netCents: number;
  taxCents: number;
  grossCents: number;
  paidCents: number;
  createdAt: string;
  company: { id: string; name: string };
  _count: { lines: number };
};

export type CreateInvoiceDraftPayload = {
  companyId: string;
  servicePeriodStart: string;
  servicePeriodEnd: string;
  assignmentIds: string[];
  manualLines?: InvoiceLinePayload[];
  invoiceDate?: string;
  paymentTermDays?: number;
  notes?: string;
};

export type CreatedInvoiceDraft = {
  id: string;
  status: OutgoingInvoiceStatus;
  number: string | null;
  netCents: number;
  grossCents: number;
};

export type InvoiceUnit = 'day' | 'hour' | 'tour' | 'km' | 'flat';

export type InvoiceTaxCategory = 'standard' | 'reduced' | 'exempt' | 'reverse_charge';

export type InvoicePaymentMethod = 'bank_transfer' | 'cash' | 'other';

export type InvoiceLine = {
  id: string;
  position: number;
  description: string;
  quantity: string;
  unit: InvoiceUnit;
  unitPriceCents: number;
  taxRateBasisPoints: number;
  taxCategory: InvoiceTaxCategory;
  netCents: number;
  taxCents: number;
  grossCents: number;
  source: 'assignment' | 'manual';
  serviceDate: string | null;
};

export type InvoicePayment = {
  id: string;
  amountCents: number;
  paidAt: string;
  method: InvoicePaymentMethod;
  reference: string | null;
  note: string | null;
  createdAt: string;
};

export type InvoiceDeliveryAttempt = {
  id: string;
  channel: string;
  recipient: string;
  succeeded: boolean;
  errorMessage: string | null;
  attemptedAt: string;
};

export type InvoiceDunningNotice = {
  id: string;
  level: number;
  feeCents: number;
  sentAt: string | null;
  dueDate: string | null;
  createdAt: string;
};

export type InvoiceTaxBreakdownEntry = {
  taxCategory: InvoiceTaxCategory;
  taxRateBasisPoints: number;
  netCents: number;
  taxCents: number;
  grossCents: number;
};

export type InvoiceDetail = {
  id: string;
  kind: OutgoingInvoiceKind;
  status: OutgoingInvoiceStatus;
  number: string | null;
  invoiceDate: string;
  servicePeriodStart: string;
  servicePeriodEnd: string;
  dueDate: string | null;
  paymentTermDays: number;
  netCents: number;
  taxCents: number;
  grossCents: number;
  paidCents: number;
  notes: string | null;
  taxBreakdown: InvoiceTaxBreakdownEntry[] | null;
  finalizedAt: string | null;
  sentAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  company: { id: string; name: string; invoiceEmail?: string | null; email?: string | null };
  lines: InvoiceLine[];
  payments: InvoicePayment[];
  deliveryAttempts: InvoiceDeliveryAttempt[];
  dunningNotices: InvoiceDunningNotice[];
};

export type InvoiceLinePayload = {
  description: string;
  quantity: string;
  unit: InvoiceUnit;
  unitPriceCents: number;
  taxRateBasisPoints: number;
  taxCategory: InvoiceTaxCategory;
  serviceDate?: string;
};

export type UpdateInvoiceDraftPayload = {
  servicePeriodStart?: string;
  servicePeriodEnd?: string;
  invoiceDate?: string;
  paymentTermDays?: number;
  notes?: string;
};

export type CreateInvoicePaymentPayload = {
  amountCents: number;
  paidAt: string;
  method: InvoicePaymentMethod;
  reference?: string;
  note?: string;
};

export type BillingProfile = {
  id: string;
  legalName: string;
  street: string;
  postalCode: string;
  city: string;
  countryCode: string;
  taxNumber: string | null;
  vatId: string | null;
  registrationNumber: string | null;
  phone: string | null;
  iban: string;
  bic: string | null;
  bankName: string | null;
  invoiceNumberFormat: string;
  defaultPaymentTermDays: number;
  defaultTaxRateBasisPoints: number;
  smallBusinessRule: boolean;
  invoiceFooterText: string | null;
  invoiceEmailCc: string | null;
  dunningEnabled: boolean;
  dunningLevel1Days: number;
  dunningLevel2Days: number;
  dunningLevel3Days: number;
  dunningLevel1FeeCents: number;
  dunningLevel2FeeCents: number;
  dunningLevel3FeeCents: number;
  datevConsultantNumber: string | null;
  datevClientNumber: string | null;
  datevChart: string;
  revenueAccount19: string;
  revenueAccount7: string;
  revenueAccount0: string;
  revenueAccountReverseCharge: string;
  debtorNumberStart: number;
};

export type UpsertBillingProfilePayload = {
  legalName: string;
  street: string;
  postalCode: string;
  city: string;
  countryCode: string;
  taxNumber?: string;
  vatId?: string;
  registrationNumber?: string;
  phone?: string;
  iban: string;
  bic?: string;
  bankName?: string;
  invoiceNumberFormat: string;
  defaultPaymentTermDays: number;
  defaultTaxRateBasisPoints: number;
  smallBusinessRule: boolean;
  invoiceFooterText?: string;
  invoiceEmailCc?: string;
  dunningEnabled: boolean;
  dunningLevel1Days: number;
  dunningLevel2Days: number;
  dunningLevel3Days: number;
  dunningLevel1FeeCents: number;
  dunningLevel2FeeCents: number;
  dunningLevel3FeeCents: number;
  datevConsultantNumber?: string;
  datevClientNumber?: string;
  datevChart?: 'SKR03' | 'SKR04';
  revenueAccount19?: string;
  revenueAccount7?: string;
  revenueAccount0?: string;
  revenueAccountReverseCharge?: string;
  debtorNumberStart?: number;
};

/**
 * Arac yakit uyumlulugu — backend sozlesmesinin aynisi.
 *
 * Kaynak: backend/prisma/schema.prisma (FuelProductType / FuelProductUsage /
 * FuelCompatibilitySource) ve
 * backend/src/fleet/fuel-stations/dto/replace-fuel-compatibility.dto.ts.
 * Degerler BUYUK HARF cunku pompadaki urun kodlari; tahmin edilmedi, sema'dan
 * alindi. Backend'e yeni bir urun eklenirse burasi da guncellenmeli — aksi
 * halde arayuz o urunu "bilinmeyen" olarak gosterir (sessizce kaybetmez).
 */
export type FuelProductType =
  | 'DIESEL'
  | 'SUPER_E5'
  | 'SUPER_E10'
  | 'SUPER_PLUS'
  | 'HVO100'
  | 'CNG'
  | 'LNG'
  | 'ELECTRICITY'
  | 'HYDROGEN'
  | 'ADBLUE';

export type FuelProductUsage = 'PRIMARY' | 'ALTERNATIVE' | 'ADDITIVE';

export type FuelCompatibilitySource = 'MANUFACTURER' | 'VIN' | 'ADMIN' | 'IMPORTED';

/** GET /vehicles/:id/fuel-compatibility -> entries[] */
export interface VehicleFuelCompatibilityEntry {
  id: string;
  productType: FuelProductType;
  usageType: FuelProductUsage;
  approved: boolean;
  source: FuelCompatibilitySource;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleFuelCompatibilityResponse {
  vehicle: { id: string; plateNumber: string };
  /** Istasyon filtresine giren urunler: approved + PRIMARY/ALTERNATIVE. */
  compatibleProducts: FuelProductType[];
  entries: VehicleFuelCompatibilityEntry[];
}

/** PUT govdesindeki tek kayit. `approved` verilmezse backend true sayar. */
export interface VehicleFuelCompatibilityWriteEntry {
  productType: FuelProductType;
  usageType: FuelProductUsage;
  approved?: boolean;
  source: FuelCompatibilitySource;
  verifiedAt?: string;
}

/**
 * Surucunun yakininda, aracina UYAN akaryakit istasyonlari.
 *
 * Kaynak: backend/src/fleet/fuel-stations/fuel-station.types.ts ve
 * fuel-station.service.ts. Tahmin edilmedi.
 */
export interface FuelStationAddress {
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  city: string | null;
}

export interface FuelStationOffering {
  productType: FuelProductType;
  /** null = saglayici fiyat vermiyor. ASLA 0 ya da "ucuz" olarak yorumlanmaz. */
  pricePerUnit: number | null;
  unit: 'liter';
  currency: 'EUR';
  /**
   * Saglayicinin bildirdigi fiyat degisim ani. Tankerkonig bunu VERMIYOR ->
   * her zaman null. Arayuz bu yuzden `retrievedAt` gosteriyor ve onu
   * "fiyatin guncellenme zamani" olarak ETIKETLEMIYOR.
   */
  updatedAt: string | null;
}

export interface NearbyFuelStation {
  id: string;
  provider: string;
  name: string;
  brand: string | null;
  address: FuelStationAddress;
  latitude: number;
  longitude: number;
  distanceKm: number | null;
  isOpen: boolean | null;
  pricesUpdatedAt: string | null;
  /** Bu yaniti saglayicidan aldigimiz an — gosterilebilir tek zaman bilgisi. */
  retrievedAt: string;
  /** Saglayici vermiyor; arayuz 'unknown' degerini GOSTERMEZ. */
  hgvAccess: 'unknown' | 'yes' | 'no';
  /** Saglayici vermiyor; arayuz null degerini GOSTERMEZ. */
  acceptedFuelCards: string[] | null;
  offerings: FuelStationOffering[];
}

/** Demo uyarisi BU ALANA gore gosterilir, frontend env degiskenine gore degil. */
export type FuelStationDataMode = 'live' | 'mock';

export interface FuelStationAttribution {
  label: string;
  url: string | null;
}

export interface NearbyFuelStationsResponse {
  /**
   * Bu aramanin OPAK secim kimligi (Faz 5).
   *
   * Yakit duragi secilirken sunucuya YALNIZCA bu ve istasyon kimligi gider.
   * Fiyat, koordinat, istasyon adi ve rota metrigi istekte GONDERILMEZ —
   * backend hepsini bu kimligin arkasindaki kendi snapshot'indan okur.
   */
  selectionContextId: string;
  /** Kimligin son gecerlilik ani; gecince arayuz "yeniden ara" der. */
  selectionContextExpiresAt: string;
  vehicle: {
    id: string;
    plateNumber: string;
    compatibleProducts: FuelProductType[];
  };
  search: { latitude: number; longitude: number; radiusKm: number };
  dataMode: FuelStationDataMode;
  attribution: FuelStationAttribution;
  /** Saglayicinin fiyat verebildigi urunler — arac onayindan bagimsiz. */
  providerSupportedProducts: FuelProductType[];
  /** Arac kabul ediyor ama saglayici fiyatlamiyor; sessizce gizlenmez. */
  unsupportedCompatibleProducts: FuelProductType[];
  stations: NearbyFuelStation[];
}

/**
 * Rota bazli istasyon onerileri (Faz 4).
 *
 * Kaynak: backend/src/fleet/fuel-stations/route-recommendation.service.ts.
 * Faz 3 istasyon alanlari KORUNUYOR; her istasyona routeMetrics ekleniyor.
 */
export type RouteMetricsStatus = 'calculated' | 'unavailable';

export interface StationRouteMetrics {
  calculationStatus: RouteMetricsStatus;
  /** Istasyona GERCEK yol mesafesi. Kus ucusu `distanceKm` ile karistirilmamali. */
  roadDistanceToStationKm: number | null;
  driveTimeToStationMin: number | null;
  viaStationDistanceKm: number | null;
  viaStationDurationMin: number | null;
  extraDistanceKm: number | null;
  extraDurationMin: number | null;
  /** Istasyona tahmini SURUS varisi; yakit alma suresi DAHIL DEGIL. */
  stationEta: string | null;
}

export type RouteCalculationStatus =
  | 'calculated'
  | 'no_active_tour'
  /** Ayni gunde birden fazla surulmekte olan tur — rastgele secim yapilmadi. */
  | 'ambiguous_active_tour'
  /** Ilk tamamlanmamis durak `arrived`: surucu zaten orada. */
  | 'current_stop_in_service'
  | 'next_stop_location_missing'
  | 'routing_unavailable';

export interface FuelRouteContext {
  mode: 'active_tour' | 'nearby_only';
  calculatedAt: string;
  /** Cozulen aktif tur; sapma hesaplanamasa da dolu olabilir. */
  tourId: string | null;
  nextStop: {
    id: string;
    sequence: number;
    label: string;
    latitude: number;
    longitude: number;
  } | null;
  /** `arrived` durumundaki mevcut durak — yalnizca gosterim, rota hedefi degil. */
  currentStop: { id: string; sequence: number; label: string } | null;
  baseline: { distanceKm: number; durationMin: number } | null;
  calculationStatus: RouteCalculationStatus;
}

export type RouteRecommendationStation = NearbyFuelStation & {
  routeMetrics: StationRouteMetrics;
};

export interface RouteRecommendationsResponse
  extends Omit<NearbyFuelStationsResponse, 'stations' | 'search' | 'vehicle'> {
  vehicle: NearbyFuelStationsResponse['vehicle'] & {
    /** null ise ekonomik toplam GOSTERILMEZ; uydurma tuketim kullanilmaz. */
    avgConsumptionLPer100Km: number | null;
  };
  search: NearbyFuelStationsResponse['search'] & { retrievedAt: string };
  routeContext: FuelRouteContext;
  stations: RouteRecommendationStation[];
}

/**
 * Gecici yakit duragi (Faz 5).
 *
 * Kaynak: backend/src/fleet/fuel-stations/fueling-intent.service.ts.
 * Bu bir TourStop DEGILDIR: musteri duraklarinin sirasina girmez, tur
 * optimizasyonunu tetiklemez ve harita numaralandirmasinda yer almaz.
 */
export type FuelingIntentStatus =
  | 'ACTIVE'
  | 'CANCELLED'
  | 'SUPERSEDED'
  /** Fis akisi (Prompt 6) icin ayrilmis; bu fazda hicbir yerden yazilmaz. */
  | 'COMPLETED'
  | 'EXPIRED';

export interface FuelingIntent {
  id: string;
  status: FuelingIntentStatus;
  driverId: string;
  vehicleId: string;
  vehiclePlateNumber: string | null;
  tourId: string | null;
  anchorTourStopId: string | null;
  station: {
    provider: string;
    providerStationId: string;
    name: string;
    brand: string | null;
    address: FuelStationAddress;
    latitude: number;
    longitude: number;
  };
  selectedFuelProduct: FuelProductType;
  /**
   * ARAMA ANINDAKI saglayici fiyati — ODENEN FIYAT DEGIL. Arayuz bunu her
   * zaman "arama anindaki fiyat" olarak etiketler; gercek tutar yakit fisinden
   * gelecek.
   */
  quotedPricePerLitre: number | null;
  priceRetrievedAt: string | null;
  attribution: FuelStationAttribution;
  plannedLitres: number | null;
  routeMode: string | null;
  extraDistanceKm: number | null;
  extraDurationMin: number | null;
  driveTimeToStationMin: number | null;
  /** Tahmini SURUS varisi; varis garantisi degil. */
  stationEta: string | null;
  routeCalculatedAt: string | null;
  selectedAt: string;
  navigationOpenedAt: string | null;
  expiresAt: string;
}

/**
 * Yakit fisi (Faz 6).
 *
 * Kaynak: backend/src/fleet/fuel-receipts/fuel-receipt.service.ts.
 * CANONICAL MODEL FleetFuelEntry — ayri bir fis tablosu YOK.
 */
export type FuelEntryWorkflowStatus =
  /** Yuklendi; surucu OCR taslagini kontrol ediyor. Mali alanlar bos olabilir. */
  | 'driver_review'
  /** Surucu dogruladi; muhasebe incelemesi bekliyor. Surucu artik degistiremez. */
  | 'submitted'
  /** Muhasebe onayladi. RAPORLARA GIREN TEK DURUM. */
  | 'approved'
  | 'rejected';

/** OCR'in TEKNIK durumu — is akisindan bagimsiz. */
export type FuelReceiptOcrStatus = 'not_requested' | 'processing' | 'succeeded' | 'failed';

/** Alan basina okuma. `confidence` null ise "bilinmiyor" — uydurma yuzde yok. */
export interface OcrField<T> {
  value: T | null;
  confidence: number | null;
}

export interface FuelReceiptExtraction {
  stationName: OcrField<string>;
  stationAddress: OcrField<string>;
  receiptNumber: OcrField<string>;
  purchasedAt: OcrField<string>;
  fuelProduct: OcrField<FuelProductType>;
  /** Canonical enum'a guvenle eslenemeyen ham yakit metni. */
  rawFuelLabel: string | null;
  liters: OcrField<number>;
  pricePerLiter: OcrField<number>;
  fuelGrossAmount: OcrField<number>;
  receiptGrossAmount: OcrField<number>;
  receiptNetAmount: OcrField<number>;
  receiptVatAmount: OcrField<number>;
  receiptVatRate: OcrField<number>;
  currency: OcrField<string>;
  paymentMethod: OcrField<string>;
  odometerKm: OcrField<number>;
  plateNumber: OcrField<string>;
  /** Fiste yakit disi kalem var mi (kahve, market, arac yikama). */
  hasNonFuelItems: boolean;
}

export interface FuelReceipt {
  id: string;
  workflowStatus: FuelEntryWorkflowStatus;
  /**
   * ETKILI muhasebe durumu (Faz 9).
   *
   * Surucu ekrani ROZETI bundan seciyor: ters kayda alinmis bir fisin
   * "Freigegeben" gorunmesi, gonderdigimiz "duzeltmeye alindi" bildirimiyle
   * celisirdi.
   */
  effectiveAccountingStatus: EffectiveAccountingStatus;
  ocrStatus: FuelReceiptOcrStatus;
  /** Demo uyarisi BU ALANA gore; frontend env degiskenine gore DEGIL. */
  ocrDataMode: string | null;
  /** Teknik olmayan hata sinifi; kullaniciya ceviri anahtariyla gosterilir. */
  ocrErrorClass: string | null;
  /** TASLAK — surucu onaylamadan canonical deger degildir. */
  ocrExtraction: FuelReceiptExtraction | null;
  vehicle: { id: string; plateNumber: string };
  fuelingIntentId: string | null;
  /** Yetkili indirme yolu; ham depolama yolu istemciye hic verilmez. */
  fileDownloadPath: string | null;
  fileName: string | null;
  mimeType: string | null;
  enteredAt: string;
  purchasedAt: string | null;
  stationName: string | null;
  stationAddress: string | null;
  receiptNumber: string | null;
  fuelProduct: FuelProductType | null;
  liters: number | null;
  pricePerLiter: number | null;
  /** YAKIT satirinin brut toplami — araca yazilan maliyet. */
  fuelGrossAmount: number | null;
  /** Fisin GENEL brut toplami — kasada odenen. Karma fiste farklidir. */
  receiptGrossAmount: number | null;
  receiptNetAmount: number | null;
  receiptVatAmount: number | null;
  receiptVatRate: number | null;
  currency: string;
  paymentMethod: string | null;
  odometerKm: number | null;
  receiptPlateNumber: string | null;
  isFullTank: boolean;
  compatibilityMismatch: boolean;
  submittedAt: string | null;
  /** Muhasebenin SON ret nedeni — surucuye gosterilir (Faz 7). */
  rejectionReason: string | null;
  rejectedAt: string | null;
  createdAt: string;
}

/** Engelleyici olmayan uyarilar da doner: yuvarlama farki kaydi ENGELLEMEZ. */
export interface FuelReceiptIssue {
  code: string;
  field: string;
  blocking: boolean;
}

export interface ConfirmFuelReceiptPayload {
  purchasedAt: string;
  fuelProduct: FuelProductType;
  liters: number;
  fuelGrossAmount: number;
  currency: string;
  pricePerLiter?: number;
  receiptGrossAmount?: number;
  receiptNetAmount?: number;
  receiptVatAmount?: number;
  receiptVatRate?: number;
  stationName?: string;
  stationAddress?: string;
  receiptNumber?: string;
  paymentMethod?: string;
  odometerKm?: number;
  receiptPlateNumber?: string;
  isFullTank?: boolean;
  /** Yalnizca yakit turu araca uymuyorken gerekir. */
  acknowledgeFuelMismatch?: boolean;
}

export interface ConfirmFuelReceiptResult {
  receipt: FuelReceipt;
  issues: FuelReceiptIssue[];
}

/** PUT /driver/fueling-intents/active govdesi — baska alan KABUL EDILMEZ. */
export interface SelectFuelingIntentPayload {
  selectionContextId: string;
  stationId: string;
  selectedFuelProduct: FuelProductType;
  plannedLitres?: number;
}

export interface SelectFuelingIntentResult {
  intent: FuelingIntent;
  /** 'unchanged': ayni secim tekrar gonderildi, yeni kayit uretilmedi. */
  outcome: 'created' | 'replaced' | 'unchanged';
  replacedIntentId: string | null;
}
