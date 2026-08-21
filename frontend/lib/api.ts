import axios from 'axios';
import { clearAuth, markManualLoginRequired, saveAuth, saveRefreshToken, getRefreshToken } from './auth';
import type {
  AuthResponse,
  MfaSetupResponse,
  MfaStatus,
  DashboardSummary,
  DashboardRevenueAnalytics,
  DashboardRevenueByCompany,
  VehicleCostsResponse,
  Driver,
  DriverDetail,
  EquipmentIssuanceRecord,
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
  MessengerStats,
  MessengerUnreadCount,
  LiveTrackingItem,
  DriverLocationStatus,
  DriverPortalAssignment,
  DriverPortalMe,
  DriverMorningCheckin,
  DriverHandover,
  DriverHandoverPhotoSlot,
  DriverEquipmentIssuance,
  DriverPortalRequest,
  DriverTransportRequest,
  DriverTransportFormOptions,
  DriverIncident,
  DriverPortalNotification,
  DriverDocumentsResponse,
  DriverDocumentItem,
  LicenseCheck,
  LicenseComplianceBadge,
  Fine,
  FineMatchPreview,
  FineStats,
  DepartureCheck,
  MissingDepartureCheck,
  Defect,
  MessengerLanguage,
  CustomerDashboardStats,
  CustomerAssignment,
  PaginatedCustomerAssignments,
  CustomerPortalMe,
  CustomerAssignmentMessage,
  TelematicsVehicleHealthResponse,
  TelematicsVehicleHealthSeries24h,
  TelematicsVehicleHealthSeries7d,
  TelematicsDriverScoresResponse,
  TelematicsDriverTripsResponse,
  TelemetryHistoryResponse,
  FleetTripTimelineResponse,
  BulkCompleteAssignmentsResult,
  BillingProfile,
  CreateInvoiceDraftPayload,
  CreateInvoicePaymentPayload,
  CreatedInvoiceDraft,
  InvoiceDetail,
  InvoiceLinePayload,
  OpenOverdueResponse,
  OutgoingInvoiceListItem,
  UninvoicedCompany,
  UpdateInvoiceDraftPayload,
  UpsertBillingProfilePayload,
} from './types';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
  withCredentials: true,
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
let refreshPromise: Promise<string | null> | null = null;

function persistAuthResponse(response: AuthResponse): AuthResponse {
  const token = response.accessToken ?? response.access_token;
  if (token && response.user) {
    saveAuth(token, { ...response.user, name: response.user.name ?? response.user.email });
  }

  const refreshToken = response.refreshToken ?? response.refresh_token;
  if (refreshToken) {
    saveRefreshToken(refreshToken);
  }

  return response;
}

/** Attempts to refresh the session via the stored refresh token or cookie fallback. */
async function tryRefreshSession(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = authApi
      .refresh()
      .then((res) => res.accessToken ?? res.access_token ?? null)
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const status = error.response?.status;
    const requestUrl = String(error.config?.url ?? '');
    const isAuthLoginRequest =
      requestUrl.includes('/auth/login')
      || requestUrl.includes('/auth/mfa/verify-login')
      || requestUrl.includes('/auth/refresh')
      || requestUrl.includes('/auth/logout');

    const originalConfig = error.config as
      | (typeof error.config & { __retried?: boolean })
      | undefined;

    if (
      status === 401
      && !isAuthLoginRequest
      && originalConfig
      && !originalConfig.__retried
      && typeof window !== 'undefined'
    ) {
      const newToken = await tryRefreshSession();
      if (newToken) {
        originalConfig.__retried = true;
        originalConfig.headers = originalConfig.headers ?? {};
        (originalConfig.headers as Record<string, unknown>).Authorization = `Bearer ${newToken}`;
        return api.request(originalConfig);
      }
    }

    if (status === 401 && !isAuthLoginRequest) {
      clearAuth();
      markManualLoginRequired();
      const path = typeof window !== 'undefined' ? window.location.pathname : '';
      if (
        path
        && !path.startsWith('/login')
        && !path.startsWith('/reset-password')
        && !path.startsWith('/accept-invite')
        && !path.startsWith('/onboarding')
      ) {
        window.location.href = '/login?manual=1';
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

export type AssignmentConflictReason =
  | 'driver_inactive'
  | 'driver_absent'
  | 'driver_overlap'
  | 'vehicle_inactive'
  | 'vehicle_overlap';

export interface AssignmentConflictDetail {
  reason: AssignmentConflictReason;
  /** UT (Urlaub) veya KT (Krank) — `driver_absent` icin */
  absenceStatus?: string;
  driverStatus?: string;
  vehicleStatus?: string;
}

const ASSIGNMENT_CONFLICT_REASONS: ReadonlySet<string> = new Set([
  'driver_inactive',
  'driver_absent',
  'driver_overlap',
  'vehicle_inactive',
  'vehicle_overlap',
]);

/**
 * Sunucunun reddettigi atamanin sebebini KOD olarak okur.
 *
 * Sunucu bilincli olarak metin degil kod donuyor; ceviri burada, kullanicinin
 * dilinde yapilir. Tanimadigimiz bir sekil gelirse null doner ve cagiran taraf
 * genel hata mesajina duser.
 */
export function readAssignmentConflict(error: unknown): AssignmentConflictDetail | null {
  if (!axios.isAxiosError(error)) return null;

  const data = error.response?.data as
    | { code?: string; reason?: string; absenceStatus?: string; driverStatus?: string; vehicleStatus?: string }
    | undefined;

  if (data?.code !== 'assignment_conflict') return null;
  if (!data.reason || !ASSIGNMENT_CONFLICT_REASONS.has(data.reason)) return null;

  return {
    reason: data.reason as AssignmentConflictReason,
    absenceStatus: data.absenceStatus,
    driverStatus: data.driverStatus,
    vehicleStatus: data.vehicleStatus,
  };
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      if (error.code === 'ECONNABORTED') {
        return 'Zeitüberschreitung — Backend antwortet nicht.';
      }
      return `Verbindung zum Backend fehlgeschlagen (${BASE_URL}). Server läuft? Start: npm run dev`;
    }
    const data = error.response.data as { message?: string | string[] } | undefined;
    const message = data?.message;
    if (Array.isArray(message)) return message.join('. ');
    if (typeof message === 'string' && message.trim()) return message;
    if (error.response.status === 403) return 'Keine Berechtigung für diese Aktion.';
    if (error.response.status === 401) return 'Nicht angemeldet — bitte erneut einloggen.';
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

// ─── Auth ───────────────────────────────────────────────────────────────────

export const authApi = {
  signIn: (email: string, password: string) =>
    api.post<AuthResponse>('/auth/login', { email, password }).then((r) => persistAuthResponse(r.data)),

  refresh: () =>
    api
      .post<AuthResponse>('/auth/refresh', { refreshToken: getRefreshToken() ?? undefined })
      .then((r) => persistAuthResponse(r.data)),

  logout: () => api.post<{ success: boolean }>('/auth/logout').then((r) => r.data),

  me: () =>
    api
      .get<NonNullable<AuthResponse['user']> & { mfa_enabled?: boolean }>('/auth/me')
      .then((r) => r.data),

  updateLoginProfile: (data: { email?: string; language?: string }) =>
    api
      .patch<NonNullable<AuthResponse['user']> & { mfa_enabled?: boolean }>('/auth/profile', data)
      .then((r) => r.data),

  changePassword: (current_password: string, new_password: string) =>
    api
      .post<{ success: boolean }>('/auth/change-password', { current_password, new_password })
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
    api.post<AuthResponse>('/auth/oidc/exchange', { code }).then((r) => persistAuthResponse(r.data)),

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
      .then((r) => persistAuthResponse(r.data)),

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

/**
 * Muhasebe yakit fisi incelemesi (Faz 7).
 *
 * Rol kontrolu SUNUCUDA (`FINANCIAL_ROLES`): buradaki cagrilarin gizlenmesi
 * guvenlik degil, yalnizca arayuz nezaketidir.
 */
export const fuelReceiptReviewApi = {
  list: (
    params: {
      status?: import('./types').FuelEntryWorkflowStatus;
      page?: number;
      pageSize?: number;
      vehicleId?: string;
      driverId?: string;
      station?: string;
      fuelProduct?: import('./types').FuelProductType;
      mismatchOnly?: boolean;
      ocrProblemOnly?: boolean;
      from?: string;
      to?: string;
      sort?: 'oldest' | 'newest' | 'amount';
    } = {},
    signal?: AbortSignal,
  ) =>
    api
      .get<import('./types').FuelReceiptQueueResponse>('/fleet/fuel-receipts', {
        params: {
          ...params,
          mismatchOnly: params.mismatchOnly ? 'true' : undefined,
          ocrProblemOnly: params.ocrProblemOnly ? 'true' : undefined,
        },
        signal,
      })
      .then((r) => r.data),

  /**
   * Ters kayit (Faz 9).
   *
   * Silmez, finansal alan degistirmez: orijinal kayit oldugu gibi kalir ve
   * yanina append-only bir ters kayit duser.
   */
  reverse: (
    receiptId: string,
    body: {
      expectedUpdatedAt: string;
      reasonCode: import('./types').FuelReversalReasonCode;
      reason: string;
      createReplacement: boolean;
    },
  ) =>
    api
      .post<{
        receipt: import('./types').FuelReceiptReviewDetail;
        replacement: import('./types').FuelReceiptReviewDetail | null;
      }>(`/fleet/fuel-receipts/${receiptId}/reverse`, body)
      .then((r) => r.data),

  /** Duzeltilmis kopyanin duzenlenmesi. KAYDETMEK ONAYLAMAZ. */
  updateCorrection: (receiptId: string, body: Record<string, unknown>) =>
    api
      .put<{ receipt: import('./types').FuelReceiptReviewDetail }>(
        `/fleet/fuel-receipts/${receiptId}/correction`,
        body,
      )
      .then((r) => r.data),

  detail: (receiptId: string, signal?: AbortSignal) =>
    api
      .get<import('./types').FuelReceiptReviewDetail>(`/fleet/fuel-receipts/${receiptId}`, {
        signal,
      })
      .then((r) => r.data),

  /**
   * Onay. `expectedUpdatedAt` ZORUNLU: iki muhasebeci ayni fisi ayni anda
   * kapatamasin. Kaybeden istek 409 `fuel_receipt_review_conflict` alir ve
   * arayuz kaydi yeniden yukler.
   */
  approve: (receiptId: string, payload: { expectedUpdatedAt: string; accountingNote?: string }) =>
    api
      .post<{ receipt: import('./types').FuelReceiptReviewDetail; changed: boolean }>(
        `/fleet/fuel-receipts/${receiptId}/approve`,
        payload,
      )
      .then((r) => r.data),

  /** Ret. Neden ZORUNLU — surucu neyi duzeltecegini bilmeli. */
  reject: (receiptId: string, payload: { expectedUpdatedAt: string; reason: string }) =>
    api
      .post<{ receipt: import('./types').FuelReceiptReviewDetail; changed: boolean }>(
        `/fleet/fuel-receipts/${receiptId}/reject`,
        payload,
      )
      .then((r) => r.data),
};

/**
 * Yakit fisi / telematik mutabakati (Faz 11).
 *
 * ROL: uc tarafinda FINANCIAL_ROLES ile korunuyor. Ofis ve surucu bu
 * fonksiyonlari cagirsa 403 alir — menuyu gizlemek tek basina guvenlik degil.
 */
export const fuelReconciliationApi = {
  list: (
    params: {
      riskLevel?: import('./types').FuelReconciliationRiskLevel;
      reviewState?: 'open' | 'closed';
      vehicleId?: string;
      from?: string;
      to?: string;
      page?: number;
      pageSize?: number;
      sort?: 'risk' | 'newest' | 'oldest';
    } = {},
    signal?: AbortSignal,
  ) =>
    api
      .get<import('./types').FuelReconciliationQueueResponse>('/fleet/fuel-reconciliations', {
        params,
        signal,
      })
      .then((r) => r.data),

  /** Arac maliyetleri ekranindaki "kontrol bekleyen" rakami. */
  summary: (vehicleId?: string, signal?: AbortSignal) =>
    api
      .get<import('./types').FuelReconciliationSummary>('/fleet/fuel-reconciliations/summary', {
        params: vehicleId ? { vehicleId } : undefined,
        signal,
      })
      .then((r) => r.data),

  detail: (id: string, signal?: AbortSignal) =>
    api
      .get<import('./types').FuelReconciliationPanel>(`/fleet/fuel-reconciliations/${id}`, {
        signal,
      })
      .then((r) => r.data),

  /**
   * Inceleme karari. `expectedUpdatedAt` ZORUNLU: iki muhasebeci ayni kaydi
   * ayni anda farkli sonuclarla kapatamasin.
   */
  review: (
    id: string,
    payload: {
      expectedUpdatedAt: string;
      outcome: import('./types').FuelReconciliationReviewOutcome;
      note: string;
    },
  ) =>
    api
      .post<{
        reconciliation: import('./types').FuelReconciliationPanel;
        changed: boolean;
      }>(`/fleet/fuel-reconciliations/${id}/review`, payload)
      .then((r) => r.data),
};

/**
 * Ordivan otomasyonu (Faz 12).
 *
 * ROL: uclar `AUTOMATION_ROLES` (admin, boss) ile korunuyor. Duz metin
 * anahtar YALNIZCA uretildigi cagrinin yanitinda gelir; liste ucu ne anahtari
 * ne ozetini tasir.
 */
export const ordivanApi = {
  listConnectors: (signal?: AbortSignal) =>
    api
      .get<import('./types').OrdivanConnectorList>('/ordivan/connectors', { signal })
      .then((r) => r.data),

  /** Tek kullanimlik, kisa omurlu kod. Yanit BIR KEZ gorunur. */
  createEnrollment: (body: { displayName: string; capabilities: string[] }) =>
    api
      .post<{ connectorId: string; enrollmentCode: string; expiresAt: string }>(
        '/ordivan/connectors/enrollments',
        body,
      )
      .then((r) => r.data),

  rotateCredential: (connectorId: string) =>
    api
      .post<{ credential: string; credentialPrefix: string }>(
        `/ordivan/connectors/${connectorId}/rotate`,
        {},
      )
      .then((r) => r.data),

  revokeConnector: (connectorId: string) =>
    api
      .post<{ revoked: boolean }>(`/ordivan/connectors/${connectorId}/revoke`, {})
      .then((r) => r.data),

  listProposals: (
    params: { status?: import('./types').AutomationProposalStatus; page?: number; pageSize?: number } = {},
    signal?: AbortSignal,
  ) =>
    api
      .get<{
        rows: import('./types').AutomationProposalRow[];
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      }>('/ordivan/automation/proposals', { params, signal })
      .then((r) => r.data),

  proposalDetail: (id: string, signal?: AbortSignal) =>
    api
      .get<import('./types').AutomationProposalDetail>(
        `/ordivan/automation/proposals/${id}`,
        { signal },
      )
      .then((r) => r.data),

  reviewMetrics: (signal?: AbortSignal) =>
    api
      .get<import('./types').AutomationReviewMetrics>('/ordivan/automation/proposals/metrics', {
        signal,
      })
      .then((r) => r.data),

  /**
   * Servis faturasi yukleme (Faz 13).
   *
   * Yalnizca GERCEK PDF; tur sunucuda ilk baytlardan dogrulaniyor. Ayni dosya
   * ikinci kez yuklenirse yeni is ACILMAZ (`duplicate: true`).
   */
  uploadServiceInvoice: (file: File) => {
    const form = new FormData();
    form.append('document', file);
    return api
      .post<import('./types').AutomationDocumentView>(
        '/ordivan/automation/documents/service-invoice',
        form,
      )
      .then((r) => r.data);
  },

  /**
   * Karar. Aciklama KOSULLU zorunlu (bkz. lib/ordivan-view). Sunucu son
   * merci: arayuz yanilirsa istek 400 doner.
   */
  decideProposal: (
    id: string,
    body: {
      expectedUpdatedAt: string;
      decision: 'approved' | 'rejected';
      note?: string;
      rejectionCategory?: import('./types').AutomationRejectionCategory;
      corrections?: Array<{
        fieldName: string;
        fieldType: string;
        changed: boolean;
        category: import('./types').AutomationCorrectionCategory;
        criticalLowConfidence?: boolean;
        verifiedByReviewer?: boolean;
      }>;
      /** Servis faturasi onayinda ZORUNLU: insanin onayladigi degerler. */
      serviceInvoice?: {
        vehicleId: string;
        costBasis: import('./types').ServiceInvoiceCostBasis;
        costAmount: number;
        currency: string;
        serviceDate: string;
        repairCompany: string;
        serviceType: string;
        mileageKm?: number;
        notes?: string;
      };
    },
  ) =>
    api
      .post<{ proposal: import('./types').AutomationProposalDetail; changed: boolean }>(
        `/ordivan/automation/proposals/${id}/decide`,
        body,
      )
      .then((r) => r.data),
};

/** Kiraci temel para birimi ayari (Faz 7.1 ucu, Faz 8 arayuzu). */
export const tenantSettingsApi = {
  getCurrency: (signal?: AbortSignal) =>
    api
      .get<import('./types').TenantCurrencySettings>('/tenant/settings/currency', { signal })
      .then((r) => r.data),

  /** Kilit karari BACKEND'de; frontend kendi basina karar vermiyor. */
  setCurrency: (baseCurrency: string) =>
    api
      .put<import('./types').TenantCurrencySettings>('/tenant/settings/currency', { baseCurrency })
      .then((r) => r.data),

  /**
   * Zaman dilimi. Para biriminden farkli olarak KILITLI DEGIL: hicbir tutari
   * degistirmez, yalnizca rapor ay sinirlarini kaydirir.
   */
  setTimezone: (timezone: string) =>
    api
      .put<import('./types').TenantCurrencySettings>('/tenant/settings/timezone', { timezone })
      .then((r) => r.data),
};

export const dashboardApi = {
  getSummary: () => api.get<DashboardSummary>('/dashboard').then((r) => r.data),

  // Financial-roles only: standalone revenue analytics for a given date.
  getRevenueAnalytics: (date?: string) =>
    api
      .get<DashboardRevenueAnalytics | null>('/dashboard/revenue-analytics', { params: { date } })
      .then((r) => r.data),

  // Financial-roles only: per-company revenue totals for an inclusive date range.
  // Defaults to the current ISO week (Mon-Sun) when no range is supplied.
  getRevenueByCompany: (from?: string, to?: string) =>
    api
      .get<DashboardRevenueByCompany | null>('/dashboard/revenue-by-company', {
        params: { from, to },
      })
      .then((r) => r.data),

  // Financial-roles only: per-vehicle cost breakdown (TCO).
  /** Maliyet dashboard'u (Faz 8) — karsilastirmali gorunum. */
  getCostDashboard: (
    params: {
      from?: string;
      to?: string;
      months?: number;
      vehicleId?: string;
      sort?: 'total' | 'costPerKm' | 'margin' | 'change';
      page?: number;
      pageSize?: number;
    } = {},
    signal?: AbortSignal,
  ) =>
    api
      .get<import('./types').CostDashboardResponse>('/dashboard/cost-dashboard', { params, signal })
      .then((r) => r.data),

  getVehicleCosts: (months?: number) =>
    api
      .get<VehicleCostsResponse>('/dashboard/vehicle-costs', { params: { months } })
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
    fines_6m: number;
  };
}

export const departureChecksApi = {
  list: (params?: { driver_id?: string; vehicle_id?: string; work_date?: string }) =>
    api.get<DepartureCheck[]>('/departure-checks', { params }).then((r) => r.data),

  missingToday: () =>
    api.get<MissingDepartureCheck[]>('/departure-checks/missing-today').then((r) => r.data),

  getById: (id: string) => api.get<DepartureCheck>(`/departure-checks/${id}`).then((r) => r.data),
};

export const defectsApi = {
  list: (params?: {
    vehicle_id?: string;
    driver_id?: string;
    status?: string;
    severity?: string;
  }) => api.get<Defect[]>('/defects', { params }).then((r) => r.data),

  getById: (id: string) => api.get<Defect>(`/defects/${id}`).then((r) => r.data),

  repairCompanies: () => api.get<string[]>('/defects/repair-companies').then((r) => r.data),

  updateStatus: (
    id: string,
    payload: {
      status: string;
      note?: string;
      repair_company?: string;
      estimated_repair_date?: string;
      confirmation_driver_id?: string;
      service_record_id?: string;
    },
  ) => api.patch<Defect>(`/defects/${id}/status`, payload).then((r) => r.data),
};

export const finesApi = {
  list: (params?: {
    status?: string;
    vehicle_id?: string;
    driver_id?: string;
    from?: string;
    to?: string;
  }) => api.get<Fine[]>('/fines', { params }).then((r) => r.data),

  dueSoon: (days = 7) =>
    api.get<Fine[]>('/fines/due-soon', { params: { days } }).then((r) => r.data),

  stats: () => api.get<FineStats>('/fines/stats').then((r) => r.data),

  matchPreview: (payload: {
    vehicle_id: string;
    violation_at: string;
    tolerance_minutes?: number;
  }) => api.post<FineMatchPreview>('/fines/match-preview', payload).then((r) => r.data),

  getById: (id: string) => api.get<Fine>(`/fines/${id}`).then((r) => r.data),

  create: (formData: FormData) =>
    api.post<Fine>('/fines', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data),

  assignDriver: (
    id: string,
    payload: {
      driver_id: string;
      matched_work_session_id?: string;
      matched_assignment_id?: string;
      note?: string;
    },
  ) => api.post<Fine>(`/fines/${id}/assign-driver`, payload).then((r) => r.data),

  notifyDriver: (id: string) =>
    api.post<Fine>(`/fines/${id}/notify-driver`).then((r) => r.data),

  updateStatus: (id: string, payload: { status: string; note?: string }) =>
    api.patch<Fine>(`/fines/${id}/status`, payload).then((r) => r.data),
};

export const licenseChecksApi = {
  listPending: () => api.get<LicenseCheck[]>('/license-checks/pending').then((r) => r.data),

  getById: (id: string) => api.get<LicenseCheck>(`/license-checks/${id}`).then((r) => r.data),

  approve: (id: string) => api.post<LicenseCheck>(`/license-checks/${id}/approve`).then((r) => r.data),

  reject: (id: string, rejection_reason: string) =>
    api.post<LicenseCheck>(`/license-checks/${id}/reject`, { rejection_reason }).then((r) => r.data),

  driverCompliance: (driverId: string) =>
    api
      .get<{
        driver_id: string;
        badge: LicenseComplianceBadge;
        blocks_assignment: boolean;
      }>(`/license-checks/drivers/${driverId}/compliance`)
      .then((r) => r.data),

  complianceSummary: () =>
    api
      .get<
        Array<{
          driver_id: string;
          driver_name: string;
          employee_number: string;
          badge: LicenseComplianceBadge;
        }>
      >('/license-checks/compliance-summary')
      .then((r) => r.data),
};

export const driverLicensesApi = {
  list: (driverId?: string) =>
    api.get('/driver-licenses', { params: driverId ? { driver_id: driverId } : undefined }).then((r) => r.data),

  create: (formData: FormData) =>
    api.post('/driver-licenses', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data),
};

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

export const equipmentIssuancesApi = {
  list: (params?: { driverId?: string; status?: string }) =>
    api.get<EquipmentIssuanceRecord[]>('/equipment-issuances', { params }).then((r) => r.data),

  getById: (id: string) =>
    api.get<EquipmentIssuanceRecord>(`/equipment-issuances/${id}`).then((r) => r.data),

  create: (payload: {
    driverId: string;
    title: string;
    items?: Array<{ name: string; quantity?: number; notes?: string }>;
    issuedAt?: string;
    file: File;
  }) => {
    const formData = new FormData();
    formData.append('driverId', payload.driverId);
    formData.append('title', payload.title);
    formData.append('file', payload.file);
    if (payload.issuedAt) formData.append('issuedAt', payload.issuedAt);
    if (payload.items && payload.items.length > 0) {
      formData.append('itemsJson', JSON.stringify(payload.items));
    }
    return api
      .post<EquipmentIssuanceRecord>('/equipment-issuances', formData, { headers: driverMultipartHeaders() })
      .then((r) => r.data);
  },

  manualUpload: (id: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api
      .post<EquipmentIssuanceRecord>(`/equipment-issuances/${id}/manual-upload`, formData, {
        headers: driverMultipartHeaders(),
      })
      .then((r) => r.data);
  },

  approve: (id: string, note?: string) =>
    api.post<EquipmentIssuanceRecord>(`/equipment-issuances/${id}/approve`, { note }).then((r) => r.data),

  cancel: (id: string, reason?: string) =>
    api.post<EquipmentIssuanceRecord>(`/equipment-issuances/${id}/cancel`, { reason }).then((r) => r.data),
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

  getCosts: (id: string, params?: { months?: number }) =>
    api
      .get<import('./types').VehicleMonthlyCostsResponse>(`/fleet/vehicles/${id}/costs`, { params })
      .then((r) => r.data),

  listEquipment: (id: string, status?: 'active' | 'retired') =>
    api.get<VehicleEquipmentItem[]>(`/vehicles/${id}/equipment`, { params: { status } }).then((r) => r.data),

  createEquipment: (
    id: string,
    data: { name: string; quantity?: number; serialNumber?: string; notes?: string },
  ) => api.post<VehicleEquipmentItem>(`/vehicles/${id}/equipment`, data).then((r) => r.data),

  updateEquipment: (
    vehicleId: string,
    equipmentId: string,
    data: Partial<{ name: string; quantity: number; serialNumber: string | null; notes: string | null; status: 'active' | 'retired'; photoDocumentId: string | null }>,
  ) => api.patch<VehicleEquipmentItem>(`/vehicles/${vehicleId}/equipment/${equipmentId}`, data).then((r) => r.data),

  removeEquipment: (vehicleId: string, equipmentId: string) =>
    api.delete<{ id: string; deleted: boolean }>(`/vehicles/${vehicleId}/equipment/${equipmentId}`).then((r) => r.data),

  getFuelCompatibility: (id: string) =>
    api
      .get<import('./types').VehicleFuelCompatibilityResponse>(`/vehicles/${id}/fuel-compatibility`)
      .then((r) => r.data),

  /**
   * Uyumluluk setinin TAMAMINI degistirir (backend PUT semantigi: sil + yaz,
   * tek transaction). Bos dizi gecerlidir ve "uyumluluk tanimsiz" durumuna
   * geri doner.
   */
  replaceFuelCompatibility: (
    id: string,
    entries: import('./types').VehicleFuelCompatibilityWriteEntry[],
  ) =>
    api
      .put<import('./types').VehicleFuelCompatibilityResponse>(
        `/vehicles/${id}/fuel-compatibility`,
        { entries },
      )
      .then((r) => r.data),
};

export interface VehicleEquipmentItem {
  id: string;
  vehicleId: string;
  name: string;
  quantity: number;
  serialNumber?: string | null;
  notes?: string | null;
  photoDocumentId?: string | null;
  status: 'active' | 'retired';
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkSessionRow {
  id: string;
  driverId: string;
  startedAt: string;
  endedAt?: string | null;
  originalEndAt?: string | null;
  correctionReason?: string | null;
  lastSeenAt?: string | null;
  source: 'manual' | 'driver_reconciled' | 'office_correction';
  endReason?: 'manual' | 'app_background' | 'logout' | null;
  status: 'active' | 'ended';
  staleOpen?: boolean;
  staleSince?: string | null;
  driver?: { id: string; firstName: string; lastName: string; employeeNumber: string };
}

export interface DriverWorkSessionState {
  id: string;
  startedAt: string;
  endedAt: string | null;
  originalEndAt: string | null;
  correctionReason: string | null;
  lastSeenAt: string | null;
  source: 'manual' | 'driver_reconciled' | 'office_correction';
  endReason: 'manual' | 'app_background' | 'logout' | null;
  status: 'active' | 'ended';
  staleOpen: boolean;
  staleSince: string | null;
}

/** Zeiterfassung gun ozeti — toplamlar sunucuda olaylardan hesaplaniyor. */
export interface WorkTimeShift {
  workSessionId: string;
  driverId: string;
  state: 'off' | 'working' | 'on_break';
  startedAt: string | null;
  endedAt: string | null;
  grossMinutes: number;
  breakMinutes: number;
  netMinutes: number;
  requiredBreakMinutes: number;
  anomalies: string[];
  events: Array<{
    id: string;
    type: 'clock_in' | 'break_start' | 'break_end' | 'clock_out';
    occurredAt: string;
    source: 'driver_web' | 'driver_mobile' | 'office' | 'auto';
    supersededBy: string | null;
  }>;
}

/**
 * Takografin gordugu, HENUZ KAYIT OLMAYAN dinlenme.
 *
 * Zeiterfassung kaydi DEGIL: bordro yalnizca onaylanmis WorkTimeEvent'i okuyor.
 * Bu satir bir iddia — onaylanmadigi surece hicbir sayiyi degistirmez.
 */
export interface BreakCandidate {
  id: string;
  driverId: string;
  workSessionId: string;
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
  status: 'pending' | 'confirmed' | 'dismissed';
  source: string;
  decidedAt: string | null;
  decisionSource: 'driver_web' | 'driver_mobile' | 'office' | 'auto' | null;
}

export interface DriverWorkSessionCurrentResponse {
  active: boolean;
  needsReconciliation?: boolean;
  session: DriverWorkSessionState | null;
}

// ─── Zeiterfassung / Payroll ─────────────────────────────────────────────────

export type PayrollPeriodStatus = 'draft' | 'review' | 'approved' | 'exported' | 'locked';

export interface PayrollPeriodRow {
  id: string;
  year: number;
  month: number;
  status: PayrollPeriodStatus;
  approvedAt: string | null;
  lockedAt: string | null;
  _count?: { entries: number; days: number };
}

export interface PayrollEntryRow {
  id: string;
  driverId: string;
  kind: 'regular' | 'correction';
  correctsPeriodId: string | null;
  targetMinutes: number;
  workedMinutes: number;
  creditedMinutes: number;
  overtimeMinutes: number;
  regularMinutes: number;
  /** Ist + kredi − Soll. Negatif olabilir; ekrandaki +6h / −2h. */
  balanceMinutes: number;
  nightMinutes: number;
  nightCoreMinutes: number;
  sundayMinutes: number;
  holidayMinutes: number;
  vacationDays: number;
  sickDays: number;
  unpaidAbsenceDays: number;
  /** Gun satirlarindan toplanip okuma aninda ekleniyor; kalemde sutun degil. */
  breakMinutes?: number;
  driver?: { id: string; firstName: string; lastName: string; employeeNumber: string };
}

export interface PayrollPeriodDetail extends PayrollPeriodRow {
  entries: PayrollEntryRow[];
}

export interface PayrollDayRow {
  id: string;
  date: string;
  dayType: 'work' | 'vacation' | 'sick' | 'holiday' | 'off' | 'absence_unpaid' | null;
  dayTypeSource: 'holiday_table' | 'calendar' | 'events' | 'unmapped' | 'none';
  calendarCode: string | null;
  paid: boolean;
  workedMinutes: number;
  breakMinutes: number;
  nightMinutes: number;
  nightCoreMinutes: number;
  sundayMinutes: number;
  holidayMinutes: number;
  /** Takograf dogrulamasi. NULL = o gun icin DDD verisi yok. */
  tachoRestMinutes: number | null;
  /** Takograf eksi surucu; pozitif = takograf daha cok dinlenme gormus. */
  tachoDeltaMinutes: number | null;
  anomalies: string[] | null;
}

export type PayrollDayType =
  | 'work'
  | 'vacation'
  | 'sick'
  | 'holiday'
  | 'off'
  | 'absence_unpaid';

/** DATEV'in iki bordro urunu; Lohnart planlari ayri. */
export type PayrollTargetSystem = 'datev_lodas' | 'datev_lohn_und_gehalt' | 'lexware_lohn_und_gehalt';

/**
 * Fleet'in kendi hareket dili. DATEV Lohnart'i DEGIL — disari cikan numara
 * esleme tablosundan geliyor.
 */
export type PayrollMovementType =
  | 'regular_hours'
  | 'overtime_hours'
  | 'night_hours'
  | 'night_core_hours'
  | 'sunday_hours'
  | 'holiday_hours'
  | 'vacation'
  | 'sickness'
  | 'unpaid_absence'
  | 'allowance'
  | 'expense';

export interface TenantPayrollProfile {
  id: string;
  datevConsultantNumber: string | null;
  datevClientNumber: string | null;
  bundesland: string | null;
  nightWindowStartMinute: number;
  nightWindowEndMinute: number;
  nightCoreStartMinute: number;
  nightCoreEndMinute: number;
  roundingMinutes: number;
  defaultWeeklyTargetMinutes: number;
  tachoBreakToleranceMinutes: number;
  /** Hedef DATEV urunu. Bos ise ihracat DATEV-hazir sayilmaz. */
  payrollTargetSystem: PayrollTargetSystem | null;
}

export interface DriverPayrollProfileRow {
  driverId: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
  /** Personel numarasi yoksa bu surucu bordroya giremez. */
  ready: boolean;
  /** Kac profil surumu var — gecmis donem o tarihteki surumle uretilir. */
  versionCount: number;
  /** O ANDA gecerli surum. */
  profile: {
    externalPersonnelNumber: string;
    weeklyTargetMinutes: number | null;
    monthlyTargetMinutes: number | null;
    costCenter: string | null;
    costUnit: string | null;
    employmentType: string;
    payrollTargetSystem: PayrollTargetSystem | null;
    validFrom: string;
    validTo: string | null;
  } | null;
}

export interface PayrollDayTypeMappingRow {
  id: string;
  calendarCode: string;
  dayType: PayrollDayType;
  paid: boolean;
}

export interface PayrollWageTypeMappingRow {
  id: string;
  targetSystem: PayrollTargetSystem;
  movementType: PayrollMovementType;
  externalWageType: string;
  enabled: boolean;
  /** Lohnart planlari yil icinde degisiyor; gecmis donem o tarihteki numarayla uretilir. */
  validFrom: string;
  validTo: string | null;
  costCenter: string | null;
  costUnit: string | null;
}

export interface PublicHolidayRow {
  id: string;
  date: string;
  name: string;
  bundesland: string | null;
}

export interface PayrollExportRow {
  id: string;
  periodId: string;
  format: 'neutral_csv' | 'datev_lodas' | 'datev_lohn_und_gehalt' | 'lexware_lohn_und_gehalt';
  fileSha256: string;
  status: 'generated' | 'downloaded';
  createdAt: string;
}

export interface PayrollLateChange {
  id: string;
  driverId: string;
  type: string;
  occurredAt: string;
  source: string;
  createdAt: string;
}

export const payrollApi = {
  listPeriods: () => api.get<PayrollPeriodRow[]>('/payroll/periods').then((r) => r.data),
  openPeriod: (year: number, month: number) =>
    api.post<PayrollPeriodRow>('/payroll/periods', { year, month }).then((r) => r.data),
  getPeriod: (id: string) =>
    api.get<PayrollPeriodDetail>(`/payroll/periods/${id}`).then((r) => r.data),
  getDriverDays: (periodId: string, driverId: string) =>
    api
      .get<PayrollDayRow[]>(`/payroll/periods/${periodId}/drivers/${driverId}/days`)
      .then((r) => r.data),
  recompute: (id: string) =>
    api.post<PayrollPeriodDetail>(`/payroll/periods/${id}/recompute`).then((r) => r.data),
  submit: (id: string) =>
    api.post<PayrollPeriodRow>(`/payroll/periods/${id}/submit`).then((r) => r.data),
  reopen: (id: string) =>
    api.post<PayrollPeriodRow>(`/payroll/periods/${id}/reopen`).then((r) => r.data),
  approve: (id: string) =>
    api.post<PayrollPeriodRow>(`/payroll/periods/${id}/approve`).then((r) => r.data),

  // ── Donem sonrasi: duzeltme, ihracat, kilit ───────────────────────────────
  listLateChanges: (id: string) =>
    api
      .get<{ periodId: string; since: string | null; events: PayrollLateChange[] }>(
        `/payroll/periods/${id}/late-changes`,
      )
      .then((r) => r.data),
  createCorrections: (targetPeriodId: string, sourcePeriodId: string) =>
    api
      .post<{ created: number }>(`/payroll/periods/${targetPeriodId}/corrections`, {
        sourcePeriodId,
      })
      .then((r) => r.data),
  exportPeriod: (id: string, format: 'neutral_csv' | 'datev_lodas' | 'datev_lohn_und_gehalt' | 'lexware_lohn_und_gehalt' = 'neutral_csv') =>
    api.post<PayrollExportRow>(`/payroll/periods/${id}/export`, { format }).then((r) => r.data),
  lockPeriod: (id: string) =>
    api.post<PayrollPeriodRow>(`/payroll/periods/${id}/lock`).then((r) => r.data),
  listExports: (periodId?: string) =>
    api
      .get<PayrollExportRow[]>('/payroll/exports', { params: periodId ? { periodId } : undefined })
      .then((r) => r.data),
  downloadExport: (id: string) =>
    api.get<Blob>(`/payroll/exports/${id}/download`, { responseType: 'blob' }).then((r) => r.data),

  // ── Yapilandirma ──────────────────────────────────────────────────────────
  getTenantProfile: () =>
    api.get<TenantPayrollProfile | null>('/payroll/profile').then((r) => r.data),
  saveTenantProfile: (payload: Partial<TenantPayrollProfile>) =>
    api.put<TenantPayrollProfile>('/payroll/profile', payload).then((r) => r.data),
  listDriverProfiles: () =>
    api.get<DriverPayrollProfileRow[]>('/payroll/drivers').then((r) => r.data),
  saveDriverProfile: (
    driverId: string,
    payload: {
      externalPersonnelNumber: string;
      weeklyTargetMinutes?: number;
      monthlyTargetMinutes?: number;
      costCenter?: string;
      costUnit?: string;
      payrollTargetSystem?: PayrollTargetSystem;
    },
  ) => api.put(`/payroll/drivers/${driverId}/profile`, payload).then((r) => r.data),
  listDayTypeMappings: () =>
    api
      .get<{ mappings: PayrollDayTypeMappingRow[]; unmappedCodes: string[] }>(
        '/payroll/day-type-mappings',
      )
      .then((r) => r.data),
  saveDayTypeMapping: (payload: { calendarCode: string; dayType: PayrollDayType; paid: boolean }) =>
    api.put<PayrollDayTypeMappingRow>('/payroll/day-type-mappings', payload).then((r) => r.data),
  listWageTypeMappings: () =>
    api.get<PayrollWageTypeMappingRow[]>('/payroll/wage-type-mappings').then((r) => r.data),
  saveWageTypeMapping: (payload: {
    targetSystem: PayrollTargetSystem;
    movementType: PayrollMovementType;
    externalWageType: string;
    enabled?: boolean;
    validFrom?: string;
    validTo?: string;
    costCenter?: string;
    costUnit?: string;
  }) => api.put<PayrollWageTypeMappingRow>('/payroll/wage-type-mappings', payload).then((r) => r.data),
  listHolidays: (year?: string) =>
    api
      .get<PublicHolidayRow[]>('/payroll/holidays', { params: year ? { year } : undefined })
      .then((r) => r.data),
  saveHoliday: (payload: { date: string; name: string; bundesland?: string }) =>
    api.post<PublicHolidayRow>('/payroll/holidays', payload).then((r) => r.data),
  deleteHoliday: (id: string) =>
    api.delete<{ deleted: boolean }>(`/payroll/holidays/${id}`).then((r) => r.data),
};

export const workSessionsApi = {
  list: (params?: {
    driver_id?: string;
    date_from?: string;
    date_to?: string;
    status?: 'active' | 'ended';
    stale_open?: boolean;
  }) =>
    api.get<WorkSessionRow[]>('/work-sessions', { params }).then((r) => r.data),
  correct: (id: string, payload: { ended_at: string; reason: string; note?: string }) =>
    api.patch<WorkSessionRow>(`/work-sessions/${id}/correct`, payload).then((r) => r.data),
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

  copyDay: (fromDate: string, toDate: string) =>
    api
      .post<{ created: number; skipped: number; total: number }>('/assignments/copy-day', {
        from_date: fromDate,
        to_date: toDate,
      })
      .then((r) => r.data),

  update: (id: string, data: AssignmentWritePayload) =>
    api.patch<Assignment>(`/assignments/${id}`, data).then((r) => r.data),

  cancel: (id: string) =>
    api.post(`/assignments/${id}/cancel`).then((r) => r.data),

  transition: (id: string, to: 'confirmed' | 'in_progress' | 'completed') =>
    api.post<Assignment>(`/assignments/${id}/transition`, { to }).then((r) => r.data),

  bulkComplete: (assignmentIds: string[]) =>
    api
      .post<BulkCompleteAssignmentsResult>('/assignments/bulk-complete', {
        assignment_ids: assignmentIds,
      })
      .then((r) => r.data),

  listCustomerMessages: (id: string) =>
    api.get<CustomerAssignmentMessage[]>(`/assignments/${id}/customer-messages`).then((r) => r.data),

  sendCustomerMessage: (id: string, body: string) =>
    api
      .post<CustomerAssignmentMessage>(`/assignments/${id}/customer-messages`, { body })
      .then((r) => r.data),
};

// ─── Outgoing invoicing ──────────────────────────────────────────────────────

export interface InvoiceListParams {
  status?: string;
  companyId?: string;
  from?: string;
  to?: string;
}

export const invoicingApi = {
  listOpenOverdue: (asOf?: string) =>
    api
      .get<OpenOverdueResponse>('/invoicing/open-overdue', { params: asOf ? { asOf } : undefined })
      .then((r) => r.data),

  listUninvoiced: (params?: { from?: string; to?: string }) =>
    api.get<UninvoicedCompany[]>('/invoicing/uninvoiced', { params }).then((r) => r.data),

  listInvoices: (params?: InvoiceListParams) =>
    api.get<OutgoingInvoiceListItem[]>('/invoicing/invoices', { params }).then((r) => r.data),

  createDraft: (payload: CreateInvoiceDraftPayload) =>
    api.post<CreatedInvoiceDraft>('/invoicing/invoices', payload).then((r) => r.data),

  getInvoice: (id: string) =>
    api.get<InvoiceDetail>(`/invoicing/invoices/${id}`).then((r) => r.data),

  updateDraft: (id: string, payload: UpdateInvoiceDraftPayload) =>
    api.patch<InvoiceDetail>(`/invoicing/invoices/${id}`, payload).then((r) => r.data),

  addLine: (id: string, payload: InvoiceLinePayload) =>
    api.post<InvoiceDetail>(`/invoicing/invoices/${id}/lines`, payload).then((r) => r.data),

  updateLine: (id: string, lineId: string, payload: Partial<InvoiceLinePayload>) =>
    api
      .patch<InvoiceDetail>(`/invoicing/invoices/${id}/lines/${lineId}`, payload)
      .then((r) => r.data),

  deleteLine: (id: string, lineId: string) =>
    api.delete<InvoiceDetail>(`/invoicing/invoices/${id}/lines/${lineId}`).then((r) => r.data),

  finalize: (id: string) =>
    api.post<InvoiceDetail>(`/invoicing/invoices/${id}/finalize`, {}).then((r) => r.data),

  send: (id: string, payload?: { includeXml?: boolean; language?: 'de' | 'en' | 'tr' }) =>
    api.post(`/invoicing/invoices/${id}/send`, payload ?? {}).then((r) => r.data),

  addPayment: (id: string, payload: CreateInvoicePaymentPayload) =>
    api.post(`/invoicing/invoices/${id}/payments`, payload).then((r) => r.data),

  deletePayment: (paymentId: string) =>
    api.delete(`/invoicing/payments/${paymentId}`).then((r) => r.data),

  downloadPdf: (id: string) =>
    api
      .get(`/invoicing/invoices/${id}/pdf`, { responseType: 'blob' })
      .then((r) => r.data as Blob),

  downloadXml: (id: string, format?: 'zugferd' | 'xrechnung') =>
    api
      .get(`/invoicing/invoices/${id}/xml`, {
        responseType: 'blob',
        params: format ? { format } : undefined,
      })
      .then((r) => r.data as Blob),

  getBillingProfile: () =>
    api.get<BillingProfile | null>('/invoicing/billing-profile').then((r) => r.data),

  upsertBillingProfile: (payload: UpsertBillingProfilePayload) =>
    api.put<BillingProfile>('/invoicing/billing-profile', payload).then((r) => r.data),
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
        | 'service_type'
        | 'notes'
        | 'date'
        | 'start_date'
        | 'vendor'
        | 'repair_company'
        | 'cost_amount'
        | 'mileage_km'
        | 'driver_id'
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
  photos?: Partial<
    Record<
      DriverHandoverPhotoSlot,
      {
        id: string;
        fileName: string;
        download_url?: string | null;
        validationStatus?: 'validated' | 'location_mismatch';
      }
    >
  >;
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

export interface CreateServiceReminderPayload {
  vehicleId: string;
  serviceTask: string;
  timeInterval: number;
  timeIntervalUnit: 'months' | 'weeks';
  timeDueSoonThreshold: number;
  timeDueSoonThresholdUnit: 'months' | 'weeks';
  meterIntervalKm: number;
  meterDueSoonThresholdKm: number;
  manualOverride: boolean;
  nextDueDate?: string;
  notifications: boolean;
  watchers?: string[];
}

export interface CreateVehicleReminderPayload {
  vehicleId: string;
  renewalKind: 'emission_test' | 'registration' | 'insurance' | 'inspection';
  dueDate: string;
  dueSoonThreshold: number;
  dueSoonThresholdUnit: 'weeks' | 'days';
  notifications: boolean;
  watchers?: string[];
  comment?: string;
}

export const remindersApi = {
  list: (params?: ReminderListParams) =>
    api.get<Reminder[]>('/reminders', { params }).then((r) => r.data),

  createServiceReminder: (payload: CreateServiceReminderPayload) =>
    api.post<Reminder>('/reminders/service', payload).then((r) => r.data),

  createVehicleReminder: (payload: CreateVehicleReminderPayload) =>
    api.post<Reminder>('/reminders/vehicle', payload).then((r) => r.data),

  bulkCreateVehicleReminders: (items: CreateVehicleReminderPayload[]) =>
    api
      .post<{ created: number; skipped: Array<{ index: number; reason: string }> }>(
        '/reminders/vehicle/bulk',
        { items },
      )
      .then((r) => r.data),

  resolve: (id: string) => api.post(`/reminders/${id}/resolve`).then((r) => r.data),

  ignore: (id: string) => api.post(`/reminders/${id}/ignore`).then((r) => r.data),

  generate: () => api.post('/reminders/generate').then((r) => r.data),
};

// ─── Notifications ────────────────────────────────────────────────────────────

export const notificationsApi = {
  list: (status?: string) =>
    api.get<Notification[]>('/notifications', { params: status ? { status } : undefined }).then((r) => r.data),

  getUnreadCount: () =>
    api.get<{ count: number }>('/notifications/unread-count').then((r) => r.data),

  markRead: (id: string) => api.patch(`/notifications/${id}`).then((r) => r.data),

  markAllRead: () => api.post('/notifications/read-all').then((r) => r.data),
};

// ─── Messenger ───────────────────────────────────────────────────────────────

export interface MessengerConversationListParams {
  driverId?: string;
  status?: string;
  search?: string;
  department?: string;
  limit?: number;
}

export interface MessengerListMessagesParams {
  since?: string;
  afterId?: string;
  beforeId?: string;
  limit?: number;
}

export interface MessengerSendOptions {
  onUploadProgress?: (progressPercent: number) => void;
}

function normalizeMessengerMessage(message: MessengerMessage): MessengerMessage {
  return {
    ...message,
    attachments: (message.attachments ?? []).map((attachment) => ({
      ...attachment,
      downloadUrl: attachment.downloadUrl.startsWith('http')
        ? attachment.downloadUrl
        : `${BASE_URL}${attachment.downloadUrl}`,
    })),
  };
}

export const messengerApi = {
  getStats: (params?: Pick<MessengerConversationListParams, 'search' | 'department'>) =>
    api.get<MessengerStats>('/messenger/stats', { params }).then((r) => r.data),

  exportConversations: (params?: MessengerConversationListParams) =>
    api
      .get<string>('/messenger/conversations/export', { params, responseType: 'text' })
      .then((r) => r.data),

  listConversations: (params?: MessengerConversationListParams) =>
    api.get<ConversationListItem[]>('/messenger/conversations', { params }).then((r) => r.data),

  createConversation: (driverId: string, subject?: string, department?: string) =>
    api
      .post<ConversationDetail>('/messenger/conversations', { driverId, subject, department })
      .then((r) => r.data),

  createDriverConversation: (subject: string, department: string) =>
    api
      .post<ConversationDetail>('/messenger/conversations', { subject, department })
      .then((r) => r.data),

  getConversation: (id: string) =>
    api.get<ConversationDetail>(`/messenger/conversations/${id}`).then((r) => ({
      ...r.data,
      messagesPreview: (r.data.messagesPreview ?? []).map(normalizeMessengerMessage),
    })),

  listMessages: (conversationId: string, params?: MessengerListMessagesParams) =>
    api
      .get<MessengerMessage[]>(`/messenger/conversations/${conversationId}/messages`, { params })
      .then((r) => r.data.map(normalizeMessengerMessage)),

  sendMessage: (conversationId: string, payload: SendMessagePayload, options?: MessengerSendOptions) => {
    const hasAttachments = Array.isArray(payload.attachments) && payload.attachments.length > 0;

    if (hasAttachments) {
      const formData = new FormData();
      if (payload.text && payload.text.trim().length > 0) {
        formData.append('text', payload.text);
      }
      if (payload.originalLanguage) {
        formData.append('originalLanguage', payload.originalLanguage);
      }
      if (payload.targetLanguage) {
        formData.append('targetLanguage', payload.targetLanguage);
      }
      for (const file of payload.attachments ?? []) {
        formData.append('attachments', file);
      }

      return api
        .post<MessengerMessage>(`/messenger/conversations/${conversationId}/messages`, formData, {
          onUploadProgress: (event) => {
            if (!options?.onUploadProgress || !event.total || event.total <= 0) {
              return;
            }
            const percent = Math.round((event.loaded / event.total) * 100);
            options.onUploadProgress(Math.max(1, Math.min(100, percent)));
          },
        })
        .then((r) => normalizeMessengerMessage(r.data));
    }

    // Backend DTO'sunda `attachments` alanı yok (forbidNonWhitelisted) — JSON gövdesinden çıkar.
    const jsonPayload: Record<string, string> = {};
    if (payload.text && payload.text.trim().length > 0) {
      jsonPayload.text = payload.text;
    }
    if (payload.originalLanguage) {
      jsonPayload.originalLanguage = payload.originalLanguage;
    }
    if (payload.targetLanguage) {
      jsonPayload.targetLanguage = payload.targetLanguage;
    }

    return api
      .post<MessengerMessage>(`/messenger/conversations/${conversationId}/messages`, jsonPayload)
      .then((r) => normalizeMessengerMessage(r.data));
  },

  getAttachmentDownloadUrl: (attachmentId: string) => `${BASE_URL}/messenger/attachments/${attachmentId}`,

  downloadAttachment: (attachmentId: string) =>
    api
      .get<Blob>(`/messenger/attachments/${attachmentId}`, { responseType: 'blob' })
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

export interface CompanyEmailBulkSendResult {
  total: number;
  sent: number;
  failed: Array<{ company: string; reason: string }>;
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

  /** Verilen gunlerdeki gonderilebilir tum taslaklari tek istekte yollar. */
  sendAll: (dates: string[]) =>
    api
      .post<CompanyEmailBulkSendResult>('/company-emails/send-all', { dates })
      .then((r) => r.data),

  markSent: (id: string) =>
    api.post<CompanyEmail>(`/company-emails/${id}/mark-sent`).then((r) => r.data),

  markFailed: (id: string) =>
    api.post<CompanyEmail>(`/company-emails/${id}/mark-failed`).then((r) => r.data),

  /** allowResend yalnizca kullanici tekrar gonderimi bilerek onayladiginda gider. */
  send: (id: string, options?: { allowResend?: boolean }) =>
    api
      .post<{ email: CompanyEmail; mail_sent: boolean; mail_mode: 'smtp' | 'log' }>(
        `/company-emails/${id}/send`,
        { allowResend: options?.allowResend ?? false },
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
  getTrail: (driverId: string, minutes = 30) =>
    api
      .get<{ driverId: string; points: import('./types').LiveTrackingTrailPoint[] }>(
        `/tracking/live/trail/${driverId}`,
        { params: { minutes } },
      )
      .then((r) => r.data),
};

export const telematicsApi = {
  getVehicleHealth: () =>
    api.get<TelematicsVehicleHealthResponse>('/telematics/vehicle-health').then((r) => r.data),

  getVehicleHealthSeries: (vehicleId: string, window: '24h' | '7d') =>
    api
      .get<TelematicsVehicleHealthSeries24h | TelematicsVehicleHealthSeries7d>(
        `/telematics/vehicle-health/${vehicleId}/series`,
        { params: { window } },
      )
      .then((r) => r.data),

  getDriverScores: (params?: { from?: string; to?: string; source?: 'all' | 'device' | 'phone' }) =>
    api.get<TelematicsDriverScoresResponse>('/telematics/driver-scores', { params }).then((r) => r.data),

  getDriverTrips: (
    driverId: string,
    params?: { from?: string; to?: string; source?: 'all' | 'device' | 'phone' },
  ) =>
    api
      .get<TelematicsDriverTripsResponse>(`/telematics/driver-scores/${driverId}/trips`, { params })
      .then((r) => r.data),

  getVehicleTelemetryHistory: async (
    vehicleId: string,
    _params?: { from?: string; to?: string; limit?: number },
  ): Promise<TelemetryHistoryResponse> => {
    const series = await api
      .get<TelematicsVehicleHealthSeries24h>(`/telematics/vehicle-health/${vehicleId}/series`, {
        params: { window: '24h' },
      })
      .then((r) => r.data);
    return {
      points: series.speed.map((point, index) => ({
        recordedAt: point.at,
        speedKmh: point.kmh,
        coolantTemp: series.coolant[index]?.celsius ?? null,
        voltage: series.voltage[index]?.volts ?? null,
      })),
    };
  },
};

export const tachographApi = {
  getBadges: () => api.get<import('./types').TachographBadges>('/tachograph/badges').then((r) => r.data),

  getComplianceOverview: (params?: { from?: string; to?: string }) =>
    api
      .get<import('./types').TachographComplianceOverview>('/tachograph/compliance/overview', { params })
      .then((r) => r.data),

  listInfringements: (params?: {
    driverId?: string;
    types?: string;
    severity?: string;
    status?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) =>
    api
      .get<import('./types').TachographInfringementListResponse>('/tachograph/infringements', { params })
      .then((r) => r.data),

  getInfringement: (id: string) =>
    api
      .get<import('./types').TachographInfringementDetail>(`/tachograph/infringements/${id}`)
      .then((r) => r.data),

  acknowledgeInfringement: (id: string, note: string) =>
    api
      .patch<import('./types').TachographInfringementItem>(`/tachograph/infringements/${id}/acknowledge`, {
        note,
      })
      .then((r) => r.data),

  setInfringementPayrollFlag: (id: string, payrollRelevant: boolean) =>
    api
      .patch<import('./types').TachographInfringementItem>(`/tachograph/infringements/${id}/payroll-flag`, {
        payrollRelevant,
      })
      .then((r) => r.data),

  listDddFiles: () =>
    api.get<import('./types').DddFileListItem[]>('/tachograph/ddd/files').then((r) => r.data),

  uploadDddFile: (payload: { file: File; vehicleId: string; capturedAt?: string }) => {
    const form = new FormData();
    form.append('file', payload.file);
    form.append('vehicleId', payload.vehicleId);
    if (payload.capturedAt) {
      form.append('capturedAt', payload.capturedAt);
    }
    return api
      .post<import('./types').DddUploadResponse>('/tachograph/ddd/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60_000,
      })
      .then((r) => r.data);
  },

  getRemaining: (params?: { driverId?: string }) =>
    api
      .get<import('./types').TachographRemainingResponse>('/tachograph/remaining', { params })
      .then((r) => r.data),

  getDashboardSummary: () =>
    api
      .get<import('./types').TachographDashboardSummary>('/tachograph/dashboard-summary')
      .then((r) => r.data),

  getDriverStory: (driverId: string, params?: { weeks?: number }) =>
    api
      .get<import('./types').TachographDriverStory>(`/tachograph/drivers/${driverId}/story`, { params })
      .then((r) => r.data),

  assignDddFile: (fileId: string, driverId: string) =>
    api
      .patch<import('./types').DddFileListItem>(`/tachograph/ddd/files/${fileId}/assign`, { driverId })
      .then((r) => r.data),
};

// ─── Driver portal (web) ─────────────────────────────────────────────────────

function driverMultipartHeaders() {
  return { 'Content-Type': 'multipart/form-data' } as const;
}

export const driverPortalApi = {
  me: () => api.get<DriverPortalMe>('/driver/me').then((r) => r.data),

  /** Vehicle defect the driver spots outside the daily check. */
  reportDefect: (
    payload: {
      vehicle_id: string;
      description: string;
      severity: import('./types').DefectSeverity;
      title?: string;
    },
    photos: File[],
  ) => {
    const formData = new FormData();
    formData.append('vehicle_id', payload.vehicle_id);
    formData.append('description', payload.description);
    formData.append('severity', payload.severity);
    if (payload.title) formData.append('title', payload.title);
    for (const photo of photos) {
      formData.append('photos', photo);
    }
    return api
      .post('/driver/defects/report', formData, { headers: driverMultipartHeaders() })
      .then((r) => r.data);
  },

  createFuelEntry: (
    payload: {
      vehicleId: string;
      liters: number;
      totalCost: number;
      enteredAt?: string;
      odometerKm?: number;
      isFullTank?: boolean;
    },
    receipt?: File,
  ) => {
    const formData = new FormData();
    formData.append('vehicleId', payload.vehicleId);
    formData.append('liters', String(payload.liters));
    formData.append('totalCost', String(payload.totalCost));
    if (payload.enteredAt) formData.append('enteredAt', payload.enteredAt);
    if (payload.odometerKm !== undefined) formData.append('odometerKm', String(payload.odometerKm));
    if (payload.isFullTank !== undefined) formData.append('isFullTank', String(payload.isFullTank));
    if (receipt) formData.append('receipt', receipt);
    return api
      .post('/driver/fleet/fuel-entries', formData, { headers: driverMultipartHeaders() })
      .then((r) => r.data);
  },

  /**
   * Marks a stop. `client_event_id` is what makes a queued retry safe: the
   * server applies a given event once, so a reconnect cannot double-count it.
   */
  markTourStop: (
    stopId: string,
    payload: {
      status: 'arrived' | 'completed' | 'skipped';
      client_event_id?: string;
      occurred_at?: string;
      latitude?: number;
      longitude?: number;
    },
  ) =>
    api
      .post<import('./types').DriverTourStopState>(`/driver/tours/stops/${stopId}/mark`, payload)
      .then((r) => r.data),

  resetTourStop: (stopId: string) =>
    api
      .post<import('./types').DriverTourStopState>(`/driver/tours/stops/${stopId}/reset`)
      .then((r) => r.data),

  /** Read-only for the plan itself; execution is written through markTourStop. */
  todayTour: (date?: string) =>
    api
      .get<{ tour: import('./types').DriverTour | null }>('/driver/tours/today', {
        params: date ? { date } : undefined,
      })
      .then((r) => r.data.tour),

  /**
   * Yakindaki, ARACA UYAN akaryakit istasyonlari.
   *
   * `vehicleId` BILINCLI olarak yok ve eklenmemeli: arac sunucuda oturumdaki
   * surucuye gore cozuluyor. Backend DTO'su forbidNonWhitelisted ile calistigi
   * icin fazladan alan gonderilmesi 400 ile reddedilir.
   *
   * `signal`: surucu yeni arama baslattiginda ya da ekrandan ciktiginda
   * bekleyen istek iptal edilebilsin diye disaridan veriliyor — eski bir yanit
   * yenisinin uzerine yazmamali.
   */
  nearbyFuelStations: (
    params: { latitude: number; longitude: number; radiusKm: number },
    signal?: AbortSignal,
  ) =>
    api
      .get<import('./types').NearbyFuelStationsResponse>('/driver/fuel-stations/nearby', {
        params: {
          latitude: params.latitude,
          longitude: params.longitude,
          radius_km: params.radiusKm,
        },
        signal,
      })
      .then((r) => r.data),

  /**
   * Aktif tura olan gercek yol sapmasina gore istasyon onerileri.
   *
   * Ayni parametreler: `tourId`, `vehicleId`, `driverId`, `nextStopId` ve rota
   * maliyet profili BILINCLI olarak yok — hepsi sunucuda oturumdaki surucu ve
   * kiracidan cozuluyor. Backend forbidNonWhitelisted ile calistigi icin
   * fazladan alan 400 ile reddedilir.
   */
  routeRecommendedFuelStations: (
    params: { latitude: number; longitude: number; radiusKm: number },
    signal?: AbortSignal,
  ) =>
    api
      .get<import('./types').RouteRecommendationsResponse>(
        '/driver/fuel-stations/route-recommendations',
        {
          params: {
            latitude: params.latitude,
            longitude: params.longitude,
            radius_km: params.radiusKm,
          },
          signal,
        },
      )
      .then((r) => r.data),

  /**
   * Surucunun aktif yakit duragi. Aktif kayit yoksa `intent: null` — NORMAL
   * durum, hata degil.
   */
  activeFuelingIntent: (signal?: AbortSignal) =>
    api
      .get<{ intent: import('./types').FuelingIntent | null }>('/driver/fueling-intents/active', {
        signal,
      })
      .then((r) => r.data.intent),

  /**
   * Yakit duragini secer ya da degistirir.
   *
   * Govde YALNIZCA opak secim kimligi + istasyon kimligi + yakit (+ opsiyonel
   * litre) tasir. `driverId`, `vehicleId`, `tourId`, fiyat ve koordinat
   * BILINCLI olarak yok: backend forbidNonWhitelisted ile calistigi icin
   * fazladan alan 400 ile reddedilir ve snapshot sunucudan okunur.
   *
   * Ayni secim ikinci kez gonderildiginde backend yeni kayit URETMEZ
   * (`outcome: 'unchanged'`), bu yuzden cift dokunus guvenlidir.
   */
  selectFuelingIntent: (payload: import('./types').SelectFuelingIntentPayload) =>
    api
      .put<import('./types').SelectFuelingIntentResult>('/driver/fueling-intents/active', payload)
      .then((r) => r.data),

  /** Tekrarlanan iptal guvenlidir: aktif kayit yoksa da 200 doner. */
  cancelFuelingIntent: () =>
    api
      .post<{ intent: null; cancelled: boolean }>('/driver/fueling-intents/active/cancel')
      .then((r) => r.data),

  /**
   * Harici navigasyonun acildigi ani bildirir. Varis kaniti DEGIL ve bu cagri
   * basarisiz olsa bile navigasyon acilir — cagiran taraf hatayi yutar.
   */
  markFuelingIntentNavigationOpened: () =>
    api
      .post<{ intent: import('./types').FuelingIntent }>(
        '/driver/fueling-intents/active/navigation-opened',
      )
      .then((r) => r.data.intent),

  /**
   * Yakit fisi yukler.
   *
   * `vehicleId`, `driverId`, `tenantId` BILINCLI olarak yok: ucu de sunucuda
   * oturumdan cozuluyor. `fuelingIntentId` OPSIYONEL — aktif tur ya da istasyon
   * secimi olmadan da fis yuklenebilir ve bu yol hicbir zaman kapanmaz.
   */
  uploadFuelReceipt: (file: File, fuelingIntentId?: string, signal?: AbortSignal) => {
    const formData = new FormData();
    formData.append('receipt', file);
    if (fuelingIntentId) formData.append('fuelingIntentId', fuelingIntentId);
    return api
      .post<import('./types').FuelReceipt>('/driver/fuel-receipts', formData, {
        headers: driverMultipartHeaders(),
        signal,
      })
      .then((r) => r.data);
  },

  /**
   * OCR'i calistirir. Tekrarlanan es zamanli cagri saglayiciya IKINCI KEZ
   * gitmez; sunucu mevcut durumu doner.
   */
  analyzeFuelReceipt: (receiptId: string, signal?: AbortSignal) =>
    api
      .post<import('./types').FuelReceipt>(`/driver/fuel-receipts/${receiptId}/analyze`, undefined, {
        signal,
      })
      .then((r) => r.data),

  listFuelReceipts: (signal?: AbortSignal) =>
    api
      .get<import('./types').FuelReceipt[]>('/driver/fuel-receipts', { signal })
      .then((r) => r.data),

  fuelReceipt: (receiptId: string, signal?: AbortSignal) =>
    api
      .get<import('./types').FuelReceipt>(`/driver/fuel-receipts/${receiptId}`, { signal })
      .then((r) => r.data),

  /**
   * Surucu degerleri dogrular -> `submitted`.
   *
   * Yalnizca izin verilen canonical alanlar gonderilir; `workflowStatus`,
   * `vehicleId` gibi bir alan eklenirse backend 400 doner.
   */
  confirmFuelReceipt: (
    receiptId: string,
    payload: import('./types').ConfirmFuelReceiptPayload,
  ) =>
    api
      .put<import('./types').ConfirmFuelReceiptResult>(
        `/driver/fuel-receipts/${receiptId}/confirm`,
        payload,
      )
      .then((r) => r.data),

  departureCheckStatus: () =>
    api
      .get<import('./types').DriverDepartureCheckStatus>('/driver/departure-check/status')
      .then((r) => r.data),

  /**
   * The endpoint takes the checklist as a JSON `payload` field plus one file field
   * per item (`photo_<item_key>`), so this cannot be a plain JSON post.
   */
  submitDepartureCheck: (
    payload: {
      vehicle_id: string;
      assignment_id?: string;
      items: import('./types').DepartureCheckItemInput[];
      latitude?: number;
      longitude?: number;
    },
    photosByItemKey: Record<string, File[]>,
  ) => {
    const formData = new FormData();
    formData.append('payload', JSON.stringify(payload));
    for (const [itemKey, files] of Object.entries(photosByItemKey)) {
      for (const file of files) {
        formData.append(`photo_${itemKey}`, file);
      }
    }
    return api
      .post('/driver/departure-check/submit', formData, { headers: driverMultipartHeaders() })
      .then((r) => r.data);
  },

  updateLanguage: (language: MessengerLanguage) =>
    api.post<DriverPortalMe>('/driver/me/language', { language }).then((r) => r.data),

  updateProfile: (payload: {
    phone?: string;
    license_number?: string;
    license_expiry_date?: string;
    home_address_street: string;
    home_address_zip_code: string;
    home_address_city: string;
    home_address_country: string;
  }) => api.post<DriverPortalMe>('/driver/me/profile', payload).then((r) => r.data),

  todayAssignments: (date?: string) =>
    api
      .get<DriverPortalAssignment[]>('/driver/assignments/today', { params: date ? { date } : undefined })
      .then((r) => r.data),

  assignmentById: (id: string) =>
    api.get<DriverPortalAssignment>(`/driver/assignments/${id}`).then((r) => r.data),

  getLocationStatus: () =>
    api.get<DriverLocationStatus>('/driver/me/location-status').then((r) => r.data),

  grantLocationConsent: () =>
    api.post<DriverLocationStatus>('/driver/me/location-consent').then((r) => r.data),

  startLocationSharing: () =>
    api.post<DriverLocationStatus>('/driver/me/location-sharing/start').then((r) => r.data),

  endLocationSharing: () =>
    api.post<DriverLocationStatus>('/driver/me/location-sharing/end').then((r) => r.data),

  submitLocation: (payload: {
    latitude: number;
    longitude: number;
    accuracyM?: number;
    speedMps?: number;
    headingDeg?: number;
    recordedAt: string;
    clientRequestId?: string;
  }) =>
    api
      .post<{
        accepted: boolean;
        nextUploadAfterSec: number;
        vehicleId: string | null;
      }>('/driver/location', payload)
      .then((r) => r.data),

  listMorningCheckins: (date?: string) =>
    api
      .get<DriverMorningCheckin[]>('/driver/morning-checkins', { params: date ? { date } : undefined })
      .then((r) => r.data),

  createMorningCheckin: (payload: {
    date: string;
    vehiclePlate: string;
    companyName: string;
    cargoName?: string;
    cargoQuantity?: string;
    notes?: string;
  }) => api.post<DriverMorningCheckin>('/driver/morning-checkins', payload).then((r) => r.data),

  listHandovers: (params?: { status?: string; photoStatus?: string; date?: string }) =>
    api.get<DriverHandover[]>('/driver/vehicle-handovers', { params }).then((r) => r.data),

  getHandover: (id: string) =>
    api.get<DriverHandover>(`/driver/vehicle-handovers/${id}`).then((r) => r.data),

  createHandover: (payload: {
    vehicleId: string;
    previousVehicleId?: string;
    assignmentId?: string;
    handoverType?: 'pickup' | 'return';
    handoverDateTime?: string;
    damageDetected?: boolean;
    damageNotes?: string;
    notes?: string;
  }) => api.post<DriverHandover>('/driver/vehicle-handovers', payload).then((r) => r.data),

  listEquipmentIssuances: () =>
    api.get<DriverEquipmentIssuance[]>('/driver/equipment-issuances').then((r) => r.data),

  getEquipmentIssuance: (id: string) =>
    api.get<DriverEquipmentIssuance>(`/driver/equipment-issuances/${id}`).then((r) => r.data),

  getEquipmentIssuanceFormBlob: (id: string) =>
    api.get<Blob>(`/driver/equipment-issuances/${id}/form`, { responseType: 'blob' }).then((r) => r.data),

  signEquipmentIssuance: (id: string, signatureDataUrl: string) =>
    api
      .post<DriverEquipmentIssuance>(`/driver/equipment-issuances/${id}/sign`, { signatureDataUrl })
      .then((r) => r.data),

  uploadHandoverPhoto: (
    handoverId: string,
    slot: DriverHandoverPhotoSlot,
    file: File,
    metadata: {
      takenAt: string;
      gpsLat?: number;
      gpsLng?: number;
      deviceInfo?: string;
      clientRequestId?: string;
    },
  ) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('taken_at', metadata.takenAt);
    if (metadata.gpsLat != null) formData.append('gps_lat', String(metadata.gpsLat));
    if (metadata.gpsLng != null) formData.append('gps_lng', String(metadata.gpsLng));
    if (metadata.deviceInfo) formData.append('device_info', metadata.deviceInfo);
    if (metadata.clientRequestId) formData.append('client_request_id', metadata.clientRequestId);
    return api
      .post<{ handover: DriverHandover }>(
        `/driver/vehicle-handovers/${handoverId}/photo?slot=${slot}`,
        formData,
        { headers: driverMultipartHeaders() },
      )
      .then((r) => r.data);
  },

  submitHandoverEquipment: (
    handoverId: string,
    payload: {
      firstAidKit: boolean;
      fireExtinguisher: boolean;
      straps: boolean;
      safetyVest: boolean;
      notes?: string;
      damageDetected?: boolean;
      damageNotes?: string;
      inventoryChecks?: Array<{ equipmentId: string; quantityPresent: number }>;
    },
  ) =>
    api
      .post<DriverHandover>(`/driver/vehicle-handovers/${handoverId}/equipment-checklist`, payload)
      .then((r) => r.data),

  listDocuments: () => api.get<DriverDocumentsResponse>('/driver/documents').then((r) => r.data),

  uploadDocument: (payload: { documentType: string; expiryDate?: string; notes?: string; file: File }) => {
    const formData = new FormData();
    formData.append('file', payload.file);
    formData.append('documentType', payload.documentType);
    if (payload.expiryDate) formData.append('expiryDate', payload.expiryDate);
    if (payload.notes) formData.append('notes', payload.notes);
    return api
      .post<DriverDocumentItem>('/driver/documents', formData, { headers: driverMultipartHeaders() })
      .then((r) => r.data);
  },

  listRequests: (params?: { status?: string; type?: string }) =>
    api.get<DriverPortalRequest[]>('/driver/requests', { params }).then((r) => r.data),

  createRequest: (payload: {
    type: DriverPortalRequest['type'];
    startDate: string;
    endDate: string;
    reason?: string;
  }) => api.post<DriverPortalRequest>('/driver/requests', payload).then((r) => r.data),

  uploadRequestAttachment: (requestId: string, file: File, options?: { clientRequestId?: string }) => {
    const formData = new FormData();
    formData.append('file', file);
    if (options?.clientRequestId) formData.append('client_request_id', options.clientRequestId);
    return api
      .post(`/driver/requests/${requestId}/attachments`, formData, { headers: driverMultipartHeaders() })
      .then((r) => r.data);
  },

  listTransportRequests: (status?: string) =>
    api
      .get<DriverTransportRequest[]>('/driver/transport-requests', {
        params: status ? { status } : undefined,
      })
      .then((r) => r.data),

  getTransportFormOptions: () =>
    api.get<DriverTransportFormOptions>('/driver/transport-form-options').then((r) => r.data),

  createTransportRequest: (payload: {
    vehicleId: string;
    companyId: string;
    cargoName: string;
    cargoOwner: string;
    pickupAddress: string;
    deliveryAddress: string;
    requestedDate: string;
    startTime: string;
    endTime: string;
  }) => api.post<DriverTransportRequest>('/driver/transport-requests', payload).then((r) => r.data),

  uploadTransportAttachment: (transportRequestId: string, file: File, options?: { clientRequestId?: string }) => {
    const formData = new FormData();
    formData.append('file', file);
    if (options?.clientRequestId) formData.append('client_request_id', options.clientRequestId);
    return api
      .post(
        `/driver/transport-requests/${transportRequestId}/attachments`,
        formData,
        { headers: driverMultipartHeaders() },
      )
      .then((r) => r.data);
  },

  listAccidents: (params?: { type?: string; status?: string }) =>
    api.get<DriverIncident[]>('/driver/accidents', { params }).then((r) => r.data),

  createAccident: (payload: {
    type: 'vehicle_accident' | 'cargo_damage';
    incidentDateTime: string;
    description: string;
    assignmentId?: string;
    vehicleId?: string;
    companyId?: string;
    location?: string;
    cargoName?: string;
    cargoOwner?: string;
    cargoQuantity?: string;
  }) => api.post<DriverIncident>('/driver/accidents', payload).then((r) => r.data),

  uploadAccidentAttachment: (
    accidentId: string,
    file: File,
    documentType?: string,
    options?: { clientRequestId?: string },
  ) => {
    const formData = new FormData();
    formData.append('file', file);
    if (options?.clientRequestId) formData.append('client_request_id', options.clientRequestId);
    return api
      .post(`/driver/accidents/${accidentId}/attachments`, formData, {
        headers: driverMultipartHeaders(),
        params: documentType ? { documentType } : undefined,
      })
      .then((r) => r.data);
  },

  listNotifications: (status?: string) =>
    api
      .get<DriverPortalNotification[]>('/driver/notifications', { params: status ? { status } : undefined })
      .then((r) => r.data),

  unreadNotifications: () =>
    api.get<{ count: number }>('/driver/notifications/unread-count').then((r) => r.data),

  markNotificationRead: (id: string) =>
    api.post<DriverPortalNotification>(`/driver/notifications/${id}/read`).then((r) => r.data),

  markAllNotificationsRead: () =>
    api.post('/driver/notifications/read-all').then((r) => r.data),

  startWorkSession: () =>
    api.post<DriverWorkSessionState>('/driver/work-sessions/start').then((r) => r.data),

  getCurrentWorkSession: () =>
    api.get<DriverWorkSessionCurrentResponse>('/driver/work-sessions/current').then((r) => r.data),

  endWorkSession: (reason: 'manual' | 'app_background' | 'logout' = 'manual') =>
    api.post<{ ended: boolean; session: DriverWorkSessionState | null }>('/driver/work-sessions/end', { reason }).then((r) => r.data),

  heartbeatWorkSession: () =>
    api.post<DriverWorkSessionCurrentResponse>('/driver/work-sessions/heartbeat').then((r) => r.data),

  getWorkTimeShift: () =>
    api
      .get<{ active: boolean; shift: WorkTimeShift | null }>('/driver/work-sessions/time')
      .then((r) => r.data),

  markWorkTimeBreak: (
    kind: 'break_start' | 'break_end',
    payload: {
      client_event_id?: string;
      occurred_at?: string;
      source?: 'driver_web' | 'driver_mobile';
      latitude?: number;
      longitude?: number;
    } = {},
  ) =>
    api
      .post<{ active: boolean; shift: WorkTimeShift }>(
        `/driver/work-sessions/break/${kind === 'break_start' ? 'start' : 'end'}`,
        payload,
      )
      .then((r) => r.data),

  /** Bekleyen mola adaylari. Sunucu her cagrida takografi yeniden tariyor. */
  listBreakCandidates: () =>
    api
      .get<{ active: boolean; candidates: BreakCandidate[] }>(
        '/driver/work-sessions/break-candidates',
      )
      .then((r) => r.data),

  /** `confirm` molayi yazar, `dismiss` yalnizca soruyu kapatir. */
  decideBreakCandidate: (id: string, decision: 'confirm' | 'dismiss') =>
    api
      .post<{ candidate: BreakCandidate; shift: WorkTimeShift | null }>(
        `/driver/work-sessions/break-candidates/${id}/${decision}`,
      )
      .then((r) => r.data),

  reconcileWorkSession: (payload: { ended_at: string; reason: string; note?: string }) =>
    api.post<{ session: DriverWorkSessionState }>('/driver/work-sessions/reconcile', payload).then((r) => r.data),
};

/** Ofis tarafi: baskasinin gunundeki mola adaylari. Karar denetime yazilir. */
export const breakCandidatesApi = {
  list: (params: {
    driver_id?: string;
    date_from?: string;
    date_to?: string;
    status?: 'pending' | 'confirmed' | 'dismissed';
  }) =>
    api
      .get<{ candidates: BreakCandidate[] }>('/break-candidates', { params })
      .then((r) => r.data.candidates),

  decide: (id: string, decision: 'confirm' | 'dismiss') =>
    api.post<BreakCandidate>(`/break-candidates/${id}/${decision}`).then((r) => r.data),
};

export const fleetFuelAnalyticsApi = {
  getOverview: (params?: { from?: string; to?: string; vehicleId?: string }) =>
    api
      .get<import('./types').FleetFuelOverviewResponse>('/fleet/fuel-analytics', { params })
      .then((r) => r.data),

  getCockpit: (params?: { from?: string; to?: string; vehicleId?: string; driverId?: string }) =>
    api
      .get<import('./types').FleetFuelAnalyticsCockpitResponse>('/fleet/fuel/analytics', { params })
      .then((r) => r.data),

  getVehicleAnalytics: (vehicleId: string, params?: { from?: string; to?: string }) =>
    api
      .get<import('./types').FleetVehicleFuelAnalyticsResponse>(
        `/fleet/vehicles/${vehicleId}/fuel-analytics`,
        { params },
      )
      .then((r) => r.data),
};

export const fleetFuelEntriesApi = {
  list: (params?: { vehicleId?: string; driverId?: string; from?: string; to?: string }) =>
    api
      .get<import('./types').FleetFuelEntry[]>('/fleet/fuel-entries', { params })
      .then((r) => r.data),

  getById: (id: string) =>
    api
      .get<import('./types').FleetFuelEntryDetail>(`/fleet/fuel-entries/${id}`)
      .then((r) => r.data),

  create: (payload: {
    vehicleId: string;
    driverId?: string;
    enteredAt?: string;
    liters: number;
    totalCost: number;
    currency?: string;
    odometerKm?: number;
    isFullTank?: boolean;
  }) =>
    api
      .post<import('./types').FleetFuelEntry>('/fleet/fuel-entries', payload)
      .then((r) => r.data),
};

export const fleetFuelCardApi = {
  listImportBatches: () =>
    api
      .get<import('./types').FuelCardImportBatchSummary[]>('/fleet/fuel-card/import-batches')
      .then((r) => r.data),

  getImportBatch: (batchId: string) =>
    api
      .get<import('./types').FuelCardImportBatchSummary>(`/fleet/fuel-card/import-batches/${batchId}`)
      .then((r) => r.data),

  listTransactions: (params?: {
    batchId?: string;
    vehicleId?: string;
    driverId?: string;
    status?: import('./types').FuelCardTransactionStatus;
    from?: string;
    to?: string;
  }) =>
    api
      .get<import('./types').FuelCardTransactionSummary[]>('/fleet/fuel-card/transactions', { params })
      .then((r) => r.data),
};

export const devicesApi = {
  list: () =>
    api
      .get<import('./types').DeviceRow[]>('/devices')
      .then((r) => r.data),

  listUnassigned: () =>
    api
      .get<import('./types').DeviceRow[]>('/devices/unassigned')
      .then((r) => r.data),

  create: (payload: import('./types').CreateDevicePayload) =>
    api
      .post<import('./types').DeviceRow>('/devices', payload)
      .then((r) => r.data),

  update: (id: string, payload: import('./types').UpdateDevicePayload) =>
    api
      .patch<import('./types').DeviceRow>(`/devices/${id}`, payload)
      .then((r) => r.data),

  remove: (id: string) =>
    api
      .delete<{ id: string; deleted: true }>(`/devices/${id}`)
      .then((r) => r.data),
};

export const fleetTripsApi = {
  list: (params?: { vehicleId?: string; driverId?: string; from?: string; to?: string }) =>
    api.get<FleetTripTimelineResponse>('/fleet/trips', { params }).then((r) => r.data),

  getById: (tripId: string) =>
    api.get<import('./types').FleetTripDetail>(`/fleet/trips/${tripId}`).then((r) => r.data),

  setPurpose: (
    tripId: string,
    payload: {
      purpose: import('./types').TripPurpose;
      note?: string;
      businessContact?: string;
      reason?: string;
    },
  ) => api.patch<import('./types').FleetTripDetail>(`/fleet/trips/${tripId}/purpose`, payload).then((r) => r.data),

  setPurposeBulk: (
    payload: {
      tripIds: string[];
      purpose: import('./types').TripPurpose;
      reason?: string;
    },
  ) => api.patch<{ updated: number }>('/fleet/trips/purpose/bulk', payload).then((r) => r.data),
};

// ─── Routing / Adres ─────────────────────────────────────────────────────────

export type TruckAccessStatus = 'unknown' | 'reachable' | 'unreachable' | 'check_failed';

export interface AddressSuggestion {
  id: string;
  label: string;
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  city: string | null;
  countryCode: string;
  latitude: number;
  longitude: number;
  kind: 'city' | 'street' | 'address' | 'poi';
  /** `history`: bu kiracinin daha once kullandigi, koordinati dogrulanmis adres */
  source?: 'history' | 'geocoder';
}

export interface PickedLocation {
  id: string;
  rawAddress: string;
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  city: string | null;
  countryCode: string;
  latitude: number | null;
  longitude: number | null;
  truckAccess: TruckAccessStatus;
  truckSnapDistanceM: number | null;
  truckAccessNote: string | null;
}

export interface RoutePreview {
  available: boolean;
  distanceKm?: number;
  durationMinutes?: number;
  hasToll?: boolean;
  /** Valhalla encoded polyline (precision 6) */
  shape?: string | null;
  reason?: string;
}

export const routingApi = {
  /**
   * Adres onerileri.
   *
   * `city` opsiyonel daraltici. `country` formdaki serbest metin ulke alani:
   * sunucu tanidigi olcude sonuclari o ulkeye daraltir, taniyamadigi metni yok
   * sayar — yani "Deutschland" yazip da Almanya disi bir adres arayan kullanici
   * bos liste degil, ulkeyi duzeltmesi gereken bir liste gorur.
   */
  suggest: (params: {
    q: string;
    kind: 'city' | 'street';
    city?: string;
    country?: string;
    limit?: number;
  }) =>
    api
      .get<{ suggestions: AddressSuggestion[]; degraded: boolean; reason?: string }>(
        '/routing/address-suggestions',
        { params },
      )
      .then((r) => r.data),

  /** Secilen adayi Location'a cevirir; koordinat yeniden aranmaz. */
  pick: (payload: {
    latitude: number;
    longitude: number;
    street?: string;
    houseNumber?: string;
    postalCode?: string;
    city?: string;
    countryCode?: string;
    label?: string;
    companyId?: string;
  }) => api.post<PickedLocation>('/routing/locations/pick', payload).then((r) => r.data),

  routePreview: (fromLocationId: string, toLocationId: string) =>
    api
      .get<RoutePreview>(`/routing/route-preview/${fromLocationId}/${toLocationId}`)
      .then((r) => r.data),
};

// ─── Turlar ──────────────────────────────────────────────────────────────────

export type TourStatus =
  | 'draft' | 'optimizing' | 'optimized' | 'released' | 'in_progress' | 'completed' | 'cancelled';

export type TourStopKind =
  | 'depot_start'
  | 'pickup'
  | 'delivery'
  | 'depot_end'
  /** Gorevden turemeyen serbest durak */
  | 'waypoint'
  /** Yuk disi is: atolye, muayene */
  | 'service';

export interface TourStop {
  id: string;
  sequence: number;
  plannedSequence: number | null;
  kind: TourStopKind;
  assignmentId: string | null;
  address: string;
  label: string | null;
  city: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  truckAccess: TruckAccessStatus;
  serviceMinutes: number;
  windowStart: string | null;
  windowEnd: string | null;
  legDistanceKm: number | null;
  legDurationMin: number | null;
  /** Onceki duraktan bu duraga olan bacagin polyline'i (precision 6) */
  legShape: string | null;
  /** Optimizasyon sonrasi dolar; tur kalkis saati bilinmiyorsa null kalir */
  plannedArrivalAt: string | null;
  plannedDepartureAt: string | null;
}

export interface TourDetail {
  id: string;
  name: string | null;
  workDate: string;
  plannedStartAt: string | null;
  plannedEndAt: string | null;
  status: TourStatus;
  plannedDistanceKm: number | null;
  plannedDurationMin: number | null;
  baselineDistanceKm: number | null;
  baselineDurationMin: number | null;
  optimizedAt: string | null;
  optimizationError: string | null;
  stops: TourStop[];
}

/** `POST /routing/tours/from-stops` govdesindeki tek durak. */
export interface TourStopPayload {
  /** Photon akisindan gelen dogrulanmis Location; ham adres GONDERILMEZ */
  location_id?: string;
  label?: string;
  service_minutes?: number;
  window_start?: string;
  window_end?: string;
}

export interface TourListItem {
  id: string;
  name: string | null;
  workDate: string;
  status: TourStatus;
  stopCount: number;
  plannedDistanceKm: number | null;
  plannedDurationMin: number | null;
  baselineDistanceKm: number | null;
  optimizedAt: string | null;
  optimizationError: string | null;
  vehiclePlate: string | null;
  driverName: string | null;
}

export type OptimizeSkipReason =
  | 'pickup_before_delivery_violated'
  | 'stop_not_reachable'
  | 'invalid_order'
  | 'invalid_input'
  | 'engine_unavailable';

export interface OptimizeTourResult {
  optimized: boolean;
  /** Arayuz bunu cevirir; `reason` yalnizca tanilama icin */
  reasonCode?: OptimizeSkipReason;
  reason?: string;
  savedKm: number | null;
  before?: { distanceKm: number | null; durationMinutes: number | null };
  after?: { distanceKm: number; durationMinutes: number };
  tour: TourDetail;
}

export const toursApi = {
  list: (date: string) =>
    api.get<{ tours: TourListItem[] }>('/routing/tours', { params: { date } }).then((r) => r.data),

  detail: (id: string) => api.get<TourDetail>(`/routing/tours/${id}`).then((r) => r.data),

  /**
   * Turun aktif yakit duragi — SALT OKUNUR.
   *
   * Ayri bir uc, tur detayina gomulu bir alan degil: yakit katmani backend'de
   * RoutingModule'u iceri alan bir modulde duruyor ve tur detayina gomulmesi
   * modul dongusu yaratirdi. Arayuz bunu tur detayinin ICINDE gosteriyor —
   * yeni ve kopuk bir panel acilmadi.
   *
   * Ofisin bu kaydi DEGISTIRECEGI bir uc bilincli olarak YOK.
   */
  fuelingIntent: (tourId: string) =>
    api
      .get<{ intent: import('./types').FuelingIntent | null }>(
        `/fleet/fueling-intents/by-tour/${tourId}`,
      )
      .then((r) => r.data.intent),

  create: (payload: {
    assignment_ids: string[];
    work_date: string;
    name?: string;
    vehicle_id?: string;
    driver_id?: string;
    depot_location_id?: string;
  }) => api.post<TourDetail>('/routing/tours', payload).then((r) => r.data),

  /**
   * Serbest duraklardan tur kurar — gorev secmeye gerek yok.
   *
   * Duraklar yalnizca `location_id` ile gonderilir: adres Photon akisinda
   * zaten cozumlendi, ham metin gondermek sunucuyu ikinci kez geocode etmeye
   * zorlar ve koordinatsiz durak uretme riski dogurur.
   */
  createFromStops: (payload: {
    work_date: string;
    planned_start_at?: string;
    name?: string;
    vehicle_id?: string;
    driver_id?: string;
    start: TourStopPayload;
    stops: TourStopPayload[];
    return_to_start?: boolean;
    end?: TourStopPayload;
  }) => api.post<TourDetail>('/routing/tours/from-stops', payload).then((r) => r.data),

  /** `optimized: false` hata degil — sira korunmus demektir, `reason` sebebi tasir. */
  optimize: (id: string) =>
    api.post<OptimizeTourResult>(`/routing/tours/${id}/optimize`).then((r) => r.data),

  release: (id: string) =>
    api.post<TourDetail>(`/routing/tours/${id}/release`).then((r) => r.data),
};

export default api;

/**
 * BELGE GELEN KUTUSU (Faz 14).
 *
 * Istemci hicbir cagrida `tenantId`, tur, guven skoru ya da hedef modul
 * DAYATAMAZ. Tur bir ONERIDIR; duzeltme ayri bir uc, yonlendirme ayri bir
 * uctur ve rol kontrolu her ikisinde de SUNUCUDA yapilir.
 */
export const documentInboxApi = {
  /** Web ve mobil (kamera) yukleme. `source` yalnizca raporlama icin. */
  upload: (file: File, source: 'web' | 'mobile' = 'web') => {
    const form = new FormData();
    form.append('document', file);
    form.append('source', source);
    return api
      .post<import('./types').IntakeUploadResult>('/ordivan/inbox/uploads', form)
      .then((r) => r.data);
  },

  list: (
    params: {
      source?: import('./types').DocumentIntakeSource;
      status?: import('./types').IntakeDocumentStatus;
      typeKey?: string;
      vehicleId?: string;
      assignedUserId?: string;
      from?: string;
      to?: string;
      page?: number;
      pageSize?: number;
    } = {},
    signal?: AbortSignal,
  ) =>
    api
      .get<{
        rows: import('./types').IntakeDocumentRow[];
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      }>('/ordivan/inbox/documents', { params, signal })
      .then((r) => r.data),

  detail: (id: string, signal?: AbortSignal) =>
    api
      .get<import('./types').IntakeDocumentDetail>(`/ordivan/inbox/documents/${id}`, { signal })
      .then((r) => r.data),

  /** Tur, alt tur, arac, surucu ve atama duzeltmesi. */
  correct: (
    id: string,
    body: {
      typeKey?: string;
      subtype?: string | null;
      vehicleId?: string | null;
      driverId?: string | null;
      assignedUserId?: string | null;
    },
  ) =>
    api
      .post<import('./types').IntakeDocumentRow>(`/ordivan/inbox/documents/${id}/correct`, body)
      .then((r) => r.data),

  reject: (id: string, reason: string) =>
    api
      .post<import('./types').IntakeDocumentRow>(`/ordivan/inbox/documents/${id}/reject`, { reason })
      .then((r) => r.data),

  /** Yonlendirme — MEVCUT surece devir. Hedefi sunucu bilir. */
  route: (
    id: string,
    body: {
      fuelReceipt?: {
        enteredAt: string;
        liters: number;
        totalCost: number;
        currency: string;
        odometerKm?: number;
      };
      vehicleDocument?: {
        documentType: string;
        expiryDate?: string | null;
        createReminder?: boolean;
        notifyBeforeDays?: number;
      };
      fine?: {
        violationAt: string;
        violationLocation: string;
        violationType: string;
        violationCategory: 'speed' | 'parking' | 'red_light' | 'distance' | 'other';
        amount?: number;
        currency?: string;
        paymentDueDate?: string | null;
      };
    },
  ) =>
    api
      .post<import('./types').IntakeRouteResult>(`/ordivan/inbox/documents/${id}/route`, body)
      .then((r) => r.data),

  /** Bolme ve birlestirme AYNI uc: gonderilen bolumleme yenisidir. */
  resegment: (
    intakeId: string,
    segments: Array<{ pageFrom: number; pageTo: number; typeKey?: string }>,
  ) =>
    api
      .post<import('./types').IntakeDocumentRow[]>(`/ordivan/inbox/intakes/${intakeId}/resegment`, {
        segments,
      })
      .then((r) => r.data),
};

/**
 * TICARI TASIMA SIPARISLERI (Faz 15).
 *
 * Finansal alanlar SUNUCUDA maskeleniyor: `contractedRevenue` `null` geldiginde
 * bu "girilmemis" degil "gorme yetkiniz yok" olabilir — `financialFieldsMasked`
 * ikisini ayirir.
 */
export const transportOrdersApi = {
  list: (
    params: {
      status?: import('./types').TransportOrderStatus;
      companyId?: string;
      from?: string;
      to?: string;
      page?: number;
      pageSize?: number;
    } = {},
    signal?: AbortSignal,
  ) =>
    api
      .get<{
        rows: import('./types').TransportOrderRow[];
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      }>('/transport-orders', { params, signal })
      .then((r) => r.data),

  detail: (id: string, signal?: AbortSignal) =>
    api
      .get<import('./types').TransportOrderDetail>(`/transport-orders/${id}`, { signal })
      .then((r) => r.data),

  revisions: (id: string, signal?: AbortSignal) =>
    api
      .get<import('./types').TransportOrderRevision[]>(`/transport-orders/${id}/revisions`, { signal })
      .then((r) => r.data),

  create: (body: Record<string, unknown>) =>
    api
      .post<import('./types').TransportOrderDetail>('/transport-orders', body)
      .then((r) => r.data),

  /** Draft'ta dogrudan uygulanir; onaylanmis sipariste ONERI acar. */
  amend: (id: string, body: Record<string, unknown>) =>
    api
      .post<import('./types').TransportOrderDetail>(`/transport-orders/${id}/amendments`, body)
      .then((r) => r.data),

  approveAmendment: (id: string, revisionId: string, expectedUpdatedAt: string) =>
    api
      .post<import('./types').TransportOrderDetail>(
        `/transport-orders/${id}/amendments/${revisionId}/approve`,
        { expectedUpdatedAt },
      )
      .then((r) => r.data),

  rejectAmendment: (id: string, revisionId: string, reason: string) =>
    api
      .post<import('./types').TransportOrderDetail>(
        `/transport-orders/${id}/amendments/${revisionId}/reject`,
        { reason },
      )
      .then((r) => r.data),

  confirm: (id: string, expectedUpdatedAt: string) =>
    api
      .post<import('./types').TransportOrderDetail>(`/transport-orders/${id}/confirm`, {
        expectedUpdatedAt,
      })
      .then((r) => r.data),

  /** Iptalin etkisi — YAZMADAN once gosterilir. */
  cancellationImpact: (id: string, signal?: AbortSignal) =>
    api
      .get<import('./types').CancellationImpact>(`/transport-orders/${id}/cancellation-impact`, {
        signal,
      })
      .then((r) => r.data),

  cancel: (
    id: string,
    body: {
      expectedUpdatedAt: string;
      category: string;
      note?: string;
      acknowledgeImpact?: boolean;
    },
  ) =>
    api
      .post<import('./types').TransportOrderDetail>(`/transport-orders/${id}/cancel`, body)
      .then((r) => r.data),

  /** Gorev MEVCUT Assignment servisi uzerinden aciliyor. IDEMPOTENT. */
  createAssignment: (
    id: string,
    body: {
      driverId: string;
      vehicleId: string;
      workDate: string;
      consignmentId?: string;
      startTime?: string;
      endTime?: string;
      expectedDailyRevenue?: number;
    },
  ) =>
    api
      .post<{ assignmentId: string; created: boolean }>(`/transport-orders/${id}/assignments`, body)
      .then((r) => r.data),

  linkAssignment: (id: string, assignmentId: string, consignmentId?: string) =>
    api
      .post<import('./types').TransportOrderDetail>(`/transport-orders/${id}/assignments/link`, {
        assignmentId,
        consignmentId,
      })
      .then((r) => r.data),
};


/**
 * SIPARIS GELEN KUTUSU (Faz 16).
 *
 * Maskeleme SUNUCUDA yapiliyor: burada gizlenen hicbir sey yok, gelen ne ise o
 * gosteriliyor. Ekranda gizlemek, ayni ucu `curl` ile cagiran birine hicbir sey
 * yapmazdi.
 */
export const orderIntakeApi = {
  /** `.eml` ya da tasima emri PDF'i. Kanali SUNUCU ilk baytlardan belirler. */
  upload: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api
      .post<{ messageId: string; duplicate: boolean }>('/order-intake/uploads', form)
      .then((r) => r.data);
  },

  list: (
    params: {
      intent?: import('./types').OrderIntakeIntent;
      status?: import('./types').OrderIntakeMessageStatus;
      take?: number;
      skip?: number;
    } = {},
    signal?: AbortSignal,
  ) =>
    api
      .get<{ items: import('./types').OrderIntakeMessageRow[]; total: number }>(
        '/order-intake/messages',
        { params, signal },
      )
      .then((r) => r.data),

  detail: (messageId: string, signal?: AbortSignal) =>
    api
      .get<import('./types').OrderIntakeMessageDetail>(`/order-intake/messages/${messageId}`, {
        signal,
      })
      .then((r) => r.data),

  /** Operasyonel (1) ya da finansal (2) inceleme gorevi. */
  decideTask: (reviewId: string, sequence: number, decision: 'approved' | 'rejected', note?: string) =>
    api
      .post<{ sequence: number; decision: string }>(
        `/order-intake/reviews/${reviewId}/tasks/${sequence}`,
        { decision, note },
      )
      .then((r) => r.data),

  /**
   * Musteri / mevcut siparis secimi.
   *
   * `null` secimi KALDIRIR; alani hic gondermemek mevcut secimi KORUR.
   * Kimlik sunucuda KIRACI KAPSAMLI olarak yeniden cozuluyor.
   */
  select: (reviewId: string, body: { companyId?: string | null; orderId?: string | null }) =>
    api
      .post<{ reviewId: string; selectedCompanyId: string | null; selectedOrderId: string | null }>(
        `/order-intake/reviews/${reviewId}/selection`,
        body,
      )
      .then((r) => r.data),

  approve: (
    reviewId: string,
    body: {
      intent: 'new_order' | 'amendment' | 'cancellation';
      companyId?: string;
      orderId?: string;
      expectedUpdatedAt?: string;
      values?: Record<string, unknown>;
      consignments?: import('./types').OrderIntakeConsignmentDraft[];
      acknowledgeDuplicate?: boolean;
    },
  ) =>
    api
      .post<import('./types').OrderIntakeApproveResult>(
        `/order-intake/reviews/${reviewId}/approve`,
        body,
      )
      .then((r) => r.data),

  reject: (reviewId: string, reason: string) =>
    api
      .post<{ reviewId: string }>(`/order-intake/reviews/${reviewId}/reject`, { reason })
      .then((r) => r.data),

  /** Iptal etkisi — YALNIZCA onizleme, hicbir sey degismez. */
  cancellationImpact: (reviewId: string, signal?: AbortSignal) =>
    api
      .get<Record<string, unknown>>(`/order-intake/reviews/${reviewId}/cancellation-impact`, {
        signal,
      })
      .then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Faz 17 — dispatch
// ---------------------------------------------------------------------------

/**
 * DISPATCH KUYRUGU.
 *
 * FINANS MASKESI SUNUCUDA: office kullanicisina `contractedRevenue`,
 * `currency` ve `plannedTollCents` ZATEN `null` gelir. Istemcide gizlemek bir
 * savunma degildir — ayni ucu `curl` ile cagirana hicbir sey yapmaz.
 */
export const dispatchApi = {
  listProposals: (
    params: {
      status?: import('./types').DispatchProposalStatus;
      generation?: import('./types').DispatchGeneration;
      workDateFrom?: string;
      workDateTo?: string;
      page?: number;
      pageSize?: number;
    } = {},
    signal?: AbortSignal,
  ) =>
    api
      .get<{
        rows: import('./types').DispatchProposalRow[];
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      }>('/dispatch/proposals', { params, signal })
      .then((r) => r.data),

  detail: (id: string, signal?: AbortSignal) =>
    api
      .get<import('./types').DispatchProposalDetail>(`/dispatch/proposals/${id}`, { signal })
      .then((r) => r.data),

  candidates: (id: string, signal?: AbortSignal) =>
    api
      .get<import('./types').DispatchCandidateView[]>(`/dispatch/proposals/${id}/candidates`, {
        signal,
      })
      .then((r) => r.data),

  overrides: (id: string, signal?: AbortSignal) =>
    api
      .get<import('./types').DispatchOverrideView[]>(`/dispatch/proposals/${id}/overrides`, {
        signal,
      })
      .then((r) => r.data),

  /** Uygulanmamis oneride 404 doner — bos tur UYDURULMAZ. */
  resultTour: (id: string, signal?: AbortSignal) =>
    api
      .get<import('./types').DispatchTourView>(`/dispatch/proposals/${id}/tour`, { signal })
      .then((r) => r.data),

  createProposal: (body: { transportOrderIds: string[]; workDate: string }) =>
    api
      .post<{ dispatchProposalId: string; jobId: string | null; reused: boolean }>(
        '/dispatch/proposals',
        body,
      )
      .then((r) => r.data),

  retry: (id: string) =>
    api.post<{ jobId: string }>(`/dispatch/proposals/${id}/retry`, {}).then((r) => r.data),

  /**
   * Onay.
   *
   * UC ZORUNLU ALAN: `expectedUpdatedAt` (iyimser eszamanlilik),
   * `proposalRevision` (oneri yeniden uretildiyse ekrandaki adaylar gecersiz)
   * ve `idempotencyKey` (cift tiklama ikinci bir tur URETMEZ).
   */
  approve: (
    id: string,
    body: {
      vehicleId: string;
      driverId: string;
      expectedUpdatedAt: string;
      proposalRevision: number;
      idempotencyKey: string;
      overrides?: import('./types').DispatchOverrideDeclaration[];
    },
  ) =>
    api
      .post<import('./types').DispatchApproveResult>(`/dispatch/proposals/${id}/approve`, body)
      .then((r) => r.data),

  reject: (
    id: string,
    body: {
      reason: string;
      expectedUpdatedAt: string;
      proposalRevision: number;
      idempotencyKey: string;
    },
  ) =>
    api
      .post<{ dispatchProposalId: string; repeated: boolean }>(
        `/dispatch/proposals/${id}/reject`,
        body,
      )
      .then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Faz 17 — teslimat slotlari (ic kullanici)
// ---------------------------------------------------------------------------

export const deliverySlotsApi = {
  listSlots: (
    params: { locationId?: string; from?: string; to?: string; page?: number; pageSize?: number } = {},
    signal?: AbortSignal,
  ) =>
    api
      .get<{
        rows: import('./types').ManagedSlotRow[];
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      }>('/delivery-slots', { params, signal })
      .then((r) => r.data),

  /** `timezone` GONDERILMIYOR: sunucu konumdan ya da kiracidan cozuyor. */
  createSlot: (body: {
    locationId: string;
    startsAt: string;
    endsAt: string;
    capacity: number;
    resourceRef?: string;
  }) => api.post<import('./types').ManagedSlotRow>('/delivery-slots', body).then((r) => r.data),

  updateSlot: (
    id: string,
    body: { capacity?: number; status?: import('./types').DeliverySlotStatus },
  ) => api.patch<import('./types').ManagedSlotRow>(`/delivery-slots/${id}`, body).then((r) => r.data),

  listInvitations: (
    params: {
      consignmentId?: string;
      status?: import('./types').DeliverySlotInvitationStatus;
      page?: number;
      pageSize?: number;
    } = {},
    signal?: AbortSignal,
  ) =>
    api
      .get<{
        rows: import('./types').SlotInvitationRow[];
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      }>('/delivery-slots/invitations', { params, signal })
      .then((r) => r.data),

  /** DUZ METIN TOKEN YALNIZCA BURADA, BIR KEZ doner. */
  createInvitation: (body: {
    consignmentId: string;
    kind: import('./types').DeliverySlotKind;
    expiresInHours?: number;
  }) =>
    api
      .post<{ invitationId: string; token: string; expiresAt: string }>(
        '/delivery-slots/invitations',
        body,
      )
      .then((r) => r.data),

  revokeInvitation: (id: string) =>
    api
      .post<{ invitationId: string }>(`/delivery-slots/invitations/${id}/revoke`, {})
      .then((r) => r.data),

  reissueInvitation: (id: string, body: { expiresInHours?: number } = {}) =>
    api
      .post<{ invitationId: string; token: string; expiresAt: string }>(
        `/delivery-slots/invitations/${id}/reissue`,
        body,
      )
      .then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Faz 17g — public slot (girissiz)
// ---------------------------------------------------------------------------

/**
 * PUBLIC SLOT ISTEMCISI.
 *
 * TOKEN YALNIZCA BIR KEZ, YALNIZCA `openSession` govdesinde gonderilir ve
 * hicbir yerde saklanmaz — ne `localStorage`, ne `sessionStorage`, ne modul
 * duzeyinde bir degisken. Sonraki her istek HttpOnly cookie ile gidiyor;
 * cookie'ye JavaScript erisemedigi icin bir XSS onu okuyamaz.
 *
 * `withCredentials` global `api` ornegininde zaten acik.
 */
export const publicSlotApi = {
  openSession: (token: string) =>
    api
      .post<{ kind: string; expiresAt: string }>('/public/delivery-slots/session', { token })
      .then((r) => r.data),

  closeSession: () =>
    api.delete<{ closed: boolean }>('/public/delivery-slots/session').then((r) => r.data),

  listSlots: (signal?: AbortSignal) =>
    api
      .get<{ kind: string; slots: import('./types').PublicSlotView[] }>('/public/delivery-slots', {
        signal,
      })
      .then((r) => r.data),

  book: (slotId: string) =>
    api
      .post<{ bookingId: string; repeated: boolean }>('/public/delivery-slots/bookings', { slotId })
      .then((r) => r.data),

  cancel: () =>
    api
      .post<{ cancelled: boolean }>('/public/delivery-slots/bookings/cancel', {})
      .then((r) => r.data),
};
