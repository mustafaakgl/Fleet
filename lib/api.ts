import axios from 'axios';
import { clearAuth } from './auth';
import type {
  AuthResponse,
  DashboardSummary,
  DashboardRevenueAnalytics,
  Driver,
  DriverDetail,
  PaginatedDrivers,
  Vehicle,
  VehicleDetail,
  PaginatedVehicles,
  Assignment,
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
} from './types';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
});

// ─── Request interceptor: attach JWT ────────────────────────────────────────
api.interceptors.request.use((config) => {
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
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
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

  me: () => api.get<AuthResponse['user']>('/auth/me').then((r) => r.data),
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
}

export const assignmentsApi = {
  list: (params?: AssignmentListParams) =>
    api.get<PaginatedAssignments>('/assignments', { params }).then((r) => r.data),

  getById: (id: string) =>
    api.get<Assignment>(`/assignments/${id}`).then((r) => r.data),

  create: (data: Partial<Assignment>) =>
    api.post<Assignment>('/assignments', data).then((r) => r.data),

  update: (id: string, data: Partial<Assignment>) =>
    api.patch<Assignment>(`/assignments/${id}`, data).then((r) => r.data),

  cancel: (id: string) =>
    api.post(`/assignments/${id}/cancel`).then((r) => r.data),

  transition: (id: string, to: 'confirmed' | 'in_progress' | 'completed') =>
    api.post<Assignment>(`/assignments/${id}/transition`, { to }).then((r) => r.data),
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
    date: string;
    service_type: string;
    repair_company: string;
    cost_amount: number;
    mileage_km?: number;
    notes?: string;
  }) => api.post<ServiceRecord>('/service-records', data).then((r) => r.data),

  update: (id: string, data: Partial<ServiceRecord>) =>
    api.patch<ServiceRecord>(`/service-records/${id}`, data).then((r) => r.data),

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

  create: (data: { driver_id: string; date: string; status: string; assignment_id?: string }) =>
    api.post<CalendarEvent>('/calendar', data).then((r) => r.data),

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

  update: (id: string, data: Partial<Document>) =>
    api.patch<Document>(`/documents/${id}`, data).then((r) => r.data),

  replace: (id: string, data: Partial<Document>) =>
    api.post<Document>(`/documents/${id}/replace`, data).then((r) => r.data),

  remove: (id: string) =>
    api.delete<{ id: string; deleted: boolean }>(`/documents/${id}`).then((r) => r.data),
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

export default api;
