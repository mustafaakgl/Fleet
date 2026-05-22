// ─── Auth ───────────────────────────────────────────────────────────────────

export type Role = 'admin' | 'boss' | 'accounting' | 'office';

export type Department = 'executive' | 'fleet' | 'payroll' | 'accident' | 'hr' | 'driver_ops';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  department?: Department;
  language?: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: AuthUser;
}

// ─── Driver ─────────────────────────────────────────────────────────────────

export type DriverStatus = 'active' | 'inactive' | 'on_leave' | 'sick' | 'terminated';
export type RiskLevel = 'green' | 'yellow' | 'red';

export interface Driver {
  id: string;
  first_name: string;
  last_name: string;
  accident_count: number;
  email?: string;
  phone?: string;
  license_number?: string;
  license_expiry_date?: string;
  passport_number?: string;
  passport_expiry_date?: string;
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

export type VehicleStatus = 'active' | 'inactive' | 'broken' | 'in_service' | 'sold';

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

// ─── Assignment ───────────────────────────────────────────────────────────────

export type AssignmentStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled';

export interface Assignment {
  id: string;
  driver: { id: string; name: string };
  vehicle: { id: string; plate_number: string };
  company_name: string;
  work_date: string;
  start_time: string;
  end_time: string;
  notes?: string;
  status: AssignmentStatus;
}

// ─── Vehicle Handover ──────────────────────────────────────────────────────

export type VehicleHandoverType = 'pickup' | 'return';

export type VehicleHandoverPhotoStatus =
  | 'not_required'
  | 'missing'
  | 'submitted'
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
  fileUrl?: string;
  expiryDate?: string;
  uploadedAt: string;
  status: 'valid' | 'expiring_soon' | 'expired' | 'missing';
  notes?: string;
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

export interface DashboardSummary {
  total_drivers: number;
  active_drivers: number;
  total_vehicles: number;
  active_vehicles: number;
  today_assignments: number;
  upcoming_reminders: number;
}
