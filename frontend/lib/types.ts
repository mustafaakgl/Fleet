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

export type DeviceModel = 'FMC130' | 'FMC650';
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
  start_time: string;
  end_time: string;
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
  total_cost: number;
  revenue: number;
  assignment_count: number;
  margin: number;
}

export interface VehicleCostsResponse {
  period_months: number;
  from: string;
  to: string;
  fleet: {
    service_cost: number;
    fine_cost: number;
    total_cost: number;
    revenue: number;
    margin: number;
    avg_cost_per_vehicle: number;
  };
  vehicles: VehicleCostRow[];
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

export type FleetTripStatus = 'active' | 'closed';
export type FleetTelemetrySource = 'phone' | 'device' | 'api';
export type FleetDrivingEventType =
  | 'speeding'
  | 'harsh_accel'
  | 'harsh_brake'
  | 'harsh_corner'
  | 'crash';

export type TelematicsVehicleHealthStatus = 'ok' | 'warn' | 'critical';

export interface TelematicsVehicleHealthItem {
  vehicleId: string;
  plateNumber: string;
  health: TelematicsVehicleHealthStatus;
  latest: {
    rpm: number | null;
    fuelLevelPct: number | null;
    coolantTemp: number | null;
    voltage: number | null;
    odometerKm: number | null;
    ignition: boolean | null;
    recordedAt: string | null;
  };
  openDtcCount: number;
}

export interface TelematicsOpenDtcItem {
  plateNumber: string;
  code: string;
  description: string | null;
  severity: 'medium' | 'critical';
  occurredAt: string;
}

export interface TelematicsVehicleHealthResponse {
  summary: {
    ok: number;
    warn: number;
    critical: number;
  };
  vehicles: TelematicsVehicleHealthItem[];
  openDtcs: TelematicsOpenDtcItem[];
}

export interface TelematicsDriverScoreItem {
  driverId: string;
  name: string;
  score: number;
  harshCount: number;
  overspeedCount: number;
}

export interface TelematicsDriverScoresResponse {
  fleetAverage: number;
  drivers: TelematicsDriverScoreItem[];
}

export interface TelemetryHistoryPoint {
  recordedAt: string;
  speedKmh: number | null;
  rpm: number | null;
  fuelLevelPct: number | null;
  coolantTemp: number | null;
  voltage: number | null;
  odometerKm: number | null;
}

export interface TelemetryHistoryResponse {
  vehicleId: string;
  from: string;
  to: string;
  metric: 'speedKmh' | 'rpm' | 'fuelLevelPct' | 'coolantTemp' | 'voltage' | 'odometerKm' | null;
  points: TelemetryHistoryPoint[];
}

export interface TachographDddFileRow {
  id: string;
  fileType: string;
  capturedAt: string;
  storedPath?: string | null;
  sizeBytes?: number | null;
  createdAt: string;
  vehicle?: { id: string; plateNumber: string } | null;
  driver?: { id: string; firstName: string; lastName: string } | null;
}

export interface TachographDddUploadResponse {
  file: TachographDddFileRow;
  parsed: {
    ok: boolean;
    fileType: 'card' | 'vu' | 'unknown';
    driverCardNo?: string;
    vehicleVin?: string;
    activities: Array<{ state: 'driving' | 'rest' | 'work' | 'available'; startedAt: string; durationS: number }>;
    events: Array<{
      type: 'overspeed' | 'fault' | 'event';
      occurredAt: string;
      code?: string;
      speedKph?: number;
      durationS?: number;
      severity?: 'medium' | 'critical';
    }>;
    dailyTotals: Array<{
      date: string;
      drivingS: number;
      restS: number;
      workS: number;
      availableS: number;
    }>;
    warnings: string[];
  };
  infringementsCreated: number;
}

export interface FleetTripSummary {
  id: string;
  vehicleId: string;
  driverId: string;
  source: FleetTelemetrySource;
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
}

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

export type UserRole = 'admin' | 'boss' | 'accounting' | 'office' | 'driver';
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
  date: string;
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
  readByCurrentUser: boolean;
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
  text: string;
  originalLanguage: MessengerLanguage;
  targetLanguage?: MessengerLanguage;
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
  locationSource: LocationSourceType | null;
  assignmentId: string | null;
  companyName: string | null;
  cargoName: string | null;
}
