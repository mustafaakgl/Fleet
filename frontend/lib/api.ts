import axios from 'axios';
import { clearAuth } from './auth';
import type {
  AuthResponse,
  MfaSetupResponse,
  MfaStatus,
  DashboardSummary,
  DashboardRevenueAnalytics,
  Driver,
  DriverDetail,
  PaginatedDrivers,
  Vehicle,
  VehicleDetail,
  PaginatedVehicles,
  Assignment,
  AssignmentWritePayload,
  PaginatedAssignments,
  Company,
  CompanyDetail,
  PaginatedCompanies,
  User,
  CalendarEvent,
  TransportRequest,
  CompanyEmail,
  LeaveRequest,
  MorningCheckin,
  ServiceRecord,
  Reminder,
  Notification,
  Document,
  ConversationListItem,
  ConversationDetail,
  MessengerMessage,
  SendMessagePayload,
  MessengerUnreadCount,
  LiveTrackingItem,
  CustomerDashboardStats,
  CustomerAssignment,
  PaginatedCustomerAssignments,
  CustomerPortalMe,
  CustomerAssignmentMessage,
} from './types';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
});

// ─── Request interceptor: attach JWT ────────────────────────────────────────
api.interceptors.request.use((config) => {
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    // Let the browser set multipart boundary automatically.
    if (config.headers && typeof (config.headers as { set?: (name: string, value: string | undefined) => void }).set === 'function') {
      (config.headers as { set: (name: string, value: string | undefined) => void }).set('Content-Type', undefined);
    } else if (config.headers) {
      delete (config.headers as Record<string, unknown>)['Content-Type'];
    }
  }

  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Response interceptor: handle 401/403 ──────────────────────────────────
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error.response?.status;
    if (status === 401) {
      clearAuth();
      const path = typeof window !== 'undefined' ? window.location.pathname : '';
      if (
        path
        && !path.startsWith('/login')
        && !path.startsWith('/reset-password')
        && !path.startsWith('/accept-invite')
        && !path.startsWith('/onboarding')
      ) {
        window.location.href = '/login';
      }
    } else if (status === 403 && typeof window !== 'undefined') {
      // Surface a one-time toast so silent forbidden errors don't confuse the user.
      const detail =
        (error.response?.data as { message?: string | string[] } | undefined)?.message;
      const msg = Array.isArray(detail) ? detail.join('. ') : (detail ?? 'You do not have permission to perform this action.');
      // Use a session-scoped flag to avoid spamming the user during cascaded calls.
      const key = '__forbidden_toast_shown__';
      const win = window as unknown as Record<string, unknown>;
      if (!win[key]) {
        win[key] = true;
        window.setTimeout(() => { win[key] = false; }, 3000);
        window.alert(`Forbidden: ${msg}`);
      }
    }
    return Promise.reject(error);
  },
);

// ─── Auth ───────────────────────────────────────────────────────────────────

export const authApi = {
  signIn: (email: string, password: string) =>
    api.post<AuthResponse>('/auth/login', { email, password }).then((r) => r.data),

  me: () =>
    api
      .get<NonNullable<AuthResponse['user']> & { mfa_enabled?: boolean }>('/auth/me')
      .then((r) => r.data),

  meWithToken: (token: string) =>
    api
      .get<NonNullable<AuthResponse['user']> & { mfa_enabled?: boolean }>('/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((r) => r.data),

  oidcConfig: () =>
    api.get<{ enabled: boolean; label: string }>('/auth/oidc/config').then((r) => r.data),

  oidcLoginUrl: () => `${BASE_URL}/auth/oidc/login`,

  oidcExchange: (code: string) =>
    api.post<AuthResponse>('/auth/oidc/exchange', { code }).then((r) => r.data),

  requestPasswordReset: (userId: string) =>
    api
      .post<{ reset_url: string; expires_at: string; user_email: string }>(
        '/auth/password-reset/request',
        { user_id: userId },
      )
      .then((r) => r.data),

  validatePasswordReset: (token: string) =>
    api
      .get<{ valid: boolean; email?: string; expires_at?: string }>(
        '/auth/password-reset/validate',
        { params: { token } },
      )
      .then((r) => r.data),

  confirmPasswordReset: (token: string, password: string) =>
    api
      .post<{ success: boolean }>('/auth/password-reset/confirm', { token, password })
      .then((r) => r.data),

  forgotPassword: (email: string) =>
    api
      .post<{ success: boolean; message: string }>('/auth/password-reset/forgot', { email })
      .then((r) => r.data),

  signup: (data: {
    fleet_name: string;
    admin_full_name: string;
    admin_email: string;
    admin_password: string;
    contact_email?: string;
  }) =>
    api
      .post<{ tenant: TenantProfile; admin: { id: string; email: string; full_name: string } }>(
        '/auth/signup',
        data,
      )
      .then((r) => r.data),

  verifyMfaLogin: (mfaToken: string, code: string) =>
    api
      .post<AuthResponse>('/auth/mfa/verify-login', { mfa_token: mfaToken, code })
      .then((r) => r.data),

  mfaStatus: () => api.get<MfaStatus>('/auth/mfa/status').then((r) => r.data),

  mfaSetup: () => api.post<MfaSetupResponse>('/auth/mfa/setup').then((r) => r.data),

  mfaConfirm: (code: string) =>
    api.post<{ success: boolean; mfa_enabled: boolean }>('/auth/mfa/confirm', { code }).then((r) => r.data),

  mfaDisable: (password: string, code: string) =>
    api
      .post<{ success: boolean; mfa_enabled: boolean }>('/auth/mfa/disable', { password, code })
      .then((r) => r.data),
};

// ─── Audit logs (admin) ───────────────────────────────────────────────────────

export interface AuditLogRow {
  id: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary?: string | null;
  createdAt: string;
  actorUser?: {
    id: string;
    fullName: string;
    email: string;
    role: string;
  } | null;
}

export interface PaginatedAuditLogs {
  data: AuditLogRow[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export const auditApi = {
  listPage: (params?: {
    actorUserId?: string;
    action?: string;
    entityType?: string;
    entityId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) => api.get<PaginatedAuditLogs>('/audit-logs', { params }).then((r) => r.data),

  list: (params?: {
    actorUserId?: string;
    action?: string;
    entityType?: string;
    entityId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) => auditApi.listPage(params).then((r) => r.data),

  exportCsv: (params?: {
    actorUserId?: string;
    action?: string;
    entityType?: string;
    entityId?: string;
    dateFrom?: string;
    dateTo?: string;
  }) =>
    api.get<string>('/audit-logs/export', { params, responseType: 'text' }).then((r) => r.data),
};

// ─── Privacy / DSGVO (admin) ──────────────────────────────────────────────────

export interface DriverAnonymizeResult {
  driver_id: string;
  anonymized_at: string;
  removed: {
    personal_fields: boolean;
    documents: number;
    location_history: boolean;
    linked_user_deactivated: boolean;
  };
  retained: {
    assignments: boolean;
    legal_basis: string;
  };
}

export interface UserAnonymizeResult {
  user_id: string;
  anonymized_at: string;
  removed: {
    personal_fields: boolean;
    notifications: number;
    password_reset_tokens: number;
    company_memberships: number;
    messages_anonymized: number;
    linked_driver_anonymized: boolean;
  };
  retained: {
    assignments_created: boolean;
    audit_logs: boolean;
    legal_basis: string;
  };
}

export const privacyApi = {
  exportDriver: (id: string) =>
    api.get<Blob>(`/privacy/export/driver/${id}`, { responseType: 'blob' }).then((r) => r.data),

  exportUser: (id: string) =>
    api.get<Blob>(`/privacy/export/user/${id}`, { responseType: 'blob' }).then((r) => r.data),

  anonymizeDriver: (id: string, reason: string) =>
    api
      .post<DriverAnonymizeResult>(`/privacy/delete/driver/${id}`, {
        confirm: 'DELETE',
        reason,
      })
      .then((r) => r.data),

  anonymizeUser: (id: string, reason: string) =>
    api
      .post<UserAnonymizeResult>(`/privacy/delete/user/${id}`, {
        confirm: 'DELETE',
        reason,
      })
      .then((r) => r.data),
};

// ─── Customer Portal ────────────────────────────────────────────────────────

export interface CustomerAssignmentListParams {
  status?: string;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export const customerPortalApi = {
  getMe: () => api.get<CustomerPortalMe>('/customer/me').then((r) => r.data),

  getDashboard: () => api.get<CustomerDashboardStats>('/customer/dashboard').then((r) => r.data),

  getAssignments: (params?: CustomerAssignmentListParams) =>
    api.get<PaginatedCustomerAssignments>('/customer/assignments', { params }).then((r) => r.data),

  getAssignment: (id: string) =>
    api.get<CustomerAssignment>(`/customer/assignments/${id}`).then((r) => r.data),

  listProofs: (assignmentId: string) =>
    api.get<Document[]>(`/customer/assignments/${assignmentId}/proofs`).then((r) => r.data),

  uploadProof: (assignmentId: string, formData: FormData) =>
    api
      .post<Document>(`/customer/assignments/${assignmentId}/proofs`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data),

  listMessages: (assignmentId: string) =>
    api
      .get<CustomerAssignmentMessage[]>(`/customer/assignments/${assignmentId}/messages`)
      .then((r) => r.data),

  sendMessage: (assignmentId: string, body: string) =>
    api
      .post<CustomerAssignmentMessage>(`/customer/assignments/${assignmentId}/messages`, { body })
      .then((r) => r.data),
};

// ─── Dashboard ───────────────────────────────────────────────────────────────

export const dashboardApi = {
  getSummary: () => api.get<DashboardSummary>('/dashboard').then((r) => r.data),

  // Financial-roles only: standalone revenue analytics for a given date.
  getRevenueAnalytics: (date?: string) =>
    api
      .get<DashboardRevenueAnalytics | null>('/dashboard/revenue-analytics', { params: { date } })
      .then((r) => r.data),
};

// ─── Drivers ─────────────────────────────────────────────────────────────────

export interface DriverListParams {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface DriverRiskSummary {
  driver_id: string;
  driver_name: string;
  stored_risk_level: string;
  computed_risk_level: string;
  points: number;
  breakdown: {
    vehicle_accidents_6m: number;
    cargo_damages_6m: number;
    open_incidents: number;
  };
}

export const driversApi = {
  list: (params?: DriverListParams) =>
    api.get<PaginatedDrivers>('/drivers', { params }).then((r) => r.data),

  getById: (id: string) => api.get<DriverDetail>(`/drivers/${id}`).then((r) => r.data),

  create: (data: Partial<Driver>) => api.post<Driver>('/drivers', data).then((r) => r.data),

  update: (id: string, data: Partial<Driver>) =>
    api.patch<Driver>(`/drivers/${id}`, data).then((r) => r.data),

  deactivate: (id: string) => api.delete(`/drivers/${id}`).then((r) => r.data),

  getHandovers: (id: string) =>
    api.get<unknown[]>(`/drivers/${id}/handovers`).then((r) => r.data),

  getIncidents: (id: string) =>
    api.get<unknown[]>(`/drivers/${id}/incidents`).then((r) => r.data),

  getRisk: (id: string) =>
    api.get<DriverRiskSummary>(`/drivers/${id}/risk`).then((r) => r.data),
};

// ─── Vehicles ─────────────────────────────────────────────────────────────────

export interface VehicleListParams {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export const vehiclesApi = {
  list: (params?: VehicleListParams) =>
    api.get<PaginatedVehicles>('/vehicles', { params }).then((r) => r.data),

  getById: (id: string) => api.get<VehicleDetail>(`/vehicles/${id}`).then((r) => r.data),

  create: (data: Partial<Vehicle>) => api.post<Vehicle>('/vehicles', data).then((r) => r.data),

  update: (id: string, data: Partial<Vehicle>) =>
    api.patch<Vehicle>(`/vehicles/${id}`, data).then((r) => r.data),

  deactivate: (id: string) => api.delete(`/vehicles/${id}`).then((r) => r.data),

  getAssignments: (id: string, params?: { from?: string; to?: string; status?: string }) =>
    api.get<unknown[]>(`/vehicles/${id}/assignments`, { params }).then((r) => r.data),

  getHandovers: (id: string) =>
    api.get<unknown[]>(`/vehicles/${id}/handovers`).then((r) => r.data),

  getIncidents: (id: string) =>
    api.get<unknown[]>(`/vehicles/${id}/incidents`).then((r) => r.data),

  uploadPhoto: (id: string, formData: FormData) =>
    api.post<Vehicle>(`/vehicles/${id}/photo`, formData).then((r) => r.data),

  listEquipment: (id: string, status?: 'active' | 'retired') =>
    api.get<VehicleEquipmentItem[]>(`/vehicles/${id}/equipment`, { params: { status } }).then((r) => r.data),

  createEquipment: (
    id: string,
    data: { name: string; quantity?: number; serialNumber?: string; notes?: string },
  ) => api.post<VehicleEquipmentItem>(`/vehicles/${id}/equipment`, data).then((r) => r.data),

  updateEquipment: (
    vehicleId: string,
    equipmentId: string,
    data: Partial<{ name: string; quantity: number; serialNumber: string | null; notes: string | null; status: 'active' | 'retired' }>,
  ) => api.patch<VehicleEquipmentItem>(`/vehicles/${vehicleId}/equipment/${equipmentId}`, data).then((r) => r.data),

  removeEquipment: (vehicleId: string, equipmentId: string) =>
    api.delete<{ id: string; deleted: boolean }>(`/vehicles/${vehicleId}/equipment/${equipmentId}`).then((r) => r.data),
};

export interface VehicleEquipmentItem {
  id: string;
  vehicleId: string;
  name: string;
  quantity: number;
  serialNumber?: string | null;
  notes?: string | null;
  status: 'active' | 'retired';
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkSessionRow {
  id: string;
  driverId: string;
  startedAt: string;
  endedAt?: string | null;
  endReason?: 'manual' | 'app_background' | 'logout' | null;
  status: 'active' | 'ended';
  driver?: { id: string; firstName: string; lastName: string; employeeNumber: string };
}

export const workSessionsApi = {
  list: (params?: { driver_id?: string; date_from?: string; date_to?: string; status?: 'active' | 'ended' }) =>
    api.get<WorkSessionRow[]>('/work-sessions', { params }).then((r) => r.data),
};

// ─── Companies ───────────────────────────────────────────────────────────────

export interface CompanyListParams {
  search?: string;
  page?: number;
  limit?: number;
}

export interface CompanyStats {
  active_assignments: number;
  total_assignments: number;
  current_drivers: number;
  current_vehicles: number;
  last_assignment_date: string | null;
}

export const companiesApi = {
  list: (params?: CompanyListParams) =>
    api.get<PaginatedCompanies>('/companies', { params }).then((r) => r.data),

  getById: (id: string) =>
    api.get<CompanyDetail>(`/companies/${id}`).then((r) => r.data),

  create: (data: Partial<Company>) =>
    api.post<Company>('/companies', data).then((r) => r.data),

  update: (id: string, data: Partial<Company>) =>
    api.patch<Company>(`/companies/${id}`, data).then((r) => r.data),

  remove: (id: string) =>
    api.delete<{ id: string; deleted: boolean }>(`/companies/${id}`).then((r) => r.data),

  getAssignments: (id: string, params?: { from?: string; to?: string; status?: string }) =>
    api.get<unknown[]>(`/companies/${id}/assignments`, { params }).then((r) => r.data),

  getEmailHistory: (id: string, params?: { status?: string }) =>
    api.get<CompanyEmail[]>(`/companies/${id}/email-history`, { params }).then((r) => r.data),

  getStats: (id: string) =>
    api.get<CompanyStats>(`/companies/${id}/stats`).then((r) => r.data),
};

// ─── Assignments ─────────────────────────────────────────────────────────────

export interface AssignmentListParams {
  date?: string;
  driver_id?: string;
  vehicle_id?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export const assignmentsApi = {
  list: (params?: AssignmentListParams) =>
    api.get<PaginatedAssignments>('/assignments', { params }).then((r) => r.data),

  getById: (id: string) =>
    api.get<Assignment>(`/assignments/${id}`).then((r) => r.data),

  create: (data: AssignmentWritePayload) =>
    api.post<Assignment>('/assignments', data).then((r) => r.data),

  update: (id: string, data: AssignmentWritePayload) =>
    api.patch<Assignment>(`/assignments/${id}`, data).then((r) => r.data),

  cancel: (id: string) =>
    api.post(`/assignments/${id}/cancel`).then((r) => r.data),

  transition: (id: string, to: 'confirmed' | 'in_progress' | 'completed') =>
    api.post<Assignment>(`/assignments/${id}/transition`, { to }).then((r) => r.data),

  listCustomerMessages: (id: string) =>
    api.get<CustomerAssignmentMessage[]>(`/assignments/${id}/customer-messages`).then((r) => r.data),

  sendCustomerMessage: (id: string, body: string) =>
    api
      .post<CustomerAssignmentMessage>(`/assignments/${id}/customer-messages`, { body })
      .then((r) => r.data),
};

// ─── Morning check-ins ───────────────────────────────────────────────────────

export interface MorningCheckinListParams {
  date?: string;
  driver_id?: string;
  status?: string;
}

export const morningCheckinsApi = {
  list: (params?: MorningCheckinListParams) =>
    api.get<MorningCheckin[]>('/morning-checkins', { params }).then((r) => r.data),

  getById: (id: string) =>
    api.get<MorningCheckin>(`/morning-checkins/${id}`).then((r) => r.data),

  create: (data: {
    driver_id: string;
    date: string;
    vehicle_plate?: string;
    company_name?: string;
    status?: string;
    notes?: string;
  }) => api.post<MorningCheckin>('/morning-checkins', data).then((r) => r.data),

  update: (id: string, data: {
    vehicle_plate?: string;
    company_name?: string;
    status?: string;
    conflict_reason?: string;
    notes?: string;
  }) => api.patch<MorningCheckin>(`/morning-checkins/${id}`, data).then((r) => r.data),

  addToEinsatzplan: (id: string) =>
    api.post<{ checkin: MorningCheckin; assignment: unknown }>(
      `/morning-checkins/${id}/add-to-einsatzplan`,
    ).then((r) => r.data),
};

// ─── Service records (vehicle maintenance history) ───────────────────────────

export interface ServiceRecordListParams {
  vehicle_id?: string;
  from?: string;
  to?: string;
  repair_company?: string;
}

export const serviceRecordsApi = {
  list: (params?: ServiceRecordListParams) =>
    api.get<ServiceRecord[]>('/service-records', { params }).then((r) => r.data),

  getById: (id: string) =>
    api.get<ServiceRecord>(`/service-records/${id}`).then((r) => r.data),

  getRepairCompanies: () =>
    api.get<string[]>('/service-records/repair-companies').then((r) => r.data),

  create: (data: {
    vehicle_id: string;
    driver_id?: string;
    date: string;
    service_type: string;
    vendor?: string;
    repair_company?: string;
    cost_amount: number;
    mileage_km?: number;
    notes?: string;
  }) => api.post<ServiceRecord>('/service-records', data).then((r) => r.data),

  update: (
    id: string,
    data: Partial<
      Pick<
        ServiceRecord,
        'service_type' | 'notes' | 'date' | 'vendor' | 'repair_company' | 'cost_amount' | 'mileage_km' | 'driver_id'
      >
    > & { vehicle_id?: string },
  ) => api.patch<ServiceRecord>(`/service-records/${id}`, data).then((r) => r.data),

  remove: (id: string) =>
    api.delete<{ id: string; deleted: boolean }>(`/service-records/${id}`).then((r) => r.data),
};

// ─── Vehicle handovers ───────────────────────────────────────────────────────

export interface VehicleHandoverRecord {
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
  driver?: { id: string; firstName: string; lastName: string };
  vehicle?: { id: string; plateNumber: string };
}

export interface CreateVehicleHandoverInput {
  driverId: string;
  vehicleId: string;
  previousVehicleId?: string;
  assignmentId?: string;
  handoverType: 'pickup' | 'return';
  handoverDateTime: string;
  damageDetected?: boolean;
  damageNotes?: string;
  notes?: string;
}

export const vehicleHandoversApi = {
  list: () =>
    api.get<VehicleHandoverRecord[]>('/vehicle-handovers').then((r) => r.data),

  getById: (id: string) =>
    api.get<VehicleHandoverRecord>(`/vehicle-handovers/${id}`).then((r) => r.data),

  create: (data: CreateVehicleHandoverInput) =>
    api.post<VehicleHandoverRecord>('/vehicle-handovers', data).then((r) => r.data),

  createFromAssignment: (assignmentId: string) =>
    api
      .post<VehicleHandoverRecord>(`/vehicle-handovers/from-assignment/${assignmentId}`)
      .then((r) => r.data),

  update: (id: string, data: Partial<VehicleHandoverRecord>) =>
    api.patch<VehicleHandoverRecord>(`/vehicle-handovers/${id}`, data).then((r) => r.data),

  approvePhoto: (id: string) =>
    api.post<VehicleHandoverRecord>(`/vehicle-handovers/${id}/approve-photo`).then((r) => r.data),

  rejectPhoto: (id: string) =>
    api.post<VehicleHandoverRecord>(`/vehicle-handovers/${id}/reject-photo`).then((r) => r.data),

  complete: (id: string) =>
    api.post<VehicleHandoverRecord>(`/vehicle-handovers/${id}/complete`).then((r) => r.data),
};

// ─── Search ──────────────────────────────────────────────────────────────────

export interface SearchResult {
  type: 'driver' | 'vehicle' | 'company' | 'document' | 'assignment' | 'transport_request';
  id: string;
  title: string;
  subtitle: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
}

export const searchApi = {
  query: (q: string) =>
    api.get<SearchResponse>('/search', { params: { q } }).then((r) => r.data),
};

// ─── Accidents (vehicle accidents + cargo damages) ───────────────────────────

export interface AccidentListParams {
  type?: 'vehicle_accident' | 'cargo_damage';
  status?: string;
}

export const accidentsApi = {
  list: (params?: AccidentListParams) =>
    api.get<unknown[]>('/accidents', { params }).then((r) => r.data),

  listByDriver: (driverId: string, params?: AccidentListParams) =>
    api.get<unknown[]>(`/accidents/driver/${driverId}`, { params }).then((r) => r.data),

  listByVehicle: (vehicleId: string, params?: AccidentListParams) =>
    api.get<unknown[]>(`/accidents/vehicle/${vehicleId}`, { params }).then((r) => r.data),

  listByCompany: (companyId: string, params?: AccidentListParams) =>
    api.get<unknown[]>(`/accidents/company/${companyId}`, { params }).then((r) => r.data),

  getById: (id: string) => api.get<unknown>(`/accidents/${id}`).then((r) => r.data),

  create: (data: Record<string, unknown>) =>
    api.post<unknown>('/accidents', data).then((r) => r.data),

  update: (id: string, data: Record<string, unknown>) =>
    api.patch<unknown>(`/accidents/${id}`, data).then((r) => r.data),

  updateStatus: (id: string, status: string) =>
    api.patch<unknown>(`/accidents/${id}/status`, { status }).then((r) => r.data),

  recalculateRisk: (driverId: string) =>
    api.post<unknown>(`/accidents/recalculate-risk/${driverId}`).then((r) => r.data),
};

// ─── Reminders ────────────────────────────────────────────────────────────────

export interface ReminderListParams {
  status?: string;
  due_before?: string;
}

export const remindersApi = {
  list: (params?: ReminderListParams) =>
    api.get<Reminder[]>('/reminders', { params }).then((r) => r.data),

  resolve: (id: string) => api.post(`/reminders/${id}/resolve`).then((r) => r.data),

  ignore: (id: string) => api.post(`/reminders/${id}/ignore`).then((r) => r.data),

  generate: () => api.post('/reminders/generate').then((r) => r.data),
};

// ─── Notifications ────────────────────────────────────────────────────────────

export const notificationsApi = {
  list: () => api.get<Notification[]>('/notifications').then((r) => r.data),

  getUnreadCount: () =>
    api.get<{ count: number }>('/notifications/unread-count').then((r) => r.data),

  markRead: (id: string) => api.post(`/notifications/${id}/read`).then((r) => r.data),

  markAllRead: () => api.post('/notifications/read-all').then((r) => r.data),
};

// ─── Messenger ───────────────────────────────────────────────────────────────

export interface MessengerConversationListParams {
  driverId?: string;
  status?: string;
  search?: string;
  department?: string;
}

export interface MessengerListMessagesParams {
  since?: string;
  afterId?: string;
  limit?: number;
}

export const messengerApi = {
  listConversations: (params?: MessengerConversationListParams) =>
    api.get<ConversationListItem[]>('/messenger/conversations', { params }).then((r) => r.data),

  createConversation: (driverId: string, subject?: string, department?: string) =>
    api
      .post<ConversationDetail>('/messenger/conversations', { driverId, subject, department })
      .then((r) => r.data),

  getConversation: (id: string) =>
    api.get<ConversationDetail>(`/messenger/conversations/${id}`).then((r) => r.data),

  listMessages: (conversationId: string, params?: MessengerListMessagesParams) =>
    api
      .get<MessengerMessage[]>(`/messenger/conversations/${conversationId}/messages`, { params })
      .then((r) => r.data),

  sendMessage: (conversationId: string, payload: SendMessagePayload) =>
    api
      .post<MessengerMessage>(`/messenger/conversations/${conversationId}/messages`, payload)
      .then((r) => r.data),

  markConversationRead: (conversationId: string) =>
    api.post(`/messenger/conversations/${conversationId}/read`).then((r) => r.data),

  getUnreadCount: () =>
    api.get<MessengerUnreadCount>('/messenger/unread-count').then((r) => r.data),
};

// ─── Users (admin) ────────────────────────────────────────────────────────────

export interface UserListParams {
  role?: string;
  status?: string;
  search?: string;
}

export const usersApi = {
  list: (params?: UserListParams) =>
    api.get<{ data: User[] }>('/users', { params }).then((r) => r.data),

  getById: (id: string) => api.get<User>(`/users/${id}`).then((r) => r.data),

  create: (data: Partial<User> & { password: string }) =>
    api.post<User>('/users', data).then((r) => r.data),

  update: (id: string, data: Partial<User> & { password?: string }) =>
    api.patch<User>(`/users/${id}`, data).then((r) => r.data),

  deactivate: (id: string) => api.delete<User>(`/users/${id}`).then((r) => r.data),
};

// ─── Calendar ─────────────────────────────────────────────────────────────────

export interface CalendarListParams {
  driver_id?: string;
  from?: string;
  to?: string;
}

export const calendarApi = {
  list: (params?: CalendarListParams) =>
    api.get<CalendarEvent[]>('/calendar', { params }).then((r) => r.data),

  driverCalendar: (driverId: string) =>
    api.get<CalendarEvent[]>(`/calendar/driver/${driverId}`).then((r) => r.data),

  create: (data: {
    driver_id: string;
    date: string;
    status: string;
    assignment_id?: string;
    ui_status?: string;
  }) => api.post<CalendarEvent>('/calendar', data).then((r) => r.data),

  remove: (id: string) =>
    api.delete<{ id: string; deleted: boolean }>(`/calendar/${id}`).then((r) => r.data),
};

// ─── Transport requests ───────────────────────────────────────────────────────

export interface TransportRequestListParams {
  status?: string;
  driver_id?: string;
  date?: string;
}

export const transportRequestsApi = {
  list: (params?: TransportRequestListParams) =>
    api.get<TransportRequest[]>('/transport-requests', { params }).then((r) => r.data),

  getById: (id: string) => api.get<TransportRequest>(`/transport-requests/${id}`).then((r) => r.data),

  create: (data: Partial<TransportRequest> & {
    driver_id: string;
    vehicle_id: string;
    company_id: string;
    cargo_name: string;
    cargo_owner: string;
    pickup_address: string;
    delivery_address: string;
    requested_date: string;
    start_time: string;
    end_time: string;
  }) => api.post<TransportRequest>('/transport-requests', data).then((r) => r.data),

  approve: (id: string) =>
    api.post<{ request: TransportRequest; assignment: Assignment }>(
      `/transport-requests/${id}/approve`,
    ).then((r) => r.data),

  reject: (id: string, reason?: string) =>
    api.post<TransportRequest>(`/transport-requests/${id}/reject`, { reason }).then((r) => r.data),
};

// ─── Leave requests (vacation/sick/...) ──────────────────────────────────────

export interface LeaveRequestListParams {
  driver_id?: string;
  status?: string;
  type?: string;
}

export const leaveRequestsApi = {
  list: (params?: LeaveRequestListParams) =>
    api.get<LeaveRequest[]>('/leave-requests', { params }).then((r) => r.data),

  getById: (id: string) =>
    api.get<LeaveRequest>(`/leave-requests/${id}`).then((r) => r.data),

  create: (data: {
    driver_id: string;
    type: string;
    start_date: string;
    end_date: string;
    reason?: string;
  }) => api.post<LeaveRequest>('/leave-requests', data).then((r) => r.data),

  approve: (id: string) =>
    api.post(`/leave-requests/${id}/approve`).then((r) => r.data),

  reject: (id: string) =>
    api.post<LeaveRequest>(`/leave-requests/${id}/reject`).then((r) => r.data),

  cancel: (id: string) =>
    api.post<LeaveRequest>(`/leave-requests/${id}/cancel`).then((r) => r.data),

  needsReview: (id: string) =>
    api.post<LeaveRequest>(`/leave-requests/${id}/needs-review`).then((r) => r.data),
};

// ─── Company emails ───────────────────────────────────────────────────────────

export interface CompanyEmailListParams {
  companyId?: string;
  date?: string;
  status?: string;
}

export const companyEmailsApi = {
  list: (params?: CompanyEmailListParams) =>
    api.get<CompanyEmail[]>('/company-emails', { params }).then((r) => r.data),

  getById: (id: string) => api.get<CompanyEmail>(`/company-emails/${id}`).then((r) => r.data),

  generateForDate: (date: string) =>
    api.post<CompanyEmail[]>('/company-emails/generate-for-date', { date }).then((r) => r.data),

  generateForCompany: (date: string, companyId: string) =>
    api.post<CompanyEmail>('/company-emails/generate', { date, companyId }).then((r) => r.data),

  update: (id: string, data: { subject?: string; body?: string; status?: string }) =>
    api.patch<CompanyEmail>(`/company-emails/${id}`, data).then((r) => r.data),

  markDraftReady: (id: string) =>
    api.post<CompanyEmail>(`/company-emails/${id}/mark-draft-ready`).then((r) => r.data),

  markSent: (id: string) =>
    api.post<CompanyEmail>(`/company-emails/${id}/mark-sent`).then((r) => r.data),

  markFailed: (id: string) =>
    api.post<CompanyEmail>(`/company-emails/${id}/mark-failed`).then((r) => r.data),

  send: (id: string) =>
    api
      .post<{ email: CompanyEmail; mail_sent: boolean; mail_mode: 'smtp' | 'log' }>(
        `/company-emails/${id}/send`,
      )
      .then((r) => r.data),
};

// ─── Onboarding ───────────────────────────────────────────────────────────────

export interface TenantProfile {
  id: string;
  name: string;
  slug: string;
  status: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  language: string;
  created_at: string;
  updated_at: string;
}

export const onboardingApi = {
  status: () =>
    api
      .get<{ needs_setup: boolean; tenant: TenantProfile | null }>('/onboarding/status')
      .then((r) => r.data),

  setup: (data: {
    fleet_name: string;
    slug?: string;
    contact_email?: string;
    contact_phone?: string;
    address?: string;
    admin_full_name: string;
    admin_email: string;
    admin_password: string;
  }) =>
    api
      .post<{ tenant: TenantProfile; admin: { id: string; email: string; full_name: string; role: string } }>(
        '/onboarding/setup',
        data,
      )
      .then((r) => r.data),

  getTenant: () => api.get<TenantProfile>('/onboarding/tenant').then((r) => r.data),

  updateTenant: (data: {
    fleet_name?: string;
    contact_email?: string;
    contact_phone?: string;
    address?: string;
    language?: string;
  }) => api.patch<TenantProfile>('/onboarding/tenant', data).then((r) => r.data),

  getProgress: () =>
    api
      .get<{
        smtp_enabled: boolean;
        progress_percent: number;
        complete: boolean;
        counts: {
          users: number;
          drivers: number;
          vehicles: number;
          companies: number;
          assignments: number;
          pending_invitations: number;
        };
        steps: Array<{ id: string; complete: boolean; href: string }>;
        tenant: TenantProfile;
      }>('/onboarding/progress')
      .then((r) => r.data),
};

export const mailApi = {
  sendTest: () =>
    api
      .post<{ sent: boolean; mode: string; to: string; smtp_enabled: boolean }>('/mail/test')
      .then((r) => r.data),
};

// ─── Fleet Ops (platform admin) ─────────────────────────────────────────────

export interface FleetOpsTenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  contact_email?: string;
  created_at: string;
  counts: { users: number; drivers: number; vehicles: number };
  subscription?: { plan: string; status: string; billing_mode: string };
}

export const fleetOpsApi = {
  listTenants: () => api.get<FleetOpsTenant[]>('/fleet-ops/tenants').then((r) => r.data),

  provisionTenant: (data: {
    fleet_name: string;
    slug?: string;
    contact_email?: string;
    contact_phone?: string;
    address?: string;
    admin_full_name: string;
    admin_email: string;
    admin_password: string;
  }) =>
    api
      .post<{
        tenant: TenantProfile;
        admin: { id: string; email: string; full_name: string; role: string };
        welcome_mail_sent: boolean;
        mail_mode: string;
      }>('/fleet-ops/tenants', data)
      .then((r) => r.data),

  updateTenantStatus: (tenantId: string, status: string) =>
    api
      .patch<{ id: string; name: string; slug: string; status: string }>(
        `/fleet-ops/tenants/${tenantId}/status`,
        { status },
      )
      .then((r) => r.data),
};

// ─── Invitations ──────────────────────────────────────────────────────────────

export interface UserInvitation {
  id: string;
  email: string;
  full_name: string;
  role: string;
  language: string;
  status: string;
  expires_at: string;
  accepted_at?: string;
  created_at: string;
}

export const invitationsApi = {
  list: () =>
    api.get<{ data: UserInvitation[] }>('/invitations').then((r) => r.data.data),

  create: (data: { full_name: string; email: string; role: string; language?: string }) =>
    api
      .post<{
        invitation: UserInvitation;
        invite_url: string;
        expires_at: string;
        mail_sent: boolean;
        mail_mode: 'smtp' | 'log';
      }>('/invitations', data)
      .then((r) => r.data),

  validate: (token: string) =>
    api
      .get<{ valid: boolean; email?: string; full_name?: string; role?: string; expires_at?: string }>(
        '/invitations/validate',
        { params: { token } },
      )
      .then((r) => r.data),

  accept: (token: string, password: string) =>
    api.post<{ success: boolean }>('/invitations/accept', { token, password }).then((r) => r.data),

  revoke: (id: string) => api.delete<UserInvitation>(`/invitations/${id}`).then((r) => r.data),
};

// ─── CSV Import ───────────────────────────────────────────────────────────────

export interface ImportResult {
  created: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
}

// ─── Billing ────────────────────────────────────────────────────────────────────

export interface BillingPlanInfo {
  id: string;
  name_de: string;
  name_en: string;
  monthly_amount_cents: number;
  monthly_amount_formatted: string;
  vehicle_limit: number;
  seat_limit: number;
  features_de: string[];
  stripe_available: boolean;
}

export interface BillingStatusResponse {
  subscription: {
    id: string;
    plan: string;
    plan_name_de: string;
    status: string;
    billing_mode: string;
    vehicle_limit: number;
    seat_limit: number;
    monthly_amount_cents: number;
    monthly_amount_formatted: string;
    billing_email?: string;
    manual_invoice_reference?: string;
    trial_ends_at?: string;
    current_period_end?: string;
    stripe_configured: boolean;
    features_de: string[];
  };
  usage: {
    vehicles: number;
    seats: number;
    vehicle_limit: number;
    seat_limit: number;
    vehicles_remaining: number;
    seats_remaining: number;
  };
  access: {
    is_active: boolean;
    within_limits: boolean;
    can_add_vehicle: boolean;
    can_add_seat: boolean;
  };
}

export const billingApi = {
  getPlans: () => api.get<BillingPlanInfo[]>('/billing/plans').then((r) => r.data),

  getStatus: () => api.get<BillingStatusResponse>('/billing/status').then((r) => r.data),

  startCheckout: (plan: string, billing_email: string) =>
    api
      .post<{ url: string; sessionId: string }>('/billing/checkout', { plan, billing_email })
      .then((r) => r.data),

  openPortal: () => api.post<{ url: string }>('/billing/portal').then((r) => r.data),

  setManual: (data: {
    tenant_id: string;
    plan: string;
    billing_email?: string;
    invoice_reference?: string;
    monthly_amount_cents?: number;
    vehicle_limit?: number;
    seat_limit?: number;
  }) => api.post('/billing/manual', data).then((r) => r.data),
};

export const importApi = {
  drivers: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<ImportResult>('/import/drivers', form).then((r) => r.data);
  },

  vehicles: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<ImportResult>('/import/vehicles', form).then((r) => r.data);
  },

  companies: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<ImportResult>('/import/companies', form).then((r) => r.data);
  },

  users: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<ImportResult>('/import/users', form).then((r) => r.data);
  },

  documents: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<ImportResult>('/documents/import', form).then((r) => r.data);
  },

  serviceRecords: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<ImportResult>('/service-records/import', form).then((r) => r.data);
  },
};

// ─── Documents ────────────────────────────────────────────────────────────────

export interface DocumentListParams {
  owner_type?: string;
  owner_id?: string;
  status?: string;
  document_type?: string;
  search?: string;
}

export interface MissingDocumentRow {
  owner_type: 'driver' | 'vehicle';
  owner_id: string;
  owner_name: string;
  document_type: string;
}

export const documentsApi = {
  list: (paramsOrOwnerType?: DocumentListParams | string, owner_id?: string) => {
    let params: DocumentListParams;
    if (typeof paramsOrOwnerType === 'string') {
      params = { owner_type: paramsOrOwnerType, owner_id };
    } else {
      params = paramsOrOwnerType ?? {};
    }
    return api.get<Document[]>('/documents', { params }).then((r) => r.data);
  },

  getById: (id: string) => api.get<Document>(`/documents/${id}`).then((r) => r.data),

  getExpiring: (days?: number) =>
    api.get<Document[]>('/documents/expiring', { params: { days } }).then((r) => r.data),

  getMissingRequired: () =>
    api.get<MissingDocumentRow[]>('/documents/missing-required').then((r) => r.data),

  create: (data: Partial<Document>) =>
    api.post<Document>('/documents', data).then((r) => r.data),

  upload: (formData: FormData) =>
    api.post<Document>('/documents/upload', formData).then((r) => r.data),

  update: (id: string, data: Partial<Document>) =>
    api.patch<Document>(`/documents/${id}`, data).then((r) => r.data),

  replace: (id: string, data: Partial<Document>) =>
    api.post<Document>(`/documents/${id}/replace`, data).then((r) => r.data),

  replaceUpload: (id: string, formData: FormData) =>
    api.post<Document>(`/documents/${id}/replace-upload`, formData).then((r) => r.data),

  remove: (id: string) =>
    api.delete<{ id: string; deleted: boolean }>(`/documents/${id}`).then((r) => r.data),

  downloadBlob: (id: string) =>
    api
      .get<Blob>(`/documents/${id}/download`, { responseType: 'blob' })
      .then((r) => r.data),
};

// ─── Requests (driver absence/leave workflow — Anträge) ──────────────────────

export type BackendRequestType =
  | 'vacation'
  | 'sick_leave'
  | 'training'
  | 'business_trip'
  | 'doctor_appointment'
  | 'special_leave'
  | 'overtime_compensation'
  | 'free_day'
  | 'other';

export type BackendRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface BackendRequest {
  id: string;
  driverId: string;
  type: BackendRequestType;
  startDate: string;
  endDate: string;
  reason?: string | null;
  status: BackendRequestStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface RequestListParams {
  driverId?: string;
  status?: string;
  type?: string;
  startDate?: string;
  endDate?: string;
}

export interface CreateRequestInput {
  driverId: string;
  type: BackendRequestType;
  startDate: string;
  endDate: string;
  reason?: string;
}

export const requestsApi = {
  list: (params?: RequestListParams) =>
    api.get<BackendRequest[]>('/requests', { params }).then((r) => r.data),

  getById: (id: string) => api.get<BackendRequest>(`/requests/${id}`).then((r) => r.data),

  create: (data: CreateRequestInput) =>
    api.post<BackendRequest>('/requests', data).then((r) => r.data),

  approve: (id: string, currentUserId: string) =>
    api.post<BackendRequest>(`/requests/${id}/approve`, { currentUserId }).then((r) => r.data),

  reject: (id: string) =>
    api.post<BackendRequest>(`/requests/${id}/reject`).then((r) => r.data),

  cancel: (id: string) =>
    api.post<BackendRequest>(`/requests/${id}/cancel`).then((r) => r.data),

  update: (
    id: string,
    data: Partial<Pick<CreateRequestInput, 'type' | 'startDate' | 'endDate' | 'reason'>> & {
      status?: BackendRequestStatus;
    },
  ) => api.patch<BackendRequest>(`/requests/${id}`, data).then((r) => r.data),
};

// ─── Live Tracking ───────────────────────────────────────────────────────────

export interface LiveTrackingQueryParams {
  staleAfterSec?: number;
  includeOffline?: boolean;
  search?: string;
}

export const trackingApi = {
  getLive: (params?: LiveTrackingQueryParams) =>
    api.get<LiveTrackingItem[]>('/tracking/live', { params }).then((r) => r.data),
};

export default api;
