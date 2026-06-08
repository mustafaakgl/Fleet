// ─── Auth ───────────────────────────────────────────────────────────────────

export type Role = 'admin' | 'boss' | 'accounting' | 'office' | 'customer';

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
  status: DriverStatus;
  risk_level: RiskLevel;
  created_at?: string;
  updated_at?: string;
}

export interface DriverDetail extends Driver {
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
  year?: number;
  status: VehicleStatus;
  tuv_expiry_date?: string;
  sp_expiry_date?: string;
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
};

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

export type DocumentOwnerType = 'driver' | 'vehicle' | 'company' | 'request' | 'accident' | 'cargo_damage';

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
  date: string;
  service_type: string;
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
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

// ─── Dashboard ─────────────────────────────────────────────────────────────

export interface DashboardKpis {
  activeDrivers: number;
  driversOnVacation: number;
  sickDrivers: number;
  vehiclesInUse: number;
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
  revenueByCompany?: Array<{
    companyId: string;
    companyName: string;
    assignments: number;
    revenue: number;
  }>;
}

export interface DashboardChartPoint {
  label: string;
  value: number;
}

export interface DashboardChartAnalytics {
  dailyRevenue: DashboardChartPoint[];
  monthlyRevenue: DashboardChartPoint[];
  dailyAccidents: DashboardChartPoint[];
  monthlyAccidents: DashboardChartPoint[];
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
  };
}

export interface MessengerDriverSummary {
  id: string;
  firstName: string;
  lastName: string;
  userId: string | null;
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

export interface ConversationListItem {
  id: string;
  subject: string | null;
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
  assignmentId: string | null;
  companyName: string | null;
  cargoName: string | null;
}
