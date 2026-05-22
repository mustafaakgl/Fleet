import axios from 'axios';
import { getToken, clearAuth } from './auth';
import type {
  AuthResponse,
  DashboardSummary,
  Driver,
  DriverDetail,
  PaginatedDrivers,
  Vehicle,
  VehicleDetail,
  PaginatedVehicles,
  Assignment,
  PaginatedAssignments,
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
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Response interceptor: handle 401 ───────────────────────────────────────
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      clearAuth();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

// ─── Auth ───────────────────────────────────────────────────────────────────

export const authApi = {
  signIn: (email: string, password: string) =>
    api.post<AuthResponse>('/auth/signin', { email, password }).then((r) => r.data),

  me: () => api.get<AuthResponse['user']>('/auth/me').then((r) => r.data),
};

// ─── Dashboard ───────────────────────────────────────────────────────────────

export const dashboardApi = {
  getSummary: () => api.get<DashboardSummary>('/dashboard').then((r) => r.data),
};

// ─── Drivers ─────────────────────────────────────────────────────────────────

export interface DriverListParams {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export const driversApi = {
  list: (params?: DriverListParams) =>
    api.get<PaginatedDrivers>('/drivers', { params }).then((r) => r.data),

  getById: (id: string) => api.get<DriverDetail>(`/drivers/${id}`).then((r) => r.data),

  create: (data: Partial<Driver>) => api.post<Driver>('/drivers', data).then((r) => r.data),

  update: (id: string, data: Partial<Driver>) =>
    api.patch<Driver>(`/drivers/${id}`, data).then((r) => r.data),

  deactivate: (id: string) => api.delete(`/drivers/${id}`).then((r) => r.data),
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

  create: (data: Partial<Assignment>) =>
    api.post<Assignment>('/assignments', data).then((r) => r.data),

  update: (id: string, data: Partial<Assignment>) =>
    api.patch<Assignment>(`/assignments/${id}`, data).then((r) => r.data),

  cancel: (id: string) =>
    api.post(`/assignments/${id}/cancel`).then((r) => r.data),
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

  generate: () => api.post('/reminders/generate').then((r) => r.data),
};

// ─── Notifications ────────────────────────────────────────────────────────────

export const notificationsApi = {
  list: () => api.get<Notification[]>('/notifications').then((r) => r.data),

  markRead: (id: string) => api.post(`/notifications/${id}/read`).then((r) => r.data),
};

// ─── Documents ────────────────────────────────────────────────────────────────

export const documentsApi = {
  list: (owner_type: string, owner_id: string) =>
    api.get<Document[]>('/documents', { params: { owner_type, owner_id } }).then((r) => r.data),

  create: (formData: FormData) =>
    api
      .post<Document>('/documents', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data),
};

export default api;
