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
  LicenseCheckHistoryItem,
  LicenseCheckPhotoMeta,
  LicenseCheckStatusResponse,
  LicenseCheckStep,
  DriverFine,
  DepartureCheckStatusResponse,
  DriverDefect,
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
    vehiclePlate: string;
    companyName: string;
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
    metadata: {
      takenAt: string;
      gpsLat?: number;
      gpsLng?: number;
      deviceInfo?: string;
    },
    onProgress?: (progress: number) => void,
  ) {
    const formData = new FormData();
    formData.append('file', file as unknown as Blob);
    formData.append('taken_at', metadata.takenAt);
    if (metadata.gpsLat != null) formData.append('gps_lat', String(metadata.gpsLat));
    if (metadata.gpsLng != null) formData.append('gps_lng', String(metadata.gpsLng));
    if (metadata.deviceInfo) formData.append('device_info', metadata.deviceInfo);
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
      damageDetected?: boolean;
      damageNotes?: string;
      inventoryChecks?: Array<{ equipmentId: string; quantityPresent: number }>;
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
    cargoQuantity?: string;
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
  async licenseCheckStatus() {
    const { data } = await apiClient.get<LicenseCheckStatusResponse>('/driver/license-check/status');
    return data;
  },
  async licenseCheckHistory() {
    const { data } = await apiClient.get<LicenseCheckHistoryItem[]>('/driver/license-check/history');
    return data;
  },
  async departureCheckStatus() {
    const { data } = await apiClient.get<DepartureCheckStatusResponse>('/driver/departure-check/status');
    return data;
  },
  async submitDepartureCheck(payload: {
    vehicle_id: string;
    assignment_id?: string;
    client_submission_id: string;
    items: Array<{
      item_key: string;
      result: 'ok' | 'defekt' | 'na';
      defect_description?: string;
      defect_severity?: 'gering' | 'mittel' | 'kritisch';
    }>;
    latitude?: number;
    longitude?: number;
    accuracy_m?: number;
    signature_confirmed_at: string;
    photosByItemKey: Record<string, Array<{ uri: string; name: string; type: string }>>;
  }) {
    const formData = new FormData();
    formData.append(
      'payload',
      JSON.stringify({
        vehicle_id: payload.vehicle_id,
        assignment_id: payload.assignment_id,
        client_submission_id: payload.client_submission_id,
        items: payload.items,
        latitude: payload.latitude,
        longitude: payload.longitude,
        accuracy_m: payload.accuracy_m,
        signature_confirmed_at: payload.signature_confirmed_at,
      }),
    );
    for (const [itemKey, photos] of Object.entries(payload.photosByItemKey)) {
      for (const photo of photos) {
        formData.append(`photo_${itemKey}`, photo as unknown as Blob);
      }
    }
    const { data } = await apiClient.post('/driver/departure-check/submit', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },
  async listDefects() {
    const { data } = await apiClient.get<DriverDefect[]>('/driver/defects');
    return data;
  },
  async reportDefect(payload: {
    vehicle_id: string;
    description: string;
    severity: 'kritisch' | 'mittel' | 'gering';
    title?: string;
    photos: Array<{ uri: string; name: string; type: string }>;
  }) {
    const formData = new FormData();
    formData.append('vehicle_id', payload.vehicle_id);
    formData.append('description', payload.description);
    formData.append('severity', payload.severity);
    if (payload.title) formData.append('title', payload.title);
    for (const photo of payload.photos) {
      formData.append('photos', photo as unknown as Blob);
    }
    const { data } = await apiClient.post<DriverDefect>('/driver/defects/report', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },
  async confirmDefect(id: string, note?: string) {
    const { data } = await apiClient.post<DriverDefect>(`/driver/defects/${id}/confirm`, { note });
    return data;
  },
  async listFines() {
    const { data } = await apiClient.get<DriverFine[]>('/driver/fines');
    return data;
  },
  async getFine(id: string) {
    const { data } = await apiClient.get<DriverFine>(`/driver/fines/${id}`);
    return data;
  },
  async acknowledgeFine(id: string, ackMetadata?: Record<string, unknown>) {
    const { data } = await apiClient.post<DriverFine>(`/driver/fines/${id}/acknowledge`, {
      ack_metadata: ackMetadata ? JSON.stringify(ackMetadata) : undefined,
    });
    return data;
  },
  async submitLicenseCheck(payload: {
    front: { uri: string; name: string; type: string };
    back: { uri: string; name: string; type: string };
    selfie: { uri: string; name: string; type: string };
    photoMetadata: Record<LicenseCheckStep, LicenseCheckPhotoMeta>;
    notes?: string;
  }) {
    const formData = new FormData();
    formData.append('front', payload.front as unknown as Blob);
    formData.append('back', payload.back as unknown as Blob);
    formData.append('selfie', payload.selfie as unknown as Blob);
    formData.append('photo_metadata', JSON.stringify(payload.photoMetadata));
    if (payload.notes) {
      formData.append('notes', payload.notes);
    }
    const { data } = await apiClient.post('/driver/license-check/submit', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
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

export const fleetTripApi = {
  async start(payload: { vehicleId: string }) {
    const { data } = await apiClient.post<import('@/features/fleet/types').FleetTripSummary>(
      '/driver/fleet/trips/start',
      payload,
    );
    return data;
  },
  async stop(tripId: string) {
    const { data } = await apiClient.post<import('@/features/fleet/types').FleetTripSummary>(
      `/driver/fleet/trips/${tripId}/stop`,
    );
    return data;
  },
  async appendLocations(
    tripId: string,
    points: import('@/features/fleet/types').FleetTripLocationPointInput[],
  ) {
    const { data } = await apiClient.post<
      import('@/features/fleet/types').FleetTripLocationBatchResponse
    >(`/driver/fleet/trips/${tripId}/locations`, { points });
    return data;
  },
  async list(params?: { vehicleId?: string; from?: string; to?: string }) {
    const { data } = await apiClient.get<import('@/features/fleet/types').FleetTripSummary[]>(
      '/driver/fleet/trips',
      { params },
    );
    return data;
  },
  async getById(tripId: string) {
    const { data } = await apiClient.get<import('@/features/fleet/types').FleetTripDetail>(
      `/driver/fleet/trips/${tripId}`,
    );
    return data;
  },
  async getScore(params?: { from?: string; to?: string }) {
    const { data } = await apiClient.get<import('@/features/fleet/types').FleetDriverScore>(
      '/driver/fleet/score',
      { params },
    );
    return data;
  },
};

export const fleetFuelApi = {
  async create(payload: {
    vehicleId: string;
    liters: number;
    totalCost: number;
    currency?: string;
    odometerKm?: number;
    isFullTank?: boolean;
    enteredAt?: string;
    receipt?: { uri: string; name: string; type: string };
  }) {
    const formData = new FormData();
    formData.append('vehicleId', payload.vehicleId);
    formData.append('liters', String(payload.liters));
    formData.append('totalCost', String(payload.totalCost));
    if (payload.currency) formData.append('currency', payload.currency);
    if (payload.odometerKm != null) formData.append('odometerKm', String(payload.odometerKm));
    if (payload.isFullTank != null) formData.append('isFullTank', String(payload.isFullTank));
    if (payload.enteredAt) formData.append('enteredAt', payload.enteredAt);
    if (payload.receipt) {
      formData.append('receipt', payload.receipt as unknown as Blob);
    }
    const { data } = await apiClient.post<import('@/features/fleet/types').FleetFuelEntry>(
      '/driver/fleet/fuel-entries',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return data;
  },
  async list(params?: { vehicleId?: string; from?: string; to?: string }) {
    const { data } = await apiClient.get<import('@/features/fleet/types').FleetFuelEntry[]>(
      '/driver/fleet/fuel-entries',
      { params },
    );
    return data;
  },
  async getAnalytics(vehicleId: string, params?: { from?: string; to?: string }) {
    const { data } = await apiClient.get<import('@/features/fleet/types').FleetFuelAnalytics>(
      `/driver/fleet/vehicles/${vehicleId}/fuel-analytics`,
      { params },
    );
    return data;
  },
};

export const fleetVehicleApi = {
  async getStatus(vehicleId: string) {
    const { data } = await apiClient.get<import('@/features/fleet/types').FleetVehicleStatus>(
      `/driver/fleet/vehicles/${vehicleId}/status`,
    );
    return data;
  },
  async correctOdometer(vehicleId: string, odometerKm: number) {
    const { data } = await apiClient.post<{
      vehicleId: string;
      plateNumber: string;
      odometerCorrectedKm: number;
      odometerCorrectedAt: string;
    }>(`/driver/fleet/vehicles/${vehicleId}/odometer-correction`, { odometerKm });
    return data;
  },
};
