import { apiClient } from './client';
import type { DriverSession } from '@/domain/models';
import type {
  DriverAssignment,
  DriverHandover,
  DriverHandoverPhotoUploadResponse,
  HandoverPhotoSlot,
  DriverIncident,
  DriverMeResponse,
  DriverMorningCheckin,
  DriverNotification,
  DriverRequest,
  DriverTransportRequest,
  TransportFormOptions,
  ConversationListItem,
  ConversationDetail,
  MessengerMessage,
  MessengerLanguage,
  SendMessagePayload,
  MessengerUnreadCount,
  LocationStatusResponse,
  SubmitLocationPayload,
  SubmitLocationResponse,
  DriverDocumentsResponse,
  DriverDocumentItem,
} from './types';

type LoginResponse = {
  accessToken: string;
  user: {
    id: string;
    email: string;
    role: 'driver';
    language?: string;
  };
};

export const authApi = {
  async login(email: string, password: string) {
    const { data } = await apiClient.post<LoginResponse>('/auth/login', { email, password });
    return data;
  },
  async me() {
    const { data } = await apiClient.get<DriverSession['user']>('/auth/me');
    return data;
  },
};

export const driverApi = {
  async me(accessToken?: string) {
    const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;
    const { data } = await apiClient.get<DriverMeResponse>('/driver/me', { headers });
    return data;
  },
  async updateLanguage(language: MessengerLanguage) {
    const { data } = await apiClient.post<DriverMeResponse>('/driver/me/language', { language });
    return data;
  },
  async registerPushToken(token: string) {
    const { data } = await apiClient.post<{ registered: boolean }>('/driver/me/push-token', { token });
    return data;
  },
  async clearPushToken() {
    const { data } = await apiClient.delete<{ cleared: boolean }>('/driver/me/push-token');
    return data;
  },
  async getLocationStatus() {
    const { data } = await apiClient.get<LocationStatusResponse>('/driver/me/location-status');
    return data;
  },
  async grantLocationConsent() {
    const { data } = await apiClient.post<{
      consentGranted: boolean;
      consentAt: string;
      trackingStatus: LocationStatusResponse['trackingStatus'];
      sharingActive?: boolean;
    }>('/driver/me/location-consent');
    return data;
  },
  async startLocationSharing() {
    const { data } = await apiClient.post<LocationStatusResponse>('/driver/me/location-sharing/start');
    return data;
  },
  async endLocationSharing() {
    const { data } = await apiClient.post<LocationStatusResponse>('/driver/me/location-sharing/end');
    return data;
  },
  async submitLocation(payload: SubmitLocationPayload) {
    const { data } = await apiClient.post<SubmitLocationResponse>('/driver/location', payload);
    return data;
  },
  async todayAssignments(date?: string) {
    const { data } = await apiClient.get<DriverAssignment[]>('/driver/assignments/today', { params: { date } });
    return data;
  },
  async assignmentById(id: string) {
    const { data } = await apiClient.get<DriverAssignment>(`/driver/assignments/${id}`);
    return data;
  },
  async listMorningCheckins(date?: string) {
    const { data } = await apiClient.get<DriverMorningCheckin[]>('/driver/morning-checkins', { params: { date } });
    return data;
  },
  async createMorningCheckin(payload: {
    date: string;
    vehiclePlate?: string;
    companyName?: string;
    cargoName?: string;
    cargoQuantity?: string;
    notes?: string;
  }) {
    const { data } = await apiClient.post<DriverMorningCheckin>('/driver/morning-checkins', payload);
    return data;
  },
  async listHandovers(params?: { status?: string; photoStatus?: string; date?: string }) {
    const { data } = await apiClient.get<DriverHandover[]>('/driver/vehicle-handovers', { params });
    return data;
  },
  async getHandover(handoverId: string) {
    const { data } = await apiClient.get<DriverHandover>(`/driver/vehicle-handovers/${handoverId}`);
    return data;
  },
  async createHandover(payload: {
    vehicleId: string;
    previousVehicleId?: string;
    assignmentId?: string;
    handoverType?: 'pickup' | 'return';
    handoverDateTime?: string;
    damageDetected?: boolean;
    damageNotes?: string;
    notes?: string;
  }) {
    const { data } = await apiClient.post<DriverHandover>('/driver/vehicle-handovers', payload);
    return data;
  },
  async listDocuments() {
    const { data } = await apiClient.get<DriverDocumentsResponse>('/driver/documents');
    return data;
  },
  async uploadDocument(payload: {
    documentType: string;
    expiryDate?: string;
    notes?: string;
    file: { uri: string; name: string; type: string };
  }) {
    const formData = new FormData();
    formData.append('file', payload.file as unknown as Blob);
    formData.append('documentType', payload.documentType);
    if (payload.expiryDate) {
      formData.append('expiryDate', payload.expiryDate);
    }
    if (payload.notes) {
      formData.append('notes', payload.notes);
    }
    const { data } = await apiClient.post<DriverDocumentItem>('/driver/documents', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },
  async uploadHandoverPhoto(
    handoverId: string,
    slot: HandoverPhotoSlot,
    file: { uri: string; name: string; type: string },
    onProgress?: (progress: number) => void,
  ) {
    const formData = new FormData();
    formData.append('file', file as unknown as Blob);
    const { data } = await apiClient.post<DriverHandoverPhotoUploadResponse>(
      `/driver/vehicle-handovers/${handoverId}/photo?slot=${slot}`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (event) => {
          if (!onProgress || !event.total) {
            return;
          }
          onProgress(Math.round((event.loaded / event.total) * 100));
        },
      },
    );
    return data;
  },
  async submitHandoverEquipmentChecklist(
    handoverId: string,
    payload: {
      firstAidKit: boolean;
      fireExtinguisher: boolean;
      straps: boolean;
      safetyVest: boolean;
      notes?: string;
    },
  ) {
    const { data } = await apiClient.post<DriverHandover>(
      `/driver/vehicle-handovers/${handoverId}/equipment-checklist`,
      payload,
    );
    return data;
  },
  async startWorkSession() {
    const { data } = await apiClient.post<{ id: string; startedAt: string; status: string }>(
      '/driver/work-sessions/start',
    );
    return data;
  },
  async endWorkSession(reason: 'manual' | 'app_background' | 'logout' = 'manual') {
    const { data } = await apiClient.post<{
      ended: boolean;
      session: { id: string; startedAt: string; endedAt: string | null; endReason: string | null } | null;
    }>('/driver/work-sessions/end', { reason });
    return data;
  },
  async getCurrentWorkSession() {
    const { data } = await apiClient.get<{
      active: boolean;
      session: { id: string; startedAt: string; status: string } | null;
    }>('/driver/work-sessions/current');
    return data;
  },
  async listRequests(params?: { status?: string; type?: string }) {
    const { data } = await apiClient.get<DriverRequest[]>('/driver/requests', { params });
    return data;
  },
  async uploadLeaveRequestAttachment(
    requestId: string,
    file: { uri: string; name: string; type: string },
  ) {
    const formData = new FormData();
    formData.append('file', file as unknown as Blob);
    const { data } = await apiClient.post<{ id: string; fileName: string; fileUrl: string | null }>(
      `/driver/requests/${requestId}/attachments`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return data;
  },
  async uploadTransportRequestAttachment(
    transportRequestId: string,
    file: { uri: string; name: string; type: string },
  ) {
    const formData = new FormData();
    formData.append('file', file as unknown as Blob);
    const { data } = await apiClient.post<{ id: string; fileName: string; fileUrl: string | null }>(
      `/driver/transport-requests/${transportRequestId}/attachments`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return data;
  },
  async createRequest(payload: {
    type:
      | 'vacation'
      | 'sick_leave'
      | 'training'
      | 'business_trip'
      | 'doctor_appointment'
      | 'special_leave'
      | 'overtime_compensation'
      | 'free_day'
      | 'other';
    startDate: string;
    endDate: string;
    reason?: string;
  }) {
    const { data } = await apiClient.post<DriverRequest>('/driver/requests', payload);
    return data;
  },
  async listTransportRequests(status?: string) {
    const { data } = await apiClient.get<DriverTransportRequest[]>('/driver/transport-requests', {
      params: status ? { status } : undefined,
    });
    return data;
  },
  async getTransportFormOptions() {
    const { data } = await apiClient.get<TransportFormOptions>('/driver/transport-form-options');
    return data;
  },
  async createTransportRequest(payload: {
    vehicleId: string;
    companyId: string;
    cargoName: string;
    cargoOwner: string;
    pickupAddress: string;
    deliveryAddress: string;
    requestedDate: string;
    startTime: string;
    endTime: string;
  }) {
    const { data } = await apiClient.post<DriverTransportRequest>('/driver/transport-requests', payload);
    return data;
  },
  async listAccidents(params?: { type?: string; status?: string }) {
    const { data } = await apiClient.get<DriverIncident[]>('/driver/accidents', { params });
    return data;
  },
  async createAccident(payload: {
    type: 'vehicle_accident' | 'cargo_damage';
    incidentDateTime: string;
    description: string;
    assignmentId?: string;
    vehicleId?: string;
    companyId?: string;
    location?: string;
    cargoName?: string;
    cargoOwner?: string;
  }) {
    const { data } = await apiClient.post<DriverIncident>('/driver/accidents', payload);
    return data;
  },
  async uploadAccidentAttachment(
    accidentId: string,
    file: { uri: string; name: string; type: string },
    documentType?: string,
  ) {
    const formData = new FormData();
    formData.append('file', file as unknown as Blob);
    const { data } = await apiClient.post<{ id: string; fileName: string; download_url: string | null }>(
      `/driver/accidents/${accidentId}/attachments`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        params: documentType ? { documentType } : undefined,
      },
    );
    return data;
  },
  async listNotifications(status?: string) {
    const { data } = await apiClient.get<DriverNotification[]>('/driver/notifications', { params: { status } });
    return data;
  },
  async unreadNotifications() {
    const { data } = await apiClient.get('/driver/notifications/unread-count');
    return data;
  },
  async markNotificationRead(id: string) {
    const { data } = await apiClient.post<DriverNotification>(`/driver/notifications/${id}/read`);
    return data;
  },
  async markAllNotificationsRead() {
    const { data } = await apiClient.post('/driver/notifications/read-all');
    return data;
  },
};

export const messengerApi = {
  async listConversations() {
    const { data } = await apiClient.get<ConversationListItem[]>('/messenger/conversations');
    return data;
  },
  async getConversation(id: string) {
    const { data } = await apiClient.get<ConversationDetail>(`/messenger/conversations/${id}`);
    return data;
  },
  async listMessages(
    conversationId: string,
    params?: { since?: string; afterId?: string; limit?: number },
  ) {
    const { data } = await apiClient.get<MessengerMessage[]>(
      `/messenger/conversations/${conversationId}/messages`,
      { params },
    );
    return data;
  },
  async sendMessage(conversationId: string, payload: SendMessagePayload) {
    const { data } = await apiClient.post<MessengerMessage>(
      `/messenger/conversations/${conversationId}/messages`,
      payload,
    );
    return data;
  },
  async markConversationRead(conversationId: string) {
    const { data } = await apiClient.post(
      `/messenger/conversations/${conversationId}/read`,
    );
    return data;
  },
  async getUnreadCount() {
    const { data } = await apiClient.get<MessengerUnreadCount>('/messenger/unread-count');
    return data;
  },
};
